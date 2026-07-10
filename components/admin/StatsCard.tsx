'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
  trend?: string;
  trendUp?: boolean;
}

function useCounter(end: number, duration = 1400) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setCount(end); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, end, duration]);

  return { count, ref };
}

export default function StatsCard({
  label, value, sub, icon: Icon, gradient, iconColor, trend, trendUp,
}: StatsCardProps) {
  const numeric = parseFloat(value.replace(/[^0-9.]/g, ''));
  const prefix  = value.startsWith('$') ? '$' : '';
  const suffix  = value.replace(/[$0-9.,]/g, '');
  const { count, ref } = useCounter(isNaN(numeric) ? 0 : numeric);
  const display = isNaN(numeric) ? value : `${prefix}${count.toLocaleString()}${suffix}`;

  return (
    <div
      ref={ref}
      className="relative rounded-2xl p-5 border border-white/8 overflow-hidden group
                 hover:border-white/15 transition-all duration-300"
      style={{ background: gradient }}
    >
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4
                       bg-white/8 border border-white/10 group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5" style={{ color: iconColor }} />
      </div>

      {/* Value */}
      <p className="text-3xl font-black text-white leading-none mb-1">{display}</p>

      {/* Label */}
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>

      {/* Sub + trend */}
      <div className="flex items-center gap-2 mt-2">
        <p className="text-[11px] text-gray-600">{sub}</p>
        {trend && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            trendUp
              ? 'bg-green-500/15 text-green-400'
              : 'bg-red-500/15 text-red-400'
          }`}>
            {trendUp ? '↑' : '↓'} {trend}
          </span>
        )}
      </div>

      {/* Corner glow */}
      <div
        className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full opacity-15 blur-xl"
        style={{ background: iconColor }}
      />
    </div>
  );
}
