import { useEffect, useRef, useState } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  keymap,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { Link, useParams } from 'react-router-dom';
import HistoryDialog from '../components/HistoryDialog';
import ShareDialog from '../components/ShareDialog';
import { useCollaboration } from '../hooks/useCollaboration';
import { api } from '../lib/api';

const darkTheme = EditorView.theme(
  {
    '&': {
      color: '#f8fafc',
      backgroundColor: '#0f172a',
      fontSize: '16px',
      height: '100%',
      minHeight: '60vh',
    },
    '.cm-scroller': {
      overflow: 'auto',
      minHeight: '60vh',
    },
    '.cm-content': {
      caretColor: '#38bdf8',
      padding: '16px 0',
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      lineHeight: '1.75rem',
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
      backgroundColor: '#0f172a',
      color: '#64748b',
      border: 'none',
    },
    '.cm-line': {
      padding: '0 8px',
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

  eq(other) {
    return other.name === this.name && other.color === this.color;
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
        const builder = [];
        const peers = getPeers() || [];
        for (const peer of peers) {
          if (!peer || !peer.selection || typeof peer.selection.from !== 'number')
            continue;
          const pos = Math.min(peer.selection.from, view.state.doc.length);
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
        return Decoration.set(builder);
      }
    },
    {
      decorations: (v) => v.decorations,
    },
  );
}

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
  const editorHostRef = useRef();
  const editorViewRef = useRef();
  const [document, setDocument] = useState();
  const [accessRole, setAccessRole] = useState();
  const [error, setError] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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
        EditorView.lineWrapping,
        EditorView.editable.of(role !== 'VIEWER'),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
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
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
        <div>
          <Link
            className="text-sm text-violet-400 hover:text-violet-300 transition"
            to="/dashboard"
          >
            ← Documents
          </Link>
          <h1 className="mt-1 font-semibold">{document.title}</h1>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <ParticipantAvatars peers={peers} />
          <SyncStatus status={status} />
          <button
            className="rounded-lg border border-slate-700 px-3 py-1.5 hover:bg-slate-800 transition"
            onClick={() => setIsHistoryOpen(true)}
          >
            History
          </button>
          {role === 'OWNER' && (
            <button className="primary py-1.5" onClick={() => setIsShareOpen(true)}>
              Share
            </button>
          )}
          <span className="rounded-full bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300">
            {role}
          </span>
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div
          ref={editorHostRef}
          onClick={() => editorViewRef.current?.focus()}
          className="min-h-[65vh] cursor-text rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl transition-colors focus-within:border-slate-700"
        />
      </section>

      {isShareOpen && (
        <ShareDialog documentId={documentId} onClose={() => setIsShareOpen(false)} />
      )}
      {isHistoryOpen && (
        <HistoryDialog
          documentId={documentId}
          onClose={() => setIsHistoryOpen(false)}
        />
      )}
    </main>
  );
}
