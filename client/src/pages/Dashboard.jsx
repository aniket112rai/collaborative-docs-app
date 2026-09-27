import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const load = () =>
    api
      .get('/documents')
      .then(({ data }) => setDocuments(data.documents))
      .catch(() => setError('Could not load documents.'));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      const { data } = await api.post('/documents', { title });
      navigate(`/documents/${data.document.id}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Unable to create document');
    }
  }
  async function handleDelete(e, docId, docTitle) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete "${docTitle}"?`)) return;
    try {
      await api.delete(`/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to delete document');
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/dashboard" className="font-bold tracking-tight">
          ✦ Collab Notes
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-300">
          <span>{user.name}</span>
          <button onClick={logout} className="text-slate-400 hover:text-white">
            Log out
          </button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-violet-400 font-medium">YOUR WORKSPACE</p>
            <h1 className="mt-2 text-4xl font-bold">Notes that move with your team.</h1>
          </div>
          <form onSubmit={create} className="flex gap-2">
            <input
              aria-label="New document title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New document title"
              required
            />
            <button className="primary">New document</button>
          </form>
        </div>
        {error && <p className="mb-5 text-rose-400">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const isOwner = doc.ownerId === user.id || doc.owner?.id === user.id;
            return (
              <Link
                key={doc.id}
                to={`/documents/${doc.id}`}
                className="group relative rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-violet-500"
              >
                <div className="flex items-start justify-between gap-2 mb-10">
                  <p className="text-lg font-semibold group-hover:text-violet-300">
                    {doc.title}
                  </p>
                  {isOwner && (
                    <button
                      onClick={(e) => handleDelete(e, doc.id, doc.title)}
                      className="rounded p-1 text-slate-500 hover:bg-rose-950/50 hover:text-rose-400 transition"
                      title="Delete document"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-sm text-slate-400">
                  {doc.lastEditorName
                    ? `Updated by ${doc.lastEditorName}`
                    : `Owned by ${doc.owner.name}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Updated {new Date(doc.updatedAt).toLocaleString()}
                </p>
              </Link>
            );
          })}
          {documents.length === 0 && (
            <p className="text-slate-400">
              Create your first document to begin collaborating.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
