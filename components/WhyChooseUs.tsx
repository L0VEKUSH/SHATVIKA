'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { useAdmin } from '@/context/AdminContext';

/* ── Animated counter hook ─────────────────────────── */
function useCounter(end: string, duration: number = 1800) {
  const [count, setCount] = useState('0');
  const ref   = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    if (!inView) return;
    const numericPart = parseFloat(end.replace(/[^0-9.]/g, ''));
    const suffix      = end.replace(/[0-9.]/g, '');
    if (isNaN(numericPart)) { setCount(end); return; }

    let start = 0;
    const step = numericPart / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= numericPart) {
        setCount(numericPart % 1 === 0 ? numericPart.toFixed(0) + suffix : numericPart.toFixed(1) + suffix);
        clearInterval(timer);
      } else {
        setCount(
          numericPart % 1 === 0
            ? Math.floor(start).toFixed(0) + suffix
            : start.toFixed(1) + suffix,
        );
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return { count, ref };
}

/* ── Stat counter box ──────────────────────────────── */
function StatBox({ stat }: { stat: { value: string; label: string; emoji: string } }) {
  const { count, ref } = useCounter(stat.value);

  return (
    <div ref={ref} className="counter-box text-center">
      <p className="text-3xl mb-1">{stat.emoji}</p>
      <p className="text-3xl md:text-4xl font-black flame-text leading-none">{count}</p>
      <p className="text-xs text-gray-500 font-medium mt-1.5 uppercase tracking-wider">{stat.label}</p>
    </div>
  );
}

/* ── Feature card ──────────────────────────────────── */
function FeatureCard({
  feature, index,
}: {
  feature: { emoji: string; title: string; description: string; gradient: string };
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ delay: index * 0.12, duration: 0.55 }}
      whileHover={{ y: -8, transition: { duration: 0.22 } }}
      className="relative rounded-2xl border border-white/8 p-7 overflow-hidden group"
      style={{ background: feature.gradient }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
        style={{ boxShadow: 'inset 0 0 60px rgba(255,69,0,0.06)' }}
      />

      {/* Icon */}
      <div className="text-5xl mb-5 group-hover:scale-110 transition-transform duration-300 inline-block">
        {feature.emoji}
      </div>

      {/* Content */}
      <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>

      {/* Corner accent */}
      <div
        className="absolute bottom-0 right-0 w-20 h-20 rounded-tl-[60px] opacity-10 group-hover:opacity-20 transition-opacity"
        style={{
          background: 'linear-gradient(135deg, #FF4500, #FFD700)',
        }}
      />
    </motion.div>
  );
}

/* ── Main component ────────────────────────────────── */
export default function WhyChooseUs() {
  const { features, stats } = useAdmin();

  return (
    <section className="section-pad bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">

        {/* Section header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
            Our Promise
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            Why Choose <span className="flame-text">SHATVIKA CORNER?</span>
          </h2>
          <p className="text-gray-400 max-w-lg mx-auto text-sm md:text-base">
            We don&apos;t just make food — we craft experiences. Here&apos;s what sets us apart.
          </p>
        </motion.div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {features.map((f, i) => (
            <FeatureCard key={f.id} feature={f} index={i} />
          ))}
        </div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
        >
          {stats.map(s => (
            <StatBox key={s.id} stat={s} />
          ))}
        </motion.div>

        {/* Trust bar */}
        <motion.div
          className="mt-14 flex flex-wrap items-center justify-center gap-6 md:gap-10"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          {[
            { id: 'hygiene', label: 'HACCP Certified', emoji: '✅' },
            { id: 'awards', label: 'Award Winning', emoji: '🏆' },
            { id: 'halal', label: 'Halal Options', emoji: '☪️' },
            { id: 'eco', label: 'Eco Packaging', emoji: '♻️' },
            { id: 'msg-free', label: 'No MSG', emoji: '🌿' },
          ].map(t => (
            <div key={t.id} className="flex items-center gap-2 text-gray-500 text-xs font-medium">
              <span>{t.emoji}</span>
              <span>{t.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
