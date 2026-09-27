import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export default function MembersDialog({
  documentId,
  currentUserRole,
  peers = [],
  onClose,
}) {
  const [members, setMembers] = useState();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'live'
  const { user } = useAuth();
  const isOwner = currentUserRole === 'OWNER';

  const onlineUserIds = new Set((peers || []).map((p) => p?.userId).filter(Boolean));

  useEffect(() => {
    api
      .get(`/documents/${documentId}/members`)
      .then(({ data }) => setMembers(data.members))
      .catch((err) => {
        setError(err.response?.data?.error || 'Could not load members');
        setMembers([]);
      });
  }, [documentId]);

  async function handleRemoveMember(userId, userName) {
    if (
      !window.confirm(`Are you sure you want to remove ${userName} from this document?`)
    ) {
      return;
    }
    try {
      await api.delete(`/documents/${documentId}/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove member');
    }
  }

  const getRoleBadge = (role) => {
    switch (role) {
      case 'OWNER':
        return (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">
            Owner
          </span>
        );
      case 'EDITOR':
        return (
          <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2.5 py-0.5 text-xs font-medium text-violet-400">
            Editor
          </span>
        );
      case 'VIEWER':
      default:
        return (
          <span className="rounded-full bg-slate-800 border border-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            Viewer
          </span>
        );
    }
  };

  const liveCount = (members || []).filter((m) => onlineUserIds.has(m.userId)).length;
  const visibleMembers = (members || []).filter(
    (m) => filter === 'all' || onlineUserIds.has(m.userId),
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-5 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Document members</h2>
            <p className="mt-1 text-sm text-slate-400">
              People with access to this document and their real-time status.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-xl font-medium transition"
          >
            ×
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="mt-4 flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              filter === 'all'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Members ({members?.length || 0})
          </button>
          <button
            onClick={() => setFilter('live')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition ${
              filter === 'live'
                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                : 'text-slate-400 hover:text-emerald-400'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live Online ({liveCount})
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

        <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
          {!members ? (
            <p className="text-sm text-slate-400">Loading members…</p>
          ) : visibleMembers.length ? (
            visibleMembers.map((member) => {
              const isOnline = onlineUserIds.has(member.userId);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {member.user?.name || 'Unknown User'}
                      </p>
                      {isOnline ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-400"
                          title="Currently active in document"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center rounded-full bg-slate-900 border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500"
                          title="Offline"
                        >
                          Offline
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {member.user?.email || ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(member.role)}
                    {isOwner &&
                      member.userId !== user?.id &&
                      member.role !== 'OWNER' && (
                        <button
                          onClick={() =>
                            handleRemoveMember(
                              member.userId,
                              member.user?.name || 'this member',
                            )
                          }
                          className="rounded border border-rose-900/60 bg-rose-950/40 px-2 py-1 text-xs font-medium text-rose-300 hover:bg-rose-900/60 transition"
                          title="Remove member"
                        >
                          Remove
                        </button>
                      )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-slate-400">
              {filter === 'live'
                ? 'No members are currently online.'
                : 'No members found.'}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
