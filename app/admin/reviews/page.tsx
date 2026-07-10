'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Trash2, Image as ImageIcon } from 'lucide-react';

type AdminReview = {
  id: string;
  name: string;
  rating: number;
  text: string | null;
  imageUrl: string | null;
  menuItemId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reviews?status=pending', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP_${res.status}`);
      }

      const data = await res.json();
      setReviews((data?.reviews ?? []) as AdminReview[]);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pendingCount = useMemo(() => reviews.length, [reviews.length]);

  const patchStatus = async (id: string, status: 'approved' | 'rejected') => {
    setActionLoadingId(id);
    try {
      const res = await fetch('/api/reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP_${res.status}`);
      }

      await fetchPending();
    } catch {
      // keep list intact on failure
    } finally {
      setActionLoadingId(null);
    }
  };

  const deleteReview = async (id: string) => {
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP_${res.status}`);
      }

      await fetchPending();
    } catch {
      // keep list intact on failure
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-2xl font-black text-white">
          Reviews <span className="flame-text">Moderation</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Pending submissions (overall + item ratings). {pendingCount > 0 ? `(${pendingCount})` : ''}
        </p>
      </div>

      <div className="glass rounded-2xl p-6 border border-white/8">
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : reviews.length === 0 ? (
          <p className="text-gray-500 text-sm">No reviews to moderate yet.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-white/8 bg-white/5 p-4 md:p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700] flex items-center justify-center text-sm font-black text-white">
                        {r.name?.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate">{r.name}</p>
                        <p className="text-xs text-gray-500">
                          {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-white/90 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                        Rating: {r.rating}/5
                      </span>
                      {r.menuItemId ? (
                        <span className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                          Item: {r.menuItemId}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                          Overall experience
                        </span>
                      )}
                    </div>

                    {r.text ? (
                      <p className="mt-3 text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {r.text}
                      </p>
                    ) : null}

                    {r.imageUrl ? (
                      <div className="mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.imageUrl}
                          alt="Review attachment"
                          className="w-full max-w-md rounded-xl border border-white/10"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <button
                        className="admin-button"
                        onClick={() => patchStatus(r.id, 'approved')}
                        disabled={actionLoadingId === r.id}
                        aria-label={`Approve review ${r.id}`}
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        className="admin-button admin-button-danger"
                        onClick={() => patchStatus(r.id, 'rejected')}
                        disabled={actionLoadingId === r.id}
                        aria-label={`Reject review ${r.id}`}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>

                    <button
                      className="admin-button admin-button-danger"
                      onClick={() => deleteReview(r.id)}
                      disabled={actionLoadingId === r.id}
                      aria-label={`Delete review ${r.id}`}
                      title="Delete permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>

                    {actionLoadingId === r.id ? (
                      <p className="text-xs text-gray-400">Working…</p>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {r.imageUrl ? (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="w-3.5 h-3.5" />
                            Attachment
                          </span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
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


