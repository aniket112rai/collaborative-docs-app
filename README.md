# Collaborative Notes

Offline-first collaborative notes built with React, Express, PostgreSQL/Prisma, Yjs, IndexedDB and WebSockets.

## Start locally

1. Copy `.env.example` to `server/.env` and set a PostgreSQL `DATABASE_URL` and `JWT_SECRET`.
2. Run `npm install`.
3. Run `npm run db:generate`, then `npm run db:migrate`.
4. Run `npm run dev` and open `http://localhost:5173`.

## Commands

```bash
# Install dependencies
npm install

# Generate Prisma client and apply local development migrations
npm run db:generate
npm run db:migrate

# Start the API and Vite client together
npm run dev
```

The API intentionally starts without Node's built-in watch mode. This avoids the
macOS file-watch limit that can otherwise prevent the WebSocket server from starting.

For a production deployment, use `npm run prisma:deploy -w server` instead of the
development migration command, then run `npm run build -w client`.

The editor uses Yjs updates over WebSockets. PostgreSQL stores metadata, access control, invitations and append-only Yjs updates; IndexedDB keeps a local replica for offline editing.

## Current implementation

- Cookie-based register, login, logout and session endpoints
- Protected document dashboard and document membership roles
- WebSocket document rooms with server-side membership checks and incremental Yjs updates
- Local IndexedDB replicas and automatic reconnection in the browser

Sharing UI, awareness cursors, invite consumption screens, version history and compaction of old update records are the next implementation milestones.
