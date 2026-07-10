'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DollarSign, ShoppingBag, UtensilsCrossed,
  Tag, TrendingUp, ArrowRight,
} from 'lucide-react';
import StatsCard from '@/components/admin/StatsCard';
import SalesChart from '@/components/admin/SalesChart';
import OrdersTable from '@/components/admin/OrdersTable';
import ReportsPanel from '@/components/admin/ReportsPanel';
import { useAdmin } from '@/context/AdminContext';
import { formatINR } from '@/lib/currency';


const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.09 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export default function AdminDashboard() {
  const { adminMenuItems, orders, coupons } = useAdmin();

  const totalRevenue = orders
    .filter(o => o.status === 'Delivered')
    .reduce((sum, o) => sum + o.total, 0);

  const activeOrders  = orders.filter(o => !['Delivered', 'Cancelled'].includes(o.status)).length;
  const activeCoupons = coupons.filter(c => c.active).length;

  /* Top 5 popular items */
  const topItems = [...adminMenuItems]
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 5);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8 max-w-7xl mx-auto">

      {/* Stats row */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatsCard
          label="Total Revenue"
          value={formatINR(totalRevenue).replace(/\.00$/, '')}
          sub="From delivered orders"
          icon={DollarSign}
          gradient="linear-gradient(135deg,rgba(255,69,0,0.1),rgba(255,140,0,0.05))"
          iconColor="#FF4500"
          trend="12.4%"
          trendUp
        />
        <StatsCard
          label="Total Orders"
          value={`${orders.length}`}
          sub={`${activeOrders} currently active`}
          icon={ShoppingBag}
          gradient="linear-gradient(135deg,rgba(59,130,246,0.1),rgba(37,99,235,0.05))"
          iconColor="#3B82F6"
          trend="8.1%"
          trendUp
        />
        <StatsCard
          label="Menu Items"
          value={`${adminMenuItems.length}`}
          sub="Across 6 categories"
          icon={UtensilsCrossed}
          gradient="linear-gradient(135deg,rgba(34,197,94,0.1),rgba(21,128,61,0.05))"
          iconColor="#22C55E"
        />
        <StatsCard
          label="Active Coupons"
          value={`${activeCoupons}`}
          sub={`${coupons.length} total codes`}
          icon={Tag}
          gradient="linear-gradient(135deg,rgba(168,85,247,0.1),rgba(107,33,168,0.05))"
          iconColor="#A855F7"
          trend="2 expiring soon"
          trendUp={false}
        />
      </motion.div>

      {/* Chart + Top Items */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2">
          <SalesChart />
        </div>

        {/* Top Items */}
        <div className="glass rounded-2xl p-5 border border-white/8">

          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[#FF4500]" />
            <h3 className="text-white font-bold text-sm">Top Sellers</h3>
          </div>
          <div className="space-y-3">
            {topItems.map((item, i) => (
              <div key={item.id} className="flex items-center gap-3">
                <span className="text-xs font-black text-gray-600 w-4">{i + 1}</span>
                <div className={`w-8 h-8 rounded-lg ${item.gradientClass} flex items-center justify-center text-lg shrink-0`}>
                  {item.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{item.name}</p>
                  <p className="text-[10px] text-gray-600">{item.reviewCount.toLocaleString()} reviews</p>
                </div>
                <span className="flame-text text-xs font-black shrink-0">{formatINR(item.variants?.[0]?.price || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Reports (Daily / Weekly / Monthly / Yearly) */}
      <ReportsPanel orders={orders} />

      {/* Recent Orders */}
      <motion.div variants={item} className="glass rounded-2xl p-6 border border-white/8">

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-sm flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#FF4500]" />
            Recent Orders
          </h3>
          <Link href="/admin/orders" className="flex items-center gap-1 text-xs text-[#FF8C00] hover:text-[#FFD700] transition-colors font-semibold">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <OrdersTable limit={4} />
      </motion.div>

      {/* Quick links */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/admin/menu',    label: 'Manage Menu',    sub: `${adminMenuItems.length} items`,   emoji: '🍽️',  color: '#FF4500' },
          { href: '/admin/orders',  label: 'Track Orders',   sub: `${activeOrders} active`,           emoji: '🛵',  color: '#3B82F6' },
          { href: '/admin/coupons', label: 'Manage Coupons', sub: `${activeCoupons} active codes`,    emoji: '🏷️', color: '#A855F7' },
        ].map(q => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-4 p-4 rounded-2xl border border-white/8 glass
                       hover:border-white/20 transition-all group"
          >
            <span className="text-3xl">{q.emoji}</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-white group-hover:text-[#FF8C00] transition-colors">{q.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{q.sub}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-[#FF8C00] transition-colors" />
          </Link>
        ))}
      </motion.div>

      <motion.div variants={item}>
        <Link
          href="/admin/content"
          className="flex items-center justify-between gap-4 p-5 rounded-2xl border border-[#FF4500]/15 bg-[#FF4500]/5 hover:bg-[#FF4500]/10 transition-colors"
        >
          <div>
            <p className="text-sm font-bold text-white">Edit live content</p>
            <p className="text-xs text-gray-600 mt-1">Update features, stats, and team members from one place.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-[#FF8C00] shrink-0" />
        </Link>
      </motion.div>
    </motion.div>
  );
}
