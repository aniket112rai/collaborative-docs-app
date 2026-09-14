import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
export default function Join() {
  const { token } = useParams();
  const [invite, setInvite] = useState();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    api
      .get(`/invites/${token}`)
      .then(({ data }) => setInvite(data.invite))
      .catch((e) => setError(e.response?.data?.error || 'Invite unavailable'));
  }, [token]);
  async function accept() {
    try {
      const { data } = await api.post(`/invites/${token}/join`);
      navigate(`/documents/${data.documentId}`);
    } catch (e) {
      setError(e.response?.data?.error || 'Could not join document');
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8">
        {error ? (
          <p className="text-rose-300">{error}</p>
        ) : !invite ? (
          <p>Checking invite…</p>
        ) : (
          <>
            <p className="text-violet-400">DOCUMENT INVITATION</p>
            <h1 className="mt-2 text-2xl font-bold">Join “{invite.document.title}”</h1>
            <p className="mt-3 text-slate-400">
              You’ll join as an {invite.role.toLowerCase()}.
            </p>
            <button className="primary mt-6 w-full" onClick={accept}>
              Join document
            </button>
          </>
        )}
      </section>
    </main>
  );
}
