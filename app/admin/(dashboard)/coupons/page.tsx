'use client';

import { motion } from 'framer-motion';
import CouponsPanel from '@/components/admin/CouponsPanel';
import { useAdmin } from '@/context/AdminContext';

export default function AdminCouponsPage() {
  const { coupons } = useAdmin();

  const totalUsage    = coupons.reduce((s, c) => s + c.usageCount, 0);
  const activeSavings = coupons
    .filter(c => c.active)
    .reduce((s, c) => s + c.discountPercent, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">
          Coupon <span className="flame-text">Manager</span>
        </h2>
        
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Codes',  value: coupons.length,                     emoji: '🏷️', color: 'text-white'      },
          { label: 'Total Uses',   value: totalUsage,                          emoji: '👥', color: 'text-blue-400'   },
          { label: 'Active Codes', value: coupons.filter(c => c.active).length, emoji: '✅', color: 'text-green-400'  },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-4 border border-white/8 text-center">
            <p className="text-2xl mb-1">{s.emoji}</p>
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Coupons panel */}
      <div className="glass rounded-2xl p-6 border border-white/8">
        <CouponsPanel />
      </div>


    </motion.div>
  );
}
