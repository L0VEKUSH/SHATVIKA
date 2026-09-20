'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronLeft, ChevronRight, Inbox, RotateCcw } from 'lucide-react';
import { apiRequest } from '@/lib/apiClient';

type ContactStatus = 'new' | 'read' | 'replied';
type StatusFilter = 'all' | ContactStatus;

type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  status: ContactStatus;
  adminNote: string | null;
  handledAt: string | null;
  createdAt: string;
};

type ContactResponse = {
  messages: ContactMessage[];
  total: number;
  page: number;
  pages: number;
};

const statuses: StatusFilter[] = ['all', 'new', 'read', 'replied'];

export default function AdminContactsPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ status, page: String(page), limit: '25' });
      const data = await apiRequest<ContactResponse>(`/api/contact?${query.toString()}`);
      setMessages(data.messages);
      setTotal(data.total);
      setPages(data.pages);
      setNotes(Object.fromEntries(data.messages.map(message => [message.id, message.adminNote ?? ''])));
    } catch (requestError) {
      setMessages([]);
      setError(requestError instanceof Error ? requestError.message : 'Contact messages could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateMessage = async (id: string, nextStatus: ContactStatus) => {
    if (savingId) return;
    setSavingId(id);
    setError(null);
    try {
      await apiRequest('/api/contact', {
        method: 'PATCH',
        body: { id, status: nextStatus, adminNote: notes[id]?.trim() || null },
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The follow-up record could not be saved.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Contact <span className="flame-text">follow-up</span></h1>
          <p className="mt-1 text-sm text-gray-500">Authorized customer-message access with auditable status and internal notes. This records follow-up; it does not send email.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="admin-button self-start">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="Filter messages by status">
        {statuses.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { setStatus(option); setPage(1); }}
            aria-pressed={status === option}
            className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${status === option ? 'bg-[#FF4500] text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'}`}
          >
            {option}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}

      <section className="glass overflow-hidden rounded-2xl border border-white/8" aria-busy={loading}>
        <div className="border-b border-white/8 px-5 py-4 text-sm text-gray-400">{loading ? 'Loading messages…' : `${total} message${total === 1 ? '' : 's'}`}</div>
        {!loading && messages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-gray-500">
            <Inbox className="h-8 w-8" aria-hidden="true" />
            <p>No messages match this filter.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/8">
            {messages.map(message => (
              <article key={message.id} className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-white">{message.name}</h2>
                    <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-semibold capitalize text-gray-300">{message.subject}</span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${message.status === 'new' ? 'bg-orange-500/15 text-orange-300' : message.status === 'replied' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/15 text-blue-300'}`}>{message.status}</span>
                  </div>
                  <p className="mt-1 break-all text-xs text-gray-500">{message.email}{message.phone ? ` · ${message.phone}` : ''}</p>
                  <p className="mt-1 text-xs text-gray-600">Received {new Date(message.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-gray-200">{message.message}</p>
                </div>
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-500" htmlFor={`note-${message.id}`}>Internal follow-up note</label>
                  <textarea
                    id={`note-${message.id}`}
                    value={notes[message.id] ?? ''}
                    onChange={event => setNotes(current => ({ ...current, [message.id]: event.target.value }))}
                    maxLength={1000}
                    rows={4}
                    className="admin-input w-full resize-y text-sm"
                    placeholder="Record the action taken; this is not sent to the customer."
                  />
                  <div className="flex flex-wrap gap-2">
                    {message.status !== 'read' ? <button type="button" className="admin-button" disabled={savingId === message.id} onClick={() => void updateMessage(message.id, 'read')}>Mark read</button> : null}
                    <button type="button" className="admin-button" disabled={savingId === message.id} onClick={() => void updateMessage(message.id, 'replied')}>
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Record replied
                    </button>
                    {message.status !== 'new' ? <button type="button" className="admin-button" disabled={savingId === message.id} onClick={() => void updateMessage(message.id, 'new')}>Reopen</button> : null}
                  </div>
                  {message.handledAt ? <p className="text-xs text-gray-600">Last handled {new Date(message.handledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p> : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {pages > 1 ? (
        <nav className="flex items-center justify-end gap-3" aria-label="Contact message pages">
          <button type="button" className="admin-button" onClick={() => setPage(current => Math.max(1, current - 1))} disabled={page <= 1 || loading}><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</button>
          <span className="text-sm text-gray-400">Page {page} of {pages}</span>
          <button type="button" className="admin-button" onClick={() => setPage(current => Math.min(pages, current + 1))} disabled={page >= pages || loading}>Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
        </nav>
      ) : null}
    </motion.div>
  );
}
