import { useEffect, useState } from 'react';
import { api } from '../lib/api';
export default function HistoryDialog({ documentId, onClose }) {
  const [events, setEvents] = useState();
  useEffect(() => {
    api
      .get(`/documents/${documentId}/history`)
      .then(({ data }) => setEvents(data.events))
      .catch(() => setEvents([]));
  }, [documentId]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-5">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex justify-between">
          <div>
            <h2 className="text-lg font-bold">Version history</h2>
            <p className="text-sm text-slate-400">Recent collaborative changes</p>
          </div>
          <button onClick={onClose}>×</button>
        </div>
        <div className="mt-5 max-h-80 space-y-3 overflow-auto">
          {!events ? (
            <p>Loading history…</p>
          ) : events.length ? (
            events.map((event) => (
              <div key={event.id} className="border-l-2 border-violet-500 pl-3">
                <p className="text-sm font-medium">
                  {event.author} edited{' '}
                  {event.count > 1 ? `(${event.count} updates)` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-400">No edits recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
