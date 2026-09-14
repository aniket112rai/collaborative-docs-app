# 📝 CollabNotes - Real-Time Collaborative Document Editor

A high-performance, offline-first collaborative document editing platform inspired by Google Docs. Built with **React 19**, **CodeMirror 6**, **Yjs (CRDT)**, **WebSockets**, **Prisma ORM**, and **PostgreSQL**.

---

## ✨ Features

- ⚡ **Sub-Millisecond Real-Time Collaboration**: Powered by Yjs Conflict-Free Replicated Data Types (CRDT) transferred over raw WebSocket binary streams.
- 👥 **Live Presence & Multi-User Cursors**: See collaborators' live caret positions with author badges and dynamic color palettes in real-time.
- 📄 **Google Docs Paginated View**:
  - Automatic page creation as document content grows (26 lines per page).
  - Uniform paper sheet styling with floating shadows, rounded paper edges, and canvas gap banners (`PAGE 2`, `PAGE 3`, etc.).
  - Dynamic active page tracking in the status bar (`Page X of Y`).
- ⏳ **Intelligent Version History**: Edits are automatically grouped by author within sliding 3-minute windows into clear revision milestones.
- 💾 **Offline-First & Debounced Persistence**:
  - Local browser persistence via `y-indexeddb` for offline editing & instant load.
  - In-memory WebSocket update buffer with 3-second debounced compaction (`Y.mergeUpdates`) to minimize database writes.
- 🔒 **Authentication & Granular Access Control**:
  - Secure HTTP-only cookie JWT authentication.
  - Document roles (`OWNER`, `EDITOR`, `VIEWER`).
  - Token-based invite sharing system.

---

## 🛠️ Tech Stack

### **Frontend (`/client`)**

- **Framework**: React 19 + Vite 6
- **Editor Engine**: CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`)
- **CRDT / State**: Yjs (`yjs`), `y-indexeddb`
- **Styling**: TailwindCSS 3 + Custom CSS Layout System
- **Routing & HTTP**: React Router 7, Axios

### **Backend (`/server`)**

- **Runtime**: Node.js + Express 4
- **WebSockets**: `ws`
- **Database & ORM**: PostgreSQL + Prisma ORM 6
- **CRDT Engine**: `yjs` (server-side state merging and binary update encoding)
- **Security**: `jsonwebtoken`, `bcryptjs`, `cookie-parser`, `express-rate-limit`

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js**: `v18.x` or higher
- **npm**: `v9.x` or higher
- **PostgreSQL**: Local or hosted database instance

### 2. Environment Setup

Create a `.env` file in the `server` directory:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/collab_notes?schema=public"
JWT_SECRET="your_secure_jwt_secret_key"
PORT=3001
CLIENT_URL="http://localhost:5173"
```

### 3. Installation & Database Migration

```bash
# Install dependencies across all npm workspaces
npm install

# Generate Prisma client for the server
npm run db:generate

# Run database migrations
npm run db:migrate
```

### 4. Start Development Server

```bash
# Start both server (port 3001) and Vite client (port 5173) concurrently
npm run dev
```

Open your browser at **`http://localhost:5173`** to use the app.

---

## 📁 Project Structure

```
collabrative docs app/
├── package.json               # Root monorepo configuration (npm workspaces)
├── client/                    # React 19 Frontend
│   ├── src/
│   │   ├── components/        # ErrorBoundary, ShareDialog, HistoryDialog
│   │   ├── context/           # AuthContext (user session provider)
│   │   ├── hooks/             # useCollaboration (Yjs & WebSocket hook)
│   │   ├── lib/               # Axios API instance
│   │   ├── pages/             # AuthPage, Dashboard, Editor, Join
│   │   ├── App.jsx            # React router definitions
│   │   └── styles.css         # Document paper sheets & CodeMirror styles
│   └── vite.config.js
└── server/                    # Express + WebSocket API
    ├── prisma/
    │   └── schema.prisma      # User, Document, DocumentMember, DocumentUpdate models
    └── src/
        ├── collaboration.js   # WebSocket room management & debounced DB persistence
        ├── index.js           # Express app & HTTP/WS server initialization
        ├── middleware/        # JWT authentication middleware
        └── routes/            # Auth, Document, and Share endpoints
```

---

## 🔄 Architecture & Data Flow

```
+-------------------+             WebSocket Binary Delta           +-------------------+
|  Client Browser A | <==========================================> |  WebSocket Server |
| (CodeMirror 6)    |                                              |  (Node.js / ws)   |
+-------------------+                                              +-------------------+
          |                                                                  ||
     y-indexeddb                                                    3s Debounced Merge
  (Offline Cache)                                                            ||
          v                                                                  v
+-------------------+                                              +-------------------+
|    IndexedDB      |                                              |  PostgreSQL DB    |
+-------------------+                                              +-------------------+
```

1. **Client Operations**: User edits trigger CodeMirror changes which are applied to the local `Y.Doc`.
2. **Instant Sync**: Yjs update diffs are instantly broadcast as raw binary buffers over WebSocket connections (<1ms latency).
3. **Presence & Awareness**: Cursor selections and peer names are broadcast over JSON awareness messages.
4. **Server Persistence**: Binary updates are buffered in-memory per author and merged every 3 seconds into PostgreSQL using `Y.mergeUpdates`.

---

## 📜 Available Scripts

| Command               | Description                          |
| :-------------------- | :----------------------------------- |
| `npm run dev`         | Start server & client concurrently   |
| `npm run dev:server`  | Start server only                    |
| `npm run dev:client`  | Start client only                    |
| `npm run db:generate` | Generate Prisma ORM client           |
| `npm run db:migrate`  | Run development database migrations  |
| `npm run format`      | Format workspace code using Prettier |

---

## 📄 License

MIT License. Built for real-time collaborative web application performance.
