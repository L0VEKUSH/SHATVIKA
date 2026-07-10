'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Star, Quote } from 'lucide-react';
import { Review } from '@/types';

/* ── Star renderer ─────────────────────────────────── */
function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${i < rating ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`}
        />
      ))}
    </div>
  );
}

function getAvatarEmoji(name: string | undefined) {
  const n = (name ?? 'S').trim();
  const first = n[0]?.toUpperCase() ?? 'S';
  return first;
}

function formatReviewDate(createdAt: string | undefined) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function Reviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);

  const count = reviews.length;

  const go = useCallback(
    (dir: number) => {
      if (count === 0) return;
      setDirection(dir);
      setCurrent(c => (c + dir + count) % count);
    },
    [count]
  );

  /* Load approved reviews from API */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/reviews?status=approved', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `HTTP_${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;
        setReviews((data?.reviews ?? []) as Review[]);
        setCurrent(0);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'FAILED_TO_LOAD');
        setReviews([]);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Auto-advance every 5 s */
  useEffect(() => {
    if (paused || count < 2) return;
    const id = setInterval(() => go(1), 5000);
    return () => clearInterval(id);
  }, [go, paused, count]);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d < 0 ? 80 : -80, opacity: 0 }),
  };

  const review = count > 0 ? reviews[current] : null;

  return (
    <section className="section-pad bg-[#0a0a0a] relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,69,0,0.07) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">Customer Love</p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            What People <span className="flame-text">Say</span>
          </h2>
          <p className="text-gray-400 text-sm md:text-base">Real reviews from real SHATVIKA CORNER fans around the world.</p>
        </motion.div>

        {loading ? (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center max-w-2xl mx-auto">
            <p className="text-gray-400 text-sm">Loading reviews…</p>
          </div>
        ) : error ? (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center max-w-2xl mx-auto">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-[#FF4500] text-white font-semibold hover:bg-[#FF4500]/90 transition"
            >
              Retry
            </button>
          </div>
        ) : count > 0 && review ? (
          <div
            className="relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            <div
              className="absolute -top-4 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-gradient-to-br from-[#FF4500] to-[#FFD700] flex items-center justify-center shadow-lg shadow-[#FF4500]/30 z-10"
            >
              <Quote className="w-5 h-5 text-white" />
            </div>

            <div className="glass rounded-3xl p-8 md:p-12 pt-12 overflow-hidden min-h-[260px] flex flex-col justify-between">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={current}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col items-center text-center gap-5"
                >
                  <Stars rating={review.rating} />

                  <p className="text-gray-300 text-base md:text-lg leading-relaxed font-light max-w-2xl">
                    &ldquo;{review.text ?? '—'}&rdquo;
                  </p>

                  <div className="flex flex-col items-center gap-1.5 mt-2">
                    {review.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={review.imageUrl}
                        alt={review.name}
                        className="w-14 h-14 rounded-full object-cover ring-1 ring-white/10"
                      />
                    ) : (
                      <span className="text-4xl">{getAvatarEmoji(review.name)}</span>
                    )}
                    <p className="text-white font-bold text-sm">{review.name}</p>
                    <p className="text-gray-600 text-xs">{formatReviewDate(review.createdAt)}</p>
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center justify-center gap-4 mt-8">
                <button
                  onClick={() => go(-1)}
                  disabled={count < 2}
                  aria-label="Previous review"
                  className="w-11 h-11 rounded-full glass border border-white/10 flex items-center justify-center hover:border-[#FF4500]/40 hover:bg-[#FF4500]/10 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-400" />
                </button>

                <div className="flex gap-2">
                  {reviews.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (count < 2) return;
                        setDirection(i > current ? 1 : -1);
                        setCurrent(i);
                      }}
                      aria-label={`Go to review ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === current
                          ? 'w-8 bg-gradient-to-r from-[#FF4500] to-[#FFD700]'
                          : 'w-1.5 bg-gray-700 hover:bg-gray-500'
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => go(1)}
                  disabled={count < 2}
                  aria-label="Next review"
                  className="w-11 h-11 rounded-full glass border border-white/10 flex items-center justify-center hover:border-[#FF4500]/40 hover:bg-[#FF4500]/10 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center max-w-2xl mx-auto">
            <p className="text-4xl mb-3">💬</p>
            <h3 className="text-xl font-black text-white mb-2">Customer reviews are not loaded yet</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              This section is now honest instead of showing placeholder testimonials. Add real customer reviews when you have them.
            </p>
          </div>
        )}

        {/* Rating summary */}
        {count > 0 ? (
          <motion.div
            className="flex flex-wrap items-center justify-center gap-8 mt-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            {[
              { label: 'Loaded Reviews', value: `${count}` },
              { label: 'Current Highlight', value: `${reviews[current].rating.toFixed(1)} ★` },
              { label: 'Visible This Week', value: 'Live' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className="text-xl font-black flame-text">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</p>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="mt-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <p className="text-sm text-gray-500">No review metrics to show until real testimonials are added.</p>
          </motion.div>
        )}
      </div>
    </section>
  );
}

