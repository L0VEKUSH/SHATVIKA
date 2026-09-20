'use client';

import { motion } from 'framer-motion';
import OrdersTable from '@/components/admin/OrdersTable';
import { useAdmin } from '@/context/AdminContext';

export default function AdminOrdersPage() {
  const { orders } = useAdmin();

  const counts = {
    all:       orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    accepted:  orders.filter(o => o.status === 'accepted').length,
    preparing: orders.filter(o => o.status === 'preparing').length,
    ready:     orders.filter(o => o.status === 'ready').length,
    delivery:  orders.filter(o => o.status === 'out_for_delivery').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">
          Order <span className="flame-text">Tracker</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Refresh persisted orders, apply valid status transitions, and expand any row for recorded details.
        </p>
      </div>

      {/* Status overview pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {[
          { label: 'Total',      count: counts.all,       emoji: '📋', color: 'text-white'         },
          { label: 'Pending',    count: counts.pending,   emoji: '🕐', color: 'text-yellow-400'    },
          { label: 'Accepted',   count: counts.accepted,  emoji: '👍', color: 'text-amber-300'      },
          { label: 'Preparing',  count: counts.preparing, emoji: '👨‍🍳', color: 'text-orange-400' },
          { label: 'Ready',      count: counts.ready,     emoji: '🔔', color: 'text-purple-300'    },
          { label: 'Delivery',   count: counts.delivery,  emoji: '🛵', color: 'text-blue-400'      },
          { label: 'Delivered',  count: counts.delivered, emoji: '✅', color: 'text-green-400'     },
          { label: 'Cancelled',  count: counts.cancelled, emoji: '❌', color: 'text-red-400'       },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3 border border-white/8 text-center">
            <p className="text-xl mb-1">{s.emoji}</p>
            <p className={`text-xl font-black ${s.color}`}>{s.count}</p>
            <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Orders table */}
      <div className="glass rounded-2xl p-6 border border-white/8">
        <OrdersTable />
      </div>
    </motion.div>
  );
}
