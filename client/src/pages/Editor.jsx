import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import HistoryDialog from '../components/HistoryDialog';
import MembersDialog from '../components/MembersDialog';
import ShareDialog from '../components/ShareDialog';
import { useAuth } from '../context/AuthContext';
import { useCollaboration } from '../hooks/useCollaboration';
import { api } from '../lib/api';

const LINES_PER_PAGE = 26;

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

function PeerCursorsOverlay({
  pageText = '',
  pageCharStart = 0,
  peers = [],
  currentUserId,
}) {
  const activePeers = (peers || []).filter(
    (p) =>
      p &&
      p.userId &&
      p.userId !== currentUserId &&
      p.selection &&
      typeof p.selection.from === 'number',
  );

  const pageEnd = pageCharStart + pageText.length;
  const pagePeers = activePeers.filter((p) => {
    const globalPos = p.selection.from;
    return globalPos >= pageCharStart && globalPos <= pageEnd;
  });

  if (!pagePeers.length) return null;

  const sortedPeers = pagePeers
    .map((p) => ({
      ...p,
      localPos: Math.max(0, Math.min(p.selection.from - pageCharStart, pageText.length)),
    }))
    .sort((a, b) => a.localPos - b.localPos);

  const elements = [];
  let lastIndex = 0;
  const textLen = pageText.length;

  sortedPeers.forEach((peer) => {
    const pos = peer.localPos;
    if (pos > lastIndex) {
      elements.push(
        <span key={`text-${lastIndex}-${pos}`}>{pageText.slice(lastIndex, pos)}</span>,
      );
    }
    lastIndex = pos;

    elements.push(
      <span
        key={`peer-${peer.userId}`}
        className="relative inline-block h-[1.85rem] w-0 align-top select-none pointer-events-none"
      >
        {/* The anchor has the same height as an editor line, so the caret is
            positioned from the line top rather than from the text baseline. */}
        <span
          style={{ backgroundColor: peer.color || '#ec4899' }}
          className="absolute inset-y-0 -left-px w-[1.5px] rounded-full animate-pulse shadow-xs z-30"
        />
        <span
          style={{ backgroundColor: peer.color || '#ec4899' }}
          className="absolute -top-1 -left-0.5 px-1 py-0.5 rounded-[8px] text-[10px] font-semibold text-white leading-none shadow-sm whitespace-nowrap z-40 pointer-events-none"
        >
          {peer.name || 'Collaborator'}
        </span>
      </span>,
    );
  });

  if (lastIndex < textLen) {
    elements.push(<span key={`text-end`}>{pageText.slice(lastIndex)}</span>);
  }

  return (
    <div
      aria-hidden="true"
      className="absolute top-[64px] left-[64px] right-[64px] sm:top-[72px] sm:left-[72px] sm:right-[72px] bottom-[64px] sm:bottom-[72px] pointer-events-none font-sans text-base leading-[1.85rem] text-transparent whitespace-pre-wrap break-words overflow-hidden no-print z-10"
    >
      {elements}
    </div>
  );
}

