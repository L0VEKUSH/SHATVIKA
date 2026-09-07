'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAdmin, OrderStatus, Order } from '@/context/AdminContext';
import { formatINR } from '@/lib/currency';

const STATUS_OPTIONS: OrderStatus[] = ['Pending', 'Cooking', 'Out for Delivery', 'Delivered', 'Cancelled'];

const STATUS_STYLES: Record<OrderStatus, string> = {
  Pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  Cooking: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  'Out for Delivery': 'bg-blue-500/15   text-blue-400   border-blue-500/25',
  Delivered: 'bg-green-500/15  text-green-400  border-green-500/25',
  Cancelled: 'bg-red-500/15    text-red-400    border-red-500/25',
};

const STATUS_EMOJIS: Record<OrderStatus, string> = {
  Pending: '🕐',
  Cooking: '👨‍🍳',
  'Out for Delivery': '🛵',
  Delivered: '✅',
  Cancelled: '❌',
};

function OrderRow({ order }: { order: Order }) {
  const { updateOrderStatus } = useAdmin();
  const [expanded, setExpanded] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/3 transition-colors">
        <td className="px-4 py-3 text-xs font-mono text-[#FF8C00]">{order.id}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{order.avatar}</span>
            <span className="text-sm font-semibold text-white">{order.customer}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{order.items.length} item(s)</td>
        <td className="px-4 py-3">
          <span className="flame-text text-sm font-black">{formatINR(order.total)}</span>
        </td>
        <td className="px-4 py-3">
          <div className="relative">
            <button
              onClick={() => setSelectOpen(s => !s)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold
                          border transition-all ${STATUS_STYLES[order.status]}`}
            >
              <span>{STATUS_EMOJIS[order.status]}</span>
              <span className="hidden sm:inline">{order.status}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            <AnimatePresence>
              {selectOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="absolute top-full mt-1 left-0 z-20 bg-[#1a1a1a] border border-white/10
                             rounded-xl overflow-hidden shadow-2xl w-48"
                >
                  {STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        updateOrderStatus(order.id, s);
                        setSelectOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2.5 text-xs font-semibold
                                  hover:bg-white/8 transition-colors text-left ${
                                    order.status === s ? 'text-white' : 'text-gray-400'
                                  }`}
                    >
                      <span>{STATUS_EMOJIS[s]}</span> {s}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </td>

        <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">{order.time}</td>

        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            )}
          </button>
        </td>
      </tr>

      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={7} className="px-4 pb-4 pt-0">
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white/3 rounded-xl p-4 border border-white/8"
              >
                <div className="flex flex-col sm:flex-row gap-6 mb-4">
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Customer Info</p>
                    <p className="text-sm font-semibold text-white">{order.customer}</p>
                    <p className="text-xs text-gray-400">{order.email}</p>
                    <p className="text-xs text-gray-400">📞 {order.phone}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Delivery Address</p>
                    <p className="text-sm text-gray-300">📍 {order.address}</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 mb-1">Payment Status</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 uppercase tracking-wider text-white">
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>

                {order.specialInstructions && (
                  <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 p-2 rounded-lg">
                    <p className="text-xs text-yellow-500 font-bold mb-1">Special Instructions:</p>
                    <p className="text-xs text-yellow-200">{order.specialInstructions}</p>
                  </div>
                )}

                <p className="text-xs text-gray-500 mb-2 border-t border-white/10 pt-4">Order Items</p>
                <div className="space-y-1">
                  {order.items.map((item, i) => (
                    <div
                      key={`${item.name}-${item.qty}-${item.price}-${i}`}
                      className="flex justify-between text-xs"
                    >
                      <span className="text-gray-300">{item.qty}× {item.name}</span>
                      <span className="text-[#FF8C00] font-bold">{formatINR(item.qty * item.price)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

export default function OrdersTable({ limit }: { limit?: number }) {
  const { orders } = useAdmin();
  const [filter, setFilter] = useState<OrderStatus | 'All'>('All');

  const filtered = orders
    .filter(o => filter === 'All' || o.status === filter)
    .slice(0, limit);

  return (
    <div>
      {!limit && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {(['All', ...STATUS_OPTIONS] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                  filter === s
                    ? 'bg-gradient-to-r from-[#FF4500] to-[#FF8C00] text-white border-transparent'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/8">
              {['Order ID', 'Customer', 'Items', 'Total', 'Status', 'Time', ''].map((h, idx) => (
                <th
                  key={`${h}-${idx}`}
                  className={`px-4 py-3 text-left text-[10px] uppercase tracking-wider
                                        text-gray-600 font-semibold ${
                                          h === 'Items'
                                            ? 'hidden sm:table-cell'
                                            : h === 'Time'
                                              ? 'hidden md:table-cell'
                                              : ''
                                        }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.map(order => (
              <OrderRow key={order.id} order={order} />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">No orders with this status</p>
        </div>
      )}
    </div>
  );
}

