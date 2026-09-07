'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Trash2, Image as ImageIcon, MessageSquare } from 'lucide-react';
import Image from 'next/image';

type AdminReview = {
  id: string;
  name: string;
  rating: number;
  text: string | null;
  imageUrl: string | null;
  menuItemId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  replyText?: string | null;
};

type Tab = 'pending' | 'approved' | 'rejected';

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('pending');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const fetchReviews = async (status: Tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews?status=${status}&limit=100`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setReviews((data?.reviews ?? []) as AdminReview[]);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews(tab);
  }, [tab]);

  const pendingCount = useMemo(() => (tab === 'pending' ? reviews.length : 0), [tab, reviews.length]);

  const patchStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActionLoadingId(id);
    try {
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchReviews(tab);
    } finally {
      setActionLoadingId(null);
    }
  };

  const saveReply = async (id: string) => {
    const replyText = replyDrafts[id]?.trim();
    if (!replyText) return;
    setActionLoadingId(id);
    try {
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, replyText }),
      });
      if (!res.ok) throw new Error('Reply failed');
      await fetchReviews(tab);
    } finally {
      setActionLoadingId(null);
    }
  };

  const deleteReview = async (id: string) => {
    if (!confirm('Delete this review permanently?')) return;
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      await fetchReviews(tab);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-black text-white">
          Reviews <span className="flame-text">Moderation</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">Approve, reject, reply to, or remove customer reviews.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-bold capitalize transition ${
              tab === t ? 'bg-[#FF4500] text-white' : 'bg-white/10 text-gray-400 hover:bg-white/15'
            }`}
          >
            {t}{t === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
          </button>
        ))}
      </div>

      <div className="glass rounded-2xl p-6 border border-white/8">
        {loading ? (
          <p className="text-gray-400 text-sm">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-3xl mb-2">⭐</p>
            <p className="text-gray-500 text-sm">No {tab} reviews.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map(r => (
              <div key={r.id} className="rounded-2xl border border-white/8 bg-white/5 p-4 md:p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700] flex items-center justify-center text-sm font-black text-white">
                        {r.name?.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{r.name}</p>
                        <p className="text-xs text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white/90 bg-white/5 border border-white/10 rounded-full px-3 py-1">Rating: {r.rating}/5</span>
                      <span className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                        {r.menuItemId ? `Item: ${r.menuItemId}` : 'Overall experience'}
                      </span>
                    </div>
                    {r.text ? <p className="mt-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{r.text}</p> : null}
                    {r.imageUrl ? (
                      <div className="mt-3 relative w-full max-w-md h-48">
                        <Image src={r.imageUrl} alt="Review attachment" fill sizes="480px" style={{ objectFit: 'cover' }} className="rounded-xl" />
                      </div>
                    ) : null}
                    {r.replyText ? (
                      <div className="mt-4 rounded-xl bg-[#FF4500]/10 border border-[#FF4500]/20 p-3">
                        <p className="text-xs font-bold text-[#FF8C00] mb-1 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Your reply</p>
                        <p className="text-sm text-gray-300">{r.replyText}</p>
                      </div>
                    ) : null}
                    <div className="mt-4 flex gap-2">
                      <input
                        value={replyDrafts[r.id] ?? r.replyText ?? ''}
                        onChange={e => setReplyDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Write a public reply..."
                        className="admin-input flex-1 text-sm"
                      />
                      <button className="admin-button" onClick={() => saveReply(r.id)} disabled={actionLoadingId === r.id}>
                        Reply
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {tab === 'pending' && (
                      <div className="flex items-center gap-2">
                        <button className="admin-button" onClick={() => patchStatus(r.id, 'approved')} disabled={actionLoadingId === r.id}>
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button className="admin-button admin-button-danger" onClick={() => patchStatus(r.id, 'rejected')} disabled={actionLoadingId === r.id}>
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    )}
                    <button className="admin-button admin-button-danger" onClick={() => deleteReview(r.id)} disabled={actionLoadingId === r.id}>
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                    {r.imageUrl && (
                      <span className="text-xs text-gray-500 inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> Attachment</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