export default function Editor() {
  const { id: documentId } = useParams();
  const navigate = useNavigate();
  const textareaRefs = useRef([]);
  const { user } = useAuth();
  const [document, setDocument] = useState();
  const [accessRole, setAccessRole] = useState();
  const [error, setError] = useState('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMembersOpen, setIsMembersOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [textValue, setTextValue] = useState('');

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
  const currentUserId = user?.id;

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

  function updateStats(text, globalCursorPos = 0) {
    const lines = text ? text.split('\n').length : 1;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const pages = Math.max(1, Math.ceil(lines / LINES_PER_PAGE));

    const textBeforeCursor = text.slice(0, globalCursorPos);
    const currentLine = textBeforeCursor.split('\n').length;
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

  // Sync Yjs doc content to local state
  useEffect(() => {
    if (!doc) return;
    const ytext = doc.getText('content');

    const initialText = ytext.toString();
    setTextValue(initialText);
    updateStats(initialText, 0);

    function handleYjsUpdate(event, transaction) {
      if (transaction?.origin === 'local') return;

      const nextText = ytext.toString();
      setTextValue(nextText);
      updateStats(nextText, 0);
    }

    ytext.observe(handleYjsUpdate);
    return () => {
      ytext.unobserve(handleYjsUpdate);
    };
  }, [doc]);

  function handlePageTextChange(idx, e) {
    const newPageText = e.target.value;
    const pageCursorPos = e.target.selectionStart;

    const allLines = textValue.split('\n');
    const startLineIdx = idx * LINES_PER_PAGE;
    const endLineIdx = (idx + 1) * LINES_PER_PAGE;

    const beforeLines = allLines.slice(0, startLineIdx);
    const afterLines = allLines.slice(endLineIdx);
    const newPageLines = newPageText.split('\n');

    const newAllLines = [...beforeLines, ...newPageLines, ...afterLines];
    const newGlobalText = newAllLines.join('\n');

    const beforeCharCount =
      beforeLines.length > 0 ? beforeLines.join('\n').length + 1 : 0;
    const globalCursorPos = beforeCharCount + pageCursorPos;

    setTextValue(newGlobalText);

    if (doc) {
      const ytext = doc.getText('content');
      doc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, newGlobalText);
      }, 'local');
    }

    updateStats(newGlobalText, globalCursorPos);
    sendAwareness({ from: globalCursorPos, to: globalCursorPos });

    // Handle overflow to next page if page lines exceed 26
    if (newPageLines.length > LINES_PER_PAGE) {
      const nextPageIndex = idx + 1;
      requestAnimationFrame(() => {
        const nextEl = textareaRefs.current[nextPageIndex];
        if (nextEl) {
          nextEl.focus();
          const targetPos = Math.max(0, pageCursorPos - (newPageText.length - 20));
          nextEl.setSelectionRange(targetPos, targetPos);
        }
      });
    }
  }

  function handlePageSelectionOrClick(idx, e) {
    const el = e.target;
    if (!el) return;
    const pageCursorPos = el.selectionStart || 0;
    const allLines = textValue.split('\n');
    const startLineIdx = idx * LINES_PER_PAGE;
    const beforeLines = allLines.slice(0, startLineIdx);
    const beforeCharCount =
      beforeLines.length > 0 ? beforeLines.join('\n').length + 1 : 0;
    const globalCursorPos = beforeCharCount + pageCursorPos;

    updateStats(textValue, globalCursorPos);
    sendAwareness({ from: globalCursorPos, to: globalCursorPos });
  }

  function handlePrint() {
    window.print();
  }

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

  const isReadOnly = role === 'VIEWER';
  const allLines = textValue.split('\n');
  const totalPages = Math.max(1, Math.ceil(allLines.length / LINES_PER_PAGE));
  const pageArray = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Main Navigation Header */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-5 py-3.5 backdrop-blur z-10 no-print">
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
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-900/40 px-6 py-2 text-xs text-slate-400 docs-toolbar no-print">
        <div className="flex items-center gap-4">
          <span className="rounded px-2 py-1 bg-slate-800/80 text-slate-300 font-medium">
            100%
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span>Print Layout</span>
          <span className="h-3 w-px bg-slate-800" />
          <span>Paginated View</span>
          <span className="h-3 w-px bg-slate-800" />
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded bg-violet-600/80 hover:bg-violet-600 text-white px-2.5 py-1 text-xs font-medium transition shadow-sm"
            title="Print document or Save as PDF"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H7a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print / Save as PDF
          </button>
        </div>
        <div className="flex items-center gap-4">
          <span>
            {totalPages} Page{totalPages > 1 ? 's' : ''} Document
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span className="flex items-center gap-1.5 rounded-md border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 font-medium text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {peers?.length || 0} online
          </span>
        </div>
      </div>

      {/* Google Docs Canvas Workspace (Uniform white paper pages stacked vertically) */}
      <div className="flex-1 overflow-y-auto doc-workspace py-10 px-4 flex flex-col items-center scroll-smooth">
        <div className="w-full max-w-[816px] relative flex flex-col items-center">
          {pageArray.map((pageNum, idx) => {
            const startLineIdx = idx * LINES_PER_PAGE;
            const endLineIdx = (idx + 1) * LINES_PER_PAGE;
            const pageLines = allLines.slice(startLineIdx, endLineIdx);
            const pageText = pageLines.join('\n');

            const beforeLines = allLines.slice(0, startLineIdx);
            const pageCharStart =
              beforeLines.length > 0 ? beforeLines.join('\n').length + 1 : 0;

            return (
              <div key={pageNum} className="doc-print-page w-full flex flex-col items-center">
                {idx > 0 && (
                  <div className="w-full flex items-center justify-center my-6 no-print doc-page-banner">
                    <span className="rounded-full bg-slate-800 border border-slate-700 px-4 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest shadow-md">
                      PAGE {pageNum} OF {totalPages}
                    </span>
                  </div>
                )}

                <div
                  onClick={() => {
                    const el = textareaRefs.current[idx];
                    if (el) el.focus();
                  }}
                  className="w-full max-w-[816px] h-[1056px] bg-white text-slate-900 rounded-sm doc-paper-shadow relative p-[64px] sm:p-[72px] cursor-text transition-shadow doc-paper-sheet flex flex-col justify-start overflow-hidden"
                >
                  {/* Real-time Peer Caret Cursors Overlay for this page */}
                  <PeerCursorsOverlay
                    pageText={pageText}
                    pageCharStart={pageCharStart}
                    peers={peers}
                    currentUserId={currentUserId}
                  />

                  {/* Textarea for editing page content */}
                  <textarea
                    ref={(el) => (textareaRefs.current[idx] = el)}
                    value={pageText}
                    onChange={(e) => handlePageTextChange(idx, e)}
                    onClick={(e) => handlePageSelectionOrClick(idx, e)}
                    onKeyUp={(e) => handlePageSelectionOrClick(idx, e)}
                    onKeyDown={(e) => handlePageSelectionOrClick(idx, e)}
                    onSelect={(e) => handlePageSelectionOrClick(idx, e)}
                    onFocus={(e) => handlePageSelectionOrClick(idx, e)}
                    readOnly={isReadOnly}
                    placeholder={
                      idx === 0
                        ? isReadOnly
                          ? 'View-only mode…'
                          : 'Type your document content here…'
                        : ''
                    }
                    rows={LINES_PER_PAGE}
                    className="doc-textarea font-sans text-base leading-[1.85rem] text-slate-900 bg-transparent resize-none outline-none w-full h-[769px] overflow-hidden relative z-20"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <footer className="sticky bottom-0 z-10 flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-6 py-2 text-xs text-slate-400 backdrop-blur no-print">
        <div className="flex items-center gap-4">
          <span>
            Page {docStats.currentPage || 1} of {totalPages}
          </span>
          <span className="h-3 w-px bg-slate-800" />
          <span>{docStats.words} words</span>
          <span className="h-3 w-px bg-slate-800" />
          <span>{docStats.chars} characters</span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span>Real-time Google Docs View</span>
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
