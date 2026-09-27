import { useEffect, useRef, useState } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, StateField, Transaction } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { Link, useNavigate, useParams } from 'react-router-dom';
import HistoryDialog from '../components/HistoryDialog';
import MembersDialog from '../components/MembersDialog';
import ShareDialog from '../components/ShareDialog';
import { useCollaboration } from '../hooks/useCollaboration';
import { api } from '../lib/api';

const LINES_PER_PAGE = 26;

const darkTheme = EditorView.theme(
  {
    '&': {
      color: '#f8fafc',
      backgroundColor: 'transparent',
      fontSize: '16px',
      height: '100%',
      minHeight: '800px',
    },
    '.cm-scroller': {
      overflow: 'visible',
      minHeight: '800px',
    },
    '.cm-content': {
      caretColor: '#38bdf8',
      padding: '0',
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      lineHeight: '1.85rem',
      color: '#f8fafc',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#38bdf8',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: '#3b82f640',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: '#64748b',
      border: 'none',
    },
    '.cm-line': {
      padding: '0',
    },
  },
  { dark: true },
);

class PeerCursorWidget extends WidgetType {
  constructor(name, color) {
    super();
    this.name = name;
    this.color = color;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-peer-caret-container';

    const caret = document.createElement('span');
    caret.className = 'cm-peer-caret';
    caret.style.backgroundColor = this.color;

    const label = document.createElement('span');
    label.className = 'cm-peer-label';
    label.style.backgroundColor = this.color;
    label.textContent = this.name;

    wrap.appendChild(caret);
    wrap.appendChild(label);
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function createPeerCursorsExtension(getPeers) {
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = this.buildDecorations(view);
      }

      update(update) {
        this.decorations = this.buildDecorations(update.view);
      }

      buildDecorations(view) {
        try {
          const builder = [];
          const peers = getPeers() || [];
          const docLen = view.state.doc.length;
          for (const peer of peers) {
            if (!peer || !peer.selection || typeof peer.selection.from !== 'number')
              continue;
            const pos = Math.max(0, Math.min(peer.selection.from, docLen));
            const widget = Decoration.widget({
              widget: new PeerCursorWidget(
                peer.name || 'Collaborator',
                peer.color || '#ec4899',
              ),
              side: 1,
            });
            builder.push(widget.range(pos));
          }
          builder.sort((a, b) => a.from - b.from);
          return Decoration.set(builder, true);
        } catch (e) {
          console.error('Error building peer cursors:', e);
          return Decoration.none;
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

class PageBreakWidget extends WidgetType {
  constructor(pageNum) {
    super();
    this.pageNum = pageNum;
  }

  toDOM() {
    const wrap = document.createElement('div');
    wrap.className = 'doc-page-break-widget';

    const prevBottomPadding = document.createElement('div');
    prevBottomPadding.className = 'doc-page-bottom-padding';

    const prevBottomEdge = document.createElement('div');
    prevBottomEdge.className = 'doc-page-bottom-edge';

    const gap = document.createElement('div');
    gap.className = 'doc-page-gap-banner';
    gap.innerHTML = `<span>PAGE ${this.pageNum}</span>`;

    const nextTopEdge = document.createElement('div');
    nextTopEdge.className = 'doc-page-top-edge';

    const nextTopPadding = document.createElement('div');
    nextTopPadding.className = 'doc-page-top-padding';

    wrap.appendChild(prevBottomPadding);
    wrap.appendChild(prevBottomEdge);
    wrap.appendChild(gap);
    wrap.appendChild(nextTopEdge);
    wrap.appendChild(nextTopPadding);
    return wrap;
  }

  eq(other) {
    return other.pageNum === this.pageNum;
  }

  ignoreEvent() {
    return true;
  }
}

function buildPageBreakDecorations(state) {
  try {
    const builder = [];
    const doc = state.doc;
    for (let lineNo = 1; lineNo <= doc.lines; lineNo++) {
      if (lineNo > 1 && (lineNo - 1) % LINES_PER_PAGE === 0) {
        const line = doc.line(lineNo);
        const pageNum = Math.floor((lineNo - 1) / LINES_PER_PAGE) + 1;
        const widget = Decoration.widget({
          widget: new PageBreakWidget(pageNum),
          side: -1,
          block: true,
        });
        builder.push(widget.range(line.from));
      }
    }
    builder.sort((a, b) => a.from - b.from);
    return Decoration.set(builder, true);
  } catch (e) {
    console.error('Error building page breaks:', e);
    return Decoration.none;
  }
}

const pageBreaksField = StateField.define({
  create(state) {
    return buildPageBreakDecorations(state);
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildPageBreakDecorations(tr.state);
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

function SyncStatus({ status }) {
  const labels = { Offline: '📴 Offline', Saved: '✓ Saved' };
  const label = labels[status] || `⟳ ${status}`;
  const color = status === 'Offline' ? 'text-amber-300' : 'text-emerald-300';

  return <span className={color}>{label}</span>;
}

function ParticipantAvatars({ peers }) {
  const validPeers = (peers || []).filter((peer) => peer && peer.userId && peer.name);

  return (
    <div className="hidden items-center gap-1 sm:flex">
      {validPeers.map((peer) => (
        <span
          key={peer.userId}
          title={`${peer.name} is editing`}
          style={{ backgroundColor: peer.color || '#8b5cf6' }}
          className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white shadow-sm"
        >
          {peer.name[0]?.toUpperCase() || '?'}
        </span>
      ))}
    </div>
  );
}

export default function Editor() {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const editorHostRef = useRef();
  const editorViewRef = useRef();
  const [document, setDocument] = useState();
  const [accessRole, setAccessRole] = useState();
  const [error, setError] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  async function handleRenameSubmit(e) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed || trimmed === document?.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      const { data } = await api.patch(`/documents/${documentId}`, { title: trimmed });
      setDocument((prev) => ({ ...prev, title: data.document.title }));
      setIsEditingTitle(false);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to rename document');
    }
  }

  async function handleDeleteDoc() {
    if (
      !window.confirm(
        `Are you sure you want to delete "${document?.title || 'this document'}"?`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/documents/${documentId}`);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete document');
    }
  }
  const [docStats, setDocStats] = useState({
    words: 0,
    chars: 0,
    lines: 1,
    pages: 1,
    currentPage: 1,
  });

  const {
    doc,
    peers,
    role: realtimeRole,
    sendAwareness,
    status,
  } = useCollaboration(documentId);
  const role = realtimeRole || accessRole;

  const peersRef = useRef(peers);
  useEffect(() => {
    peersRef.current = peers;
    if (editorViewRef.current) {
      editorViewRef.current.dispatch({});
    }
  }, [peers]);

  function updateStats(view) {
    if (!view || !view.state || !view.state.doc) return;
    const text = view.state.doc.toString();
    const lines = view.state.doc.lines;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const pages = Math.max(1, Math.ceil(lines / LINES_PER_PAGE));
    const headPos = view.state.selection?.main?.head || 0;
    const currentLine = view.state.doc.lineAt(headPos).number;
    const currentPage = Math.min(
      pages,
      Math.max(1, Math.floor((currentLine - 1) / LINES_PER_PAGE) + 1),
    );
    setDocStats({ words, chars, lines, pages, currentPage });
  }

  useEffect(() => {
    async function loadDocument() {
      setDocument(undefined);
      setAccessRole(undefined);
      setError('');

      try {
        const { data } = await api.get(`/documents/${documentId}`);
        setDocument(data.document);
        setAccessRole(data.role);
      } catch (requestError) {
        setError(requestError.response?.data?.error || 'Unable to open document');
      }
    }

    loadDocument();
  }, [documentId]);

  useEffect(() => {
    if (!document || !role || !editorHostRef.current) {
      return undefined;
    }

    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    const ytext = doc.getText('content');

    function syncEditorFromYjs(event, transaction) {
      if (transaction && transaction.origin === 'codemirror') {
        return;
      }

      const nextValue = ytext.toString();
      const view = editorViewRef.current;
      if (!view) return;

      const currentValue = view.state.doc.toString();
      if (currentValue !== nextValue) {
        view.dispatch({
          changes: { from: 0, to: currentValue.length, insert: nextValue },
          annotations: Transaction.userEvent.of('yjs'),
        });
        updateStats(view);
      }
    }

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        history(),
        drawSelection(),
        dropCursor(),
        darkTheme,
        createPeerCursorsExtension(() => peersRef.current),
        pageBreaksField,
        EditorView.lineWrapping,
        EditorView.editable.of(role !== 'VIEWER'),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          updateStats(update.view);

          if (
            update.docChanged &&
            !update.transactions.some(
              (tr) => tr.annotation(Transaction.userEvent) === 'yjs',
            )
          ) {
            const newText = update.state.doc.toString();
            doc.transact(() => {
              ytext.delete(0, ytext.length);
              ytext.insert(0, newText);
            }, 'codemirror');
          }

          if (update.selectionSet) {
            sendAwareness({
              from: update.state.selection.main.from,
              to: update.state.selection.main.to,
            });
          }
        }),
      ],
    });

    const editorView = new EditorView({
      state,
      parent: editorHostRef.current,
    });

    editorViewRef.current = editorView;
    updateStats(editorView);
    ytext.observe(syncEditorFromYjs);

    return () => {
      ytext.unobserve(syncEditorFromYjs);
      editorView.destroy();
      editorViewRef.current = null;
    };
  }, [documentId, document, role, doc, sendAwareness]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-rose-300">
        {error}
      </main>
    );
  }

  if (!document) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-200">
        Loading document…
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Main Navigation Header */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-3.5 backdrop-blur z-10">
        <div>
          <Link
            className="text-xs font-medium text-violet-400 hover:text-violet-300 transition"
            to="/dashboard"
          >
            ← Documents
          </Link>
          {isEditingTitle ? (
            <form
              onSubmit={handleRenameSubmit}
              className="flex items-center gap-1.5 mt-0.5"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-sm font-semibold text-slate-100 focus:border-violet-500 focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="rounded bg-violet-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-violet-500 transition"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-base font-semibold">{document.title}</h1>
              {role === 'OWNER' && (
                <button
                  onClick={() => {
                    setNewTitle(document.title);
                    setIsEditingTitle(true);
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
                  title="Rename document"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <ParticipantAvatars peers={peers} />
          <SyncStatus status={status} />
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 hover:bg-slate-800 transition"
            onClick={() => setIsMembersOpen(true)}
          >
            Members
          </button>
          <button
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 hover:bg-slate-800 transition"
            onClick={() => setIsHistoryOpen(true)}
          >
            History
          </button>
          {role === 'OWNER' && (
            <>
              <button className="primary py-1.5" onClick={() => setIsShareOpen(true)}>
                Share
              </button>
              <button
                className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-1.5 text-rose-300 hover:bg-rose-900/60 transition"
                onClick={handleDeleteDoc}
              >
                Delete
              </button>
            </>
          )}
          <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300">
            {role}
          </span>
        </div>
      </header>

      {/* Docs Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/40 px-6 py-2 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="rounded px-2 py-1 bg-slate-800/80 text-slate-300 font-medium">
            100%
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span>Print Layout</span>
          <span className="h-3 w-px bg-slate-800" />
          <span>Paginated View</span>
        </div>
        <div className="flex items-center gap-4">
          <span>
            {docStats.pages} Page{docStats.pages > 1 ? 's' : ''} Document
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {peers?.length || 0} online
          </span>
        </div>
      </div>

      {/* Google Docs Canvas Workspace */}
      <div className="flex-1 overflow-y-auto bg-slate-950 py-10 px-4 flex flex-col items-center scroll-smooth">
        <div
          ref={editorHostRef}
          onClick={() => editorViewRef.current?.focus()}
          className="doc-paper-sheet cursor-text transition-all focus-within:ring-1 focus-within:ring-violet-500/40"
        />
      </div>

      {/* Bottom Status Bar */}
      <footer className="sticky bottom-0 z-10 flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-6 py-2 text-xs text-slate-400 backdrop-blur">
        <div className="flex items-center gap-4">
          <span>
            Page {docStats.currentPage || 1} of {docStats.pages}
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span>{docStats.words} words</span>
          <span className="h-3 w-px bg-slate-800" />
          <span>{docStats.chars} characters</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Real-time Auto-Paginated View</span>
        </div>
      </footer>

      {isShareOpen && (
        <ShareDialog documentId={documentId} onClose={() => setIsShareOpen(false)} />
      )}
      {isHistoryOpen && (
        <HistoryDialog
          documentId={documentId}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
      {isMembersOpen && (
        <MembersDialog
          documentId={documentId}
          currentUserRole={role}
          peers={peers}
          onClose={() => setIsMembersOpen(false)}
        />
      )}
    </main>
  );
}
