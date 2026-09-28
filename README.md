# Collab Notes

Collab Notes is a browser based shared document editor. Users create an account, create documents, and invite other signed-in users as editors or viewers. Document text is synchronized with Yjs over a WebSocket connection and cached in the browser with IndexedDB.

## What the app does

- Register and log in with an email and password. The server hashes passwords with bcrypt and keeps a signed JWT in an HTTP-only cookie.
- Create, list, rename, and delete documents. Owners can create invite links with editor or viewer access, and can remove members.
- Edit together in a paginated paper-style view. The editor is built from HTML textareas; each page displays up to 26 lines. Viewers can read but cannot edit.
- See connected collaborators and their names, colors, and caret positions. Presence is temporary session data sent over the WebSocket connection.
- Review recent edit activity, grouped by author across nearby saved updates. This is an activity list, not a way to restore an earlier document state.
- Continue editing from the local IndexedDB cache while offline. Changes are sent when the connection returns; the status indicator reports connection and sync states.
- Print the document or use the browser's print dialog to save it as a PDF.

## How to use it

1. Open the client, create an account at **Sign up**, or log in.
2. On the dashboard, enter a title and choose **New document**. This creates a document with you as its owner and opens the editor.
3. Type in the page text areas. New pages are added as the document grows; the editor splits its view after every 26 lines.
4. To collaborate, choose **Share**, select **Can edit** or **Can view**, and create an invite link. The recipient must be signed in, open the link, and choose **Join document**. Owners can inspect or remove members from **Members**.
5. Use **History** to review recent edits. Owners can rename or delete a document. Other members can open and read it according to their role.

## Architecture and data flow

```text
React client ── HTTP /api ──> Express routes/controllers ──> Prisma ──> PostgreSQL
     │                               │
     ├── Y.Doc + y-indexeddb         └── JWT cookie authentication / access checks
     │
     └── /ws binary Yjs updates ──> ws collaboration rooms ──> broadcast to peers
                                          │
                                          └── merge and save updates after 3 seconds
```

### Client

`client/src/App.jsx` declares the routes. `AuthContext` loads the current user from `/api/auth/me`; protected routes send signed-out users to the login page. The Axios client sends credentialed requests to `/api`.

The dashboard and editor use the HTTP API for document metadata and membership actions. `useCollaboration` creates a Yjs `Y.Doc` per document and attaches `y-indexeddb` using the key `collab-note:<documentId>`. The editor reads and writes the Yjs text named `content`. Its paginated textarea view computes line, word, character, and page counts locally.

During development Vite proxies `/api` and `/ws` to the server at `localhost:3001`. The WebSocket sends JSON for the initial join and presence messages, and binary Yjs updates for document changes. The client reconnects after a dropped connection and sends its locally cached state after receiving the server's initial state.

### Server

`server/src/index.js` starts one HTTP server with Express routes and attaches the WebSocket server at `/ws`. HTTP authentication is handled by `requireAuth`; the WebSocket verifies the same `collab_token` cookie during connection. The join message includes a document ID, and the server checks document membership before admitting that socket.

`server/src/services/access.js` defines the role capabilities: owners can edit and manage, editors can edit, and viewers can only read. The WebSocket handler rejects binary edits from viewers. Collaboration rooms are held in server memory: each room has a Yjs document, connected sockets, temporary presence, and pending updates. Accepted edits are applied to the room document and broadcast immediately to other room clients. Updates are buffered by author and merged with `Y.mergeUpdates` before being saved as `DocumentUpdate` rows after three seconds of inactivity (or when a client disconnects).

### Database

The Prisma schema in `server/prisma/schema.prisma` defines:

- `User` for account details and password hashes.
- `Document` for title, owner, and timestamps.
- `DocumentMember` for per-document `OWNER`, `EDITOR`, or `VIEWER` access.
- `Invite` for role-bearing invitation tokens with optional expiry and revocation fields.
- `DocumentUpdate` for persisted binary Yjs updates and their author/time metadata.

The server rebuilds a room's Yjs state by loading and applying that document's persisted updates in order. In-memory rooms and pending writes are not shared between server processes. IndexedDB is a local browser cache; PostgreSQL is the shared persistence layer.

## Requirements

- Node.js 18 or newer and npm 9 or newer.
- A running PostgreSQL instance and a database for this app.

## Local setup

1. Create `server/.env` with values for your local database and a private JWT signing secret:

   ```env
   DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/collab_notes?schema=public"
   JWT_SECRET="replace-with-a-long-random-secret"
   PORT=3001
   CLIENT_ORIGIN="http://localhost:5173"
   ```

   `DATABASE_URL` and `JWT_SECRET` are required. `PORT` defaults to `3001`, and `CLIENT_ORIGIN` defaults to `http://localhost:5173`. The server uses `CLIENT_ORIGIN` for credentialed CORS requests. Do not commit real credentials or secrets.

2. From the repository root, install dependencies and generate the Prisma client:

   ```bash
   npm install
   npm run db:generate
   ```

3. Apply the development migration to the database named in `DATABASE_URL`:

   ```bash
   npm run db:migrate
   ```

4. Start both apps:

   ```bash
   npm run dev
   ```

   Open [http://localhost:5173](http://localhost:5173). The Vite development server runs on port 5173 and proxies API and WebSocket traffic to the server on port 3001.

## Commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the client and server together. |
| `npm run dev:client` | Start only the Vite client. |
| `npm run dev:server` | Start only the API and WebSocket server. |
| `npm run db:generate` | Generate Prisma Client. |
| `npm run db:migrate` | Run Prisma's development migration flow. |
| `npm run format` | Format repository files with Prettier. |
| `npm run format:check` | Check formatting with Prettier. |

The server workspace also defines `npm run start` and `npm run prisma:deploy` (run with `-w server` from the root). The client workspace defines `npm run build` (run with `-w client`).

## Source map

```text
client/src/
  App.jsx                     Routes and providers
  context/AuthContext.jsx     Current user and logout
  hooks/useCollaboration.js   Yjs, IndexedDB, WebSocket, reconnect, presence
  lib/api.js                  Credentialed Axios API client
  pages/                      Auth, dashboard, editor, invite acceptance
  components/                 Access, sharing, history, and error UI

server/src/
  index.js                    Express app and HTTP/WebSocket server setup
  auth.js                     JWT and cookie helpers
  middleware/auth.js          HTTP authentication middleware
  routes/                     Auth, documents, and invite endpoints
  controllers/                Request handling and Prisma operations
  collaboration.js            WebSocket rooms and Yjs persistence
  services/access.js          Role and permission helpers
  db.js                       Prisma client

server/prisma/
  schema.prisma               Database models and access roles
  migrations/                 SQL migration history
```
