'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import ReportTable from '@/components/admin/ReportTable';
import type { Order } from '@/context/AdminContext';

type Granularity = 'day' | 'week' | 'month' | 'year';

const TABS: Array<{ key: Granularity; label: string }> = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

export default function ReportsPanel({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<Granularity>('day');

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#FF4500]" />
            Selling & Profit Reports
          </h3>
          <p className="text-gray-500 text-xs mt-0.5">Delivered orders grouped by time period</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'px-4 py-2 rounded-full text-xs font-bold bg-gradient-to-r from-[#FF4500] to-[#FF8C00] text-white shadow-lg shadow-[#FF4500]/20'
                : 'px-4 py-2 rounded-full text-xs font-bold bg-white/5 text-gray-400 border border-white/10 hover:text-white hover:border-white/20 transition-colors'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <ReportTable orders={orders} granularity={tab} />
    </motion.div>
  );
}

