import { useCallback, useEffect, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

function getWebSocketUrl() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  if (location.port === '5173') {
    return `${protocol}://${location.hostname}:3001/ws`;
  }
  return `${protocol}://${location.host}/ws`;
}

export function useCollaboration(documentId) {
  const documentRef = useRef();
  const socketRef = useRef();
  const [status, setStatus] = useState(navigator.onLine ? 'Connecting…' : 'Offline');
  const [role, setRole] = useState();
  const [peers, setPeers] = useState([]);

  if (documentRef.current?.id !== documentId) {
    documentRef.current = {
      id: documentId,
      ydoc: new Y.Doc(),
    };
  }

  useEffect(() => {
    setRole(undefined);
    setPeers([]);
    setStatus(navigator.onLine ? 'Connecting…' : 'Offline');

    const { ydoc } = documentRef.current;
    const persistence = new IndexeddbPersistence(`collab-note:${documentId}`, ydoc);
    let socket;
    let reconnectTimer;
    let isOnline = navigator.onLine;

    function setPeerPresence(message) {
      if (!message) return;

      if (message.event === 'leave') {
        if (!message.userId) return;
        setPeers((currentPeers) =>
          currentPeers.filter((peer) => peer && peer.userId !== message.userId),
        );
        return;
      }

      if (!message.user || !message.user.userId) return;

      setPeers((currentPeers) => [
        ...currentPeers.filter((peer) => peer && peer.userId !== message.user.userId),
        message.user,
      ]);
    }

    function handleMessage({ data }) {
      if (typeof data !== 'string') {
        Y.applyUpdate(ydoc, new Uint8Array(data), 'remote');
        setStatus('Saved');
        return;
      }

      const message = JSON.parse(data);

      if (message.type === 'ready') {
        const initialUpdate = Uint8Array.from(atob(message.state), (character) =>
          character.charCodeAt(0),
        );

        Y.applyUpdate(ydoc, initialUpdate, 'remote');
        setRole(message.role);
        setPeers(message.peers || []);
        setStatus('Saved');

        const localState = Y.encodeStateAsUpdate(ydoc);
        if (localState.length > 2 && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(localState);
        }
      }

      if (message.type === 'presence') {
        setPeerPresence(message);
      }
    }

    function connect() {
      if (!isOnline) {
        return;
      }

      setStatus('Connecting…');
      socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'join', documentId }));
      };
      socket.onmessage = handleMessage;
      socket.onclose = () => {
        if (!isOnline) {
          return;
        }

        setStatus('Reconnecting…');
        reconnectTimer = window.setTimeout(connect, 1500);
      };
    }

    function sendUpdate(bytes, origin) {
      if (origin === 'remote') {
        return;
      }

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(bytes);
        setStatus('Syncing…');
      } else {
        setStatus('Offline');
      }
    }

    function handleOnline() {
      isOnline = true;
      connect();
    }

    function handleOffline() {
      isOnline = false;
      socket?.close();
      setStatus('Offline');
    }

    ydoc.on('update', sendUpdate);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();

    return () => {
      ydoc.off('update', sendUpdate);
      persistence.destroy();
      socket?.close();
      window.clearTimeout(reconnectTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [documentId]);

  const sendAwareness = useCallback((selection) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    socketRef.current.send(JSON.stringify({ type: 'awareness', selection }));
  }, []);

  return {
    doc: documentRef.current.ydoc,
    peers,
    role,
    sendAwareness,
    status,
  };
}
