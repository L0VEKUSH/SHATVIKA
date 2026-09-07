"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Send, AlertCircle, ThumbsUp, ImagePlus, LogIn } from 'lucide-react';
import Link from 'next/link';
import type { Review } from '@/types';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';

/* ── Utilities ─────────────────────────────────── */
function Stars({ rating, interactive = false, onChange }: { rating: number; interactive?: boolean; onChange?: (r: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          onClick={() => interactive && onChange?.(i + 1)}
          className={interactive ? 'cursor-pointer' : ''}
          disabled={!interactive}
        >
          <Star
            className={`w-5 h-5 transition-colors ${i < rating ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`}
          />
        </button>
      ))}
    </div>
  );
}

function formatDate(date: string | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

interface ReviewWithHelp extends Review {
  helpfulCount?: number;
  verifiedPurchase?: boolean;
  replyText?: string | null;
  replyDate?: string | null;
}

/* ── Review Submission Form ────────────────────── */
function ReviewForm({ onSubmit }: { onSubmit: () => void }) {
  const { customer, isAuthenticated, isLoading: authLoading } = useAuth();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? 'Upload failed');
      }
      const data = await res.json();
      setImageUrl(data.imageUrl ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating,
          text: text.trim() || undefined,
          imageUrl: imageUrl ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const code = body?.error ?? `HTTP_${res.status}`;
        if (code === 'UNAUTHENTICATED' || code === 'UNAUTHORIZED') {
          throw new Error('Please sign in to submit a review.');
        }
        if (code === 'NOT_VERIFIED') {
          throw new Error('Only verified customers with a delivered order can review.');
        }
        if (code === 'DUPLICATE_REVIEW') {
          throw new Error('You have already submitted a review.');
        }
        throw new Error(body?.message ?? code);
      }

      setSuccess(true);
      setRating(5);
      setText('');
      setImageUrl(null);

      setTimeout(() => {
        setSuccess(false);
        onSubmit();
      }, 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  const isValid = rating >= 1 && rating <= 5 && text.trim().length >= 10;

  if (authLoading) {
    return (
      <div className="glass rounded-3xl p-8 border border-white/8 max-w-2xl mx-auto mb-10 text-center">
        <p className="text-gray-400 text-sm">Checking account…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="glass rounded-3xl p-8 border border-white/8 max-w-2xl mx-auto mb-10 text-center">
        <LogIn className="w-8 h-8 text-[#FF8C00] mx-auto mb-4" />
        <h3 className="text-lg font-black text-white mb-2">Sign in to Review</h3>
        <p className="text-gray-400 text-sm mb-6">
          Only verified customers who have received a delivered order can share a review.
        </p>
        <Link href="/auth/login?from=/#reviews" className="btn-flame inline-flex px-6 py-2.5 text-sm">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-3xl p-6 md:p-8 border border-white/8 max-w-2xl mx-auto mb-10"
    >
      <h3 className="text-xl font-black text-white mb-2">Share Your Experience</h3>
      <p className="text-xs text-gray-500 mb-6">
        Reviewing as <span className="text-white font-semibold">{customer?.fullName}</span>
      </p>

      {success ? (
        <div className="flex items-center gap-3 text-green-400 text-sm mb-4">
          <div className="w-5 h-5 rounded-full bg-green-400/20 flex items-center justify-center">
            <span>✓</span>
          </div>
          <p>Thanks for your review! It&apos;s pending moderation.</p>
        </div>
      ) : null}

      {error ? (
        <div className="flex items-start gap-3 text-red-400 text-sm mb-4">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-white mb-2">Rating</label>
          <Stars rating={rating} interactive onChange={setRating} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">
            Review {text.length > 0 ? `(${text.length}/1000)` : '(min 10 chars)'}
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, 1000))}
            placeholder="Tell us what you think..."
            maxLength={1000}
            rows={4}
            className="input-flame w-full resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-white mb-2">Photo (optional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleImageUpload(file);
            }}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-sm text-white hover:bg-white/15 disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" />
              {imageUploading ? 'Uploading…' : 'Add Photo'}
            </button>
            {imageUrl ? (
              <button
                type="button"
                onClick={() => setImageUrl(null)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Remove photo
              </button>
            ) : null}
          </div>
          {imageUrl ? (
            <div className="relative mt-3 w-32 h-32 rounded-xl overflow-hidden border border-white/10">
              <Image src={imageUrl} alt="Review preview" fill sizes="128px" style={{ objectFit: 'cover' }} />
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!isValid || loading || success || imageUploading}
          className="w-full btn-flame py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Submitting...' : 'Submit Review'}
        </button>
      </form>
    </motion.div>
  );
}

/* ── Review Card ───────────────────────────────── */
function ReviewCard({ review }: { review: ReviewWithHelp }) {
  const [helpful, setHelpful] = useState(false);
  const [helpfulCount, setHelpfulCount] = useState(review.helpfulCount ?? 0);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const key = `review_${review.id}_helpful`;
    if (typeof window !== 'undefined' && localStorage.getItem(key) === '1') {
      setHelpful(true);
    }
  }, [review.id]);

  const toggleHelpful = async () => {
    const key = `review_${review.id}_helpful`;
    if (helpful && typeof window !== 'undefined' && localStorage.getItem(key) === '1') return;

    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${review.id}/helpful`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ helpful: !helpful }),
      });

      if (!res.ok) throw new Error('Failed to mark helpful');

      const data = await res.json();
      const nowHelpful = !helpful;
      setHelpful(nowHelpful);
      setHelpfulCount(data.helpfulCount ?? 0);
      if (typeof window !== 'undefined') {
        if (nowHelpful) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const displayText = expanded ? review.text : (review.text?.length ?? 0) > 300 ? (review.text?.slice(0, 300) ?? '') + '...' : review.text;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 border border-white/8"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF4500] to-[#FFD700] flex items-center justify-center text-sm font-black text-white flex-shrink-0">
          {review.name?.slice(0, 1).toUpperCase() ?? 'A'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-white text-sm">{review.name}</p>
            {review.verifiedPurchase && (
              <span className="text-xs bg-green-400/20 text-green-300 px-2 py-1 rounded-full">
                ✓ Verified
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{formatDate(review.createdAt)}</p>
        </div>
      </div>

      {/* Rating */}
      <div className="mb-3">
        <Stars rating={review.rating} />
      </div>

      {/* Text */}
      {review.text ? (
        <div className="mb-4">
          <p className="text-sm text-gray-300 leading-relaxed">{displayText}</p>
          {(review.text?.length ?? 0) > 300 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[#FF8C00] hover:text-[#FF4500] mt-2 font-semibold"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      ) : null}

      {/* Image */}
      {review.imageUrl ? (
        <div className="mb-4">
          <div className="relative max-w-xs w-full h-40">
            <Image
              src={review.imageUrl}
              alt="Review attachment"
              fill
              sizes="200px"
              style={{ objectFit: 'cover' }}
            />
          </div>
        </div>
      ) : null}

      {/* Admin reply */}
      {review.replyText ? (
        <div className="mb-4 rounded-xl bg-[#FF4500]/10 border border-[#FF4500]/20 p-4">
          <p className="text-xs font-bold text-[#FF8C00] mb-1">Response from SHATVIKA CORNER</p>
          <p className="text-sm text-gray-300">{review.replyText}</p>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-3 border-t border-white/10">
        <button
          onClick={toggleHelpful}
          disabled={loading}
          className="text-xs flex items-center gap-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <ThumbsUp className={`w-4 h-4 ${helpful ? 'fill-[#FFD700] text-[#FFD700]' : ''}`} />
          Helpful {helpfulCount > 0 ? `(${helpfulCount})` : ''}
        </button>
      </div>
    </motion.div>
  );
}

/* ── Rating Breakdown ──────────────────────────── */
function RatingBreakdown({ distribution, avgRating, total }: { distribution: Record<string, number>; avgRating: number; total: number }) {
  return (
    <div className="space-y-3">
      {[5, 4, 3, 2, 1].map(stars => {
        const count = distribution[stars.toString()] ?? 0;
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;

        return (
          <div key={stars} className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-400 min-w-[32px]">{stars}★</span>
            <div className="h-2 bg-white/10 rounded-full flex-1 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-[#FF4500] to-[#FFD700]"
              />
            </div>
            <span className="text-xs text-gray-500 min-w-[40px] text-right">{percent}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ────────────────────────────── */
export default function Reviews() {
  const [reviews, setReviews] = useState<ReviewWithHelp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [avgRating, setAvgRating] = useState(0);
  const [distribution, setDistribution] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/reviews?status=approved&menuItemId=null&sort=${sort}&page=${page}&limit=12`);

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP_${res.status}`);
      }

      const data = await res.json();
      setReviews((data?.reviews ?? []) as ReviewWithHelp[]);
      setTotal(data?.total ?? 0);
      setPages(data?.pages ?? 0);
      setAvgRating(data?.avgRating ?? 0);
      setDistribution(data?.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [sort, page]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleFormSubmit = () => {
    setPage(1);
    loadReviews();
  };

  return (
    <section className="section-pad bg-[#0a0a0a] relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,69,0,0.07) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">Customer Love</p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            What People <span className="flame-text">Say</span>
          </h2>
          <p className="text-gray-400 text-sm md:text-base max-w-2xl mx-auto">
            Real reviews from real SHATVIKA CORNER fans. Help us improve and inspire others!
          </p>
        </motion.div>

        {/* Review Form */}
        <ReviewForm onSubmit={handleFormSubmit} />

        {/* Stats Header */}
        {total > 0 && (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="glass rounded-2xl p-6 border border-white/8 text-center">
              <p className="text-3xl font-black flame-text mb-1">{avgRating.toFixed(1)}</p>
              <Stars rating={Math.round(avgRating)} />
              <p className="text-xs text-gray-500 mt-2">{total} reviews</p>
            </div>

            <div className="glass rounded-2xl p-6 border border-white/8">
              <h4 className="text-sm font-bold text-white mb-4">Rating Breakdown</h4>
              <RatingBreakdown distribution={distribution} avgRating={avgRating} total={total} />
            </div>

            <div className="glass rounded-2xl p-6 border border-white/8">
              <h4 className="text-sm font-bold text-white mb-4">Most Helpful</h4>
              <div className="text-xs text-gray-400 space-y-1">
                {reviews.slice(0, 3).map((r, i) => (
                  <p key={r.id ?? i} className="truncate">
                    <span className="text-white font-semibold">{i + 1}.</span> {r.name}
                  </p>
                ))}
                {reviews.length === 0 && <p>No reviews yet</p>}
              </div>
            </div>
          </motion.div>
        )}

        {/* Sort Dropdown */}
        {total > 0 && (
          <motion.div
            className="mb-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <select
              value={sort}
              onChange={e => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="input-flame text-sm"
            >
              <option value="newest">Newest First</option>
              <option value="rating-high">Highest Rated</option>
              <option value="rating-low">Lowest Rated</option>
              <option value="helpful">Most Helpful</option>
            </select>
          </motion.div>
        )}

        {/* Reviews List */}
        {loading ? (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-gray-400 text-sm">Loading reviews…</p>
          </div>
        ) : error ? (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={() => loadReviews()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-[#FF4500] text-white font-semibold hover:bg-[#FF4500]/90 transition"
            >
              Retry
            </button>
          </div>
        ) : reviews.length > 0 ? (
          <>
            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
            >
              {reviews.map((review, i) => (
                <ReviewCard key={review.id ?? i} review={review} />
              ))}
            </motion.div>

            {/* Pagination */}
            {pages > 1 && (
              <motion.div
                className="flex items-center justify-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>

                <div className="flex items-center gap-2">
                  {Array.from({ length: Math.min(5, pages) }, (_, i) => {
                    const pageNum = i + 1;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-10 h-10 rounded-lg text-sm font-semibold transition ${
                          page === pageNum
                            ? 'bg-[#FF4500] text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/15'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  {pages > 5 && (
                    <>
                      <span className="text-gray-500">...</span>
                      <button
                        onClick={() => setPage(pages)}
                        className={`w-10 h-10 rounded-lg text-sm font-semibold transition ${
                          page === pages
                            ? 'bg-[#FF4500] text-white'
                            : 'bg-white/10 text-gray-400 hover:bg-white/15'
                        }`}
                      >
                        {pages}
                      </button>
                    </>
                  )}
                </div>

                <button
                  onClick={() => setPage(Math.min(pages, page + 1))}
                  disabled={page === pages}
                  className="px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white text-sm hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </motion.div>
            )}
          </>
        ) : (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-4xl mb-3">✨</p>
            <h3 className="text-xl font-black text-white mb-2">Be the First to Review</h3>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md mx-auto">
              Share your experience and help other customers discover what makes us special.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
