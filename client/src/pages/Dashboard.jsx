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
          {documents.map((doc) => (
            <Link
              key={doc.id}
              to={`/documents/${doc.id}`}
              className="group rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-violet-500"
            >
              <p className="mb-10 text-lg font-semibold group-hover:text-violet-300">
                {doc.title}
              </p>
              <p className="text-sm text-slate-400">Owned by {doc.owner.name}</p>
              <p className="mt-1 text-xs text-slate-500">
                Updated {new Date(doc.updatedAt).toLocaleString()}
              </p>
            </Link>
          ))}
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
