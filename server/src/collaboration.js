import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import { prisma } from './db.js';
import { tokenFromCookie, verifyToken } from './auth.js';
import { canEdit, documentRole } from './services/access.js';

const rooms = new Map();
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
    pendingUpdates: [],
    lastAuthorId: null,
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
  if (!room.pendingUpdates || room.pendingUpdates.length === 0) return;

  const updatesToFlush = room.pendingUpdates;
  const authorId = room.lastAuthorId;
  room.pendingUpdates = [];
  room.lastAuthorId = null;

  try {
    const merged = Y.mergeUpdates(updatesToFlush);
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
      'Debounced DB save error (realtime sync unaffected):',
      dbError.message,
    );
  }
}

function scheduleDebouncedFlush(documentId, room, authorId) {
  room.lastAuthorId = authorId;
  if (room.flushTimer) {
    clearTimeout(room.flushTimer);
  }
  room.flushTimer = setTimeout(() => {
    flushRoomUpdates(documentId, room);
  }, 3000);
}

export function attachCollaboration(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (socket, request) => {
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

        json(socket, {
          type: 'ready',
          state: Buffer.from(Y.encodeStateAsUpdate(room.doc)).toString('base64'),
          role,
          peers: [...room.presence.values()],
        });

        room.presence.set(auth.sub, {
          userId: auth.sub,
          name: user?.name || 'Collaborator',
          color: '#8b5cf6',
        });

        broadcast(
          room,
          JSON.stringify({
            type: 'presence',
            event: 'join',
            user: room.presence.get(auth.sub),
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

              // 2. Buffer update in memory & schedule debounced DB save (3 seconds pause)
              room.pendingUpdates.push(update);
              scheduleDebouncedFlush(documentId, room, auth.sub);
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
          room.presence.delete(auth.sub);

          // Flush any pending updates when all clients disconnect or socket closes
          if (room.pendingUpdates.length > 0) {
            flushRoomUpdates(documentId, room);
          }

          broadcast(
            room,
            JSON.stringify({ type: 'presence', event: 'leave', userId: auth.sub }),
          );
        });
      } catch {
        socket.close(4400, 'Invalid collaboration request');
      }
    });
  });
}
