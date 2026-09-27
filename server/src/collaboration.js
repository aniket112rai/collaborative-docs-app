import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { prisma } from './db.js';
import { tokenFromCookie, verifyToken } from './auth.js';
import { canEdit, documentRole } from './services/access.js';

const rooms = new Map();
const PALETTE = [
  '#8b5cf6',
  '#ec4899',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#06b6d4',
  '#a855f7',
];

function getAuthorColor(authorId) {
  let hash = 0;
  for (let i = 0; i < (authorId || '').length; i++) {
    hash = (hash << 5) - hash + authorId.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const json = (socket, data) => socket.send(JSON.stringify(data));
const broadcast = (room, data, except) =>
  room.clients.forEach((client) => {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(data);
  });

async function getRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  const doc = new Y.Doc();
  const updates = await prisma.documentUpdate.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'asc' },
    select: { update: true },
  });
  updates.forEach(({ update }) => Y.applyUpdate(doc, update));
  const room = {
    doc,
    clients: new Set(),
    presence: new Map(),
    pendingUpdatesByAuthor: new Map(),
    flushTimer: null,
  };
  rooms.set(id, room);
  return room;
}

async function flushRoomUpdates(documentId, room) {
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
    room.flushTimer = null;
  }

  if (!room.pendingUpdatesByAuthor || room.pendingUpdatesByAuthor.size === 0) return;

  const entriesToFlush = Array.from(room.pendingUpdatesByAuthor.entries());
  room.pendingUpdatesByAuthor.clear();

  for (const [authorId, updates] of entriesToFlush) {
    if (!updates || updates.length === 0) continue;
    try {
      const merged = Y.mergeUpdates(updates);
      await prisma.documentUpdate.create({
        data: {
          documentId,
          authorId,
          update: Buffer.from(merged),
        },
      });
      await prisma.document.update({
        where: { id: documentId },
        data: { updatedAt: new Date() },
      });
    } catch (dbError) {
      console.error(
        `Debounced DB save error for author ${authorId} (realtime sync unaffected):`,
        dbError.message,
      );
    }
  }
}

function scheduleDebouncedFlush(documentId, room) {
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
  }
  room.flushTimer = setTimeout(() => {
    flushRoomUpdates(documentId, room);
  }, 3000);
}

export function attachCollaboration(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((socket) => {
      if (socket.isAlive === false) {
        return socket.terminate();
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 15000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  wss.on('connection', async (socket, request) => {
    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    let auth;
    try {
      auth = verifyToken(tokenFromCookie(request.headers.cookie));
    } catch {
      socket.close(4401, 'Authentication required');
      return;
    }
    socket.once('message', async (raw, binary) => {
      try {
        if (binary) throw new Error('Join message must be JSON');
        const { type, documentId } = JSON.parse(raw.toString());
        if (type !== 'join' || !documentId) throw new Error('Invalid join');
        const role = await documentRole(documentId, auth.sub);
        if (!role) {
          socket.close(4403, 'No document access');
          return;
        }
        const user = await prisma.user.findUnique({
          where: { id: auth.sub },
          select: { id: true, name: true },
        });
        const room = await getRoom(documentId);
        room.clients.add(socket);
        socket.room = room;
        socket.documentId = documentId;
        socket.role = role;
        socket.userId = auth.sub;

        const color = getAuthorColor(auth.sub);
        const presenceUser = {
          userId: auth.sub,
          name: user?.name || 'Collaborator',
          color,
        };

        room.presence.set(auth.sub, presenceUser);

        json(socket, {
          type: 'ready',
          state: Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64'),
          role,
          peers: [...room.presence.values()],
        });

        broadcast(
          room,
          JSON.stringify({
            type: 'presence',
            event: 'join',
            user: presenceUser,
          }),
          socket,
        );

        socket.on('message', async (message, isBinary) => {
          try {
            if (isBinary) {
              if (!canEdit(socket.role)) return;
              const update = new Uint8Array(message);
              Y.applyUpdate(room.doc, update);

              // 1. Broadcast immediately to all connected clients in the room
              broadcast(room, update, socket);

              // 2. Buffer update by author ID in memory & schedule debounced DB save
              if (!room.pendingUpdatesByAuthor.has(auth.sub)) {
                room.pendingUpdatesByAuthor.set(auth.sub, []);
              }
              room.pendingUpdatesByAuthor.get(auth.sub).push(update);
              scheduleDebouncedFlush(documentId, room);
            } else {
              const payload = JSON.parse(message.toString());
              if (payload.type === 'awareness') {
                const current = room.presence.get(auth.sub);
                if (current) {
                  const presence = {
                    ...current,
                    selection: payload.selection,
                  };
                  room.presence.set(auth.sub, presence);
                  broadcast(
                    room,
                    JSON.stringify({
                      type: 'presence',
                      event: 'update',
                      user: presence,
                    }),
                    socket,
                  );
                }
              }
            }
          } catch (err) {
            console.error(
              'Error processing collaboration socket message:',
              err.message,
            );
          }
        });

        socket.on('close', () => {
          room.clients.delete(socket);

          const hasOtherSockets = Array.from(room.clients).some(
            (client) => client.userId === auth.sub,
          );

          if (!hasOtherSockets) {
            room.presence.delete(auth.sub);
            broadcast(
              room,
              JSON.stringify({ type: 'presence', event: 'leave', userId: auth.sub }),
            );
          }

          if (room.pendingUpdatesByAuthor.size > 0) {
            flushRoomUpdates(documentId, room);
          }
        });
      } catch {
        socket.close(4400, 'Invalid collaboration request');
      }
    });
  });
}
