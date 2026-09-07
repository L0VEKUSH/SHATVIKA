'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Clock, Tag } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';

type CouponOffer = {
  id: string;
  code: string;
  discountPercent: number;
  active: boolean;
  usageCount: number;
  expiry: string;
};

function getOfferCopy(coupon: CouponOffer) {
  return {
    title: `${coupon.discountPercent}% Off — ${coupon.code}`,
    description: coupon.expiry
      ? `Valid until ${new Date(coupon.expiry).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'Use this code at checkout for an instant discount.',
    emoji: '🏷️',
    badgeText: 'Active Code',
    gradient: 'linear-gradient(135deg, rgba(255,69,0,0.22), rgba(255,140,0,0.08))',
  };
}

/* ── Countdown logic ───────────────────────────────── */
function useCountdownToDate(targetDate: Date | null) {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0, expired: true });

  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const diff = Math.max(0, targetDate.getTime() - Date.now());
      setTimeLeft({
        h: Math.floor(diff / 3_600_000),
        m: Math.floor((diff % 3_600_000) / 60_000),
        s: Math.floor((diff % 60_000) / 1_000),
        expired: diff <= 0,
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

function Countdown({ expiry }: { expiry: string }) {
  const target = expiry ? new Date(expiry) : null;
  const { h, m, s, expired } = useCountdownToDate(target);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (!expiry || expired) {
    return <p className="text-xs text-white/60">Offer expired</p>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Clock className="w-3.5 h-3.5 text-white/60 shrink-0" />
      <span className="text-xs font-semibold text-white/80">Ends in</span>
      {[pad(h), pad(m), pad(s)].map((val, i) => (
        <span key={`time-${i}-${val}`} className="flex items-center gap-0.5">
          <span className="bg-black/30 text-white text-xs font-black px-1.5 py-0.5 rounded">{val}</span>
          {i < 2 && <span className="text-white/50 text-xs font-bold">:</span>}
        </span>
      ))}
    </div>
  );
}

/* ── Offer card ────────────────────────────────────── */
function OfferCard({
  offer, index,
}: {
  offer: CouponOffer;
  index: number;
}) {
  const [copied, setCopied] = useState(false);
  const meta = getOfferCopy(offer);

  const copy = () => {
    navigator.clipboard.writeText(offer.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.12, duration: 0.55 }}
      whileHover={{ y: -8, transition: { duration: 0.25 } }}
      className="relative rounded-3xl overflow-hidden border border-white/10 flex flex-col
                 shadow-2xl group"
      style={{ background: meta.gradient }}
    >
      {/* Badge */}
      <div className="absolute top-4 right-4 bg-black/30 backdrop-blur-sm
                      text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide">
        {meta.badgeText}
      </div>

      {/* Top section */}
      <div className="p-7 pb-5">
        <div className="text-5xl mb-4">{meta.emoji}</div>
        <div className="inline-block bg-black/25 text-white text-3xl font-black
                        px-3 py-1 rounded-xl mb-3 backdrop-blur-sm">
          {offer.discountPercent}% OFF
        </div>
        <h3 className="text-xl font-black text-white mb-2">{meta.title}</h3>
        <p className="text-sm text-white/70 leading-relaxed">{meta.description}</p>
      </div>

      {/* Divider */}
      <div className="coupon-dashes mx-5" />

      {/* Coupon row */}
      <div className="p-5 pt-4 flex flex-col gap-3">
        <Countdown expiry={offer.expiry} />

        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-black/30 backdrop-blur-sm
                          border border-white/15 rounded-xl px-3 py-2.5">
            <Tag className="w-3.5 h-3.5 text-white/50 shrink-0" />
            <span className="text-sm font-black text-white tracking-widest">{offer.code}</span>
          </div>
          <button
            onClick={copy}
            aria-label="Copy coupon code"
            className={`px-3.5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5
                        transition-all duration-200 shrink-0 ${
                          copied
                            ? 'bg-green-500/30 text-green-300 border border-green-500/40'
                            : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
                        }`}
          >
            {copied
              ? <><Check className="w-3.5 h-3.5" />Copied!</>
              : <><Copy className="w-3.5 h-3.5" />Copy</>
            }
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main component ────────────────────────────────── */
export default function SpecialOffers() {
  const { coupons } = useAdmin();

  const activeCoupons = coupons.filter(c => c.active && c.visibility === 'public' && (!c.expiry || new Date(c.expiry) > new Date()));

  return (
    <section className="section-pad bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
            Save Big Today
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Hot <span className="flame-text">Deals</span> &amp; Offers
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm md:text-base">
            Exclusive discounts managed in the admin panel. Copy a code and apply it at checkout.
          </p>

        </motion.div>

        {/* Offer cards */}
        {activeCoupons.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeCoupons.map((offer, i) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                index={i}
              />
            ))}
          </div>
        ) : (
          <div className="glass rounded-3xl border border-white/8 p-10 text-center">
            <p className="text-4xl mb-3">🏷️</p>
            <h3 className="text-xl font-black text-white mb-2">No active offers yet</h3>
            <p className="text-gray-400 text-sm max-w-xl mx-auto">
              Check back soon for exclusive deals! Subscribe to never miss an offer.
            </p>
          </div>
        )}

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-gray-500 text-sm">
            🎁 New deals are managed in the admin panel •{' '}
            <a href="#contact" className="text-[#FF8C00] hover:text-[#FFD700] font-semibold transition-colors">
              Subscribe to our newsletter
            </a>{' '}
            to never miss an offer
          </p>
        </motion.div>
      </div>
    </section>
  );
}
