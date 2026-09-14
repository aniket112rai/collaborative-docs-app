import { useState } from 'react';
import { api } from '../lib/api';
export default function ShareDialog({ documentId, onClose }) {
  const [role, setRole] = useState('EDITOR');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  async function create() {
    try {
      const { data } = await api.post(`/documents/${documentId}/invites`, { role });
      setLink(`${location.origin}/join/${data.invite.token}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not create invite');
    }
  }
  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-slate-950/80 p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Share document</h2>
            <p className="mt-1 text-sm text-slate-400">
              Anyone with this link can join with the selected role.
            </p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <label className="mt-5 block text-sm">
          Invite permission
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-2"
          >
            <option value="EDITOR">Can edit</option>
            <option value="VIEWER">Can view</option>
          </select>
        </label>
        {link ? (
          <div className="mt-5">
            <input readOnly value={link} />
            <button
              className="primary mt-2 w-full"
              onClick={() => navigator.clipboard.writeText(link)}
            >
              Copy invite link
            </button>
          </div>
        ) : (
          <button className="primary mt-5 w-full" onClick={create}>
            Create invite link
          </button>
        )}
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      </section>
    </div>
  );
}
