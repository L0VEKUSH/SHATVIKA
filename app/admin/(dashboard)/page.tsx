'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  DollarSign, ShoppingBag, UtensilsCrossed, Users, TrendingUp,
  TrendingDown, ArrowRight, Flame, BarChart3, PieChart, Clock,
  Star, Zap, AlertTriangle, Download, RefreshCw
} from 'lucide-react';
import { formatINR } from '@/lib/currency';

/* ── Types ─── */
interface Analytics {
  revenue: {
    today: number; todayOrders: number; yesterday: number; yesterdayOrders: number;
    week: number; weekOrders: number; prevWeek: number;
    month: number; monthOrders: number; prevMonth: number;
    total: number; totalOrders: number;
    todayVsYesterday: number; weekVsPrevWeek: number; monthVsPrevMonth: number;
  };
  orders: {
    today: number; pending: number; confirmed: number; cooking: number;
    delivery: number; delivered: number; cancelled: number; total: number; aov: number;
  };
  products: { total: number; active: number; outOfStock: number };
  reviews: { total: number; avgRating: number; distribution: { rating: number; count: number }[] };
  topItems: { _id: string; totalQty: number; totalRev: number }[];
  categoryPerf: { _id: string; revenue: number; orders: number }[];
  dailySales: { _id: string; revenue: number; orders: number }[];
  hourlyOrders: { _id: number; count: number }[];
  recentOrders: any[];
  forecast: { revenue: number; orders: number; growthRate: number };
  insights: string[];
}

/* ── KPI Card ─── */
function KPICard({ label, value, sub, icon: Icon, gradient, iconColor, trend, trendUp }: {
  label: string; value: string; sub: string; icon: any; gradient: string; iconColor: string;
  trend?: string; trendUp?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="glass rounded-2xl p-5 border border-white/8 relative overflow-hidden group"
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${iconColor}20`, border: `1px solid ${iconColor}30` }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${trendUp ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-xs text-gray-400 font-medium mt-0.5">{label}</p>
      <p className="text-[10px] text-gray-600 mt-1">{sub}</p>
    </motion.div>
  );
}

/* ── Mini Bar Chart ─── */
function MiniBarChart({ data, maxH = 60 }: { data: { label: string; value: number }[]; maxH?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-[60px]">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(d.value / max) * maxH}px` }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
            className="w-full rounded-t bg-gradient-to-t from-[#FF4500] to-[#FFD700] min-h-[2px]"
          />
          <span className="text-[8px] text-gray-600 truncate max-w-full">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Heatmap Cell ─── */
function HeatCell({ hour, count, max }: { hour: number; count: number; max: number }) {
  const intensity = max > 0 ? count / max : 0;
  return (
    <div
      className="rounded-md aspect-square flex items-center justify-center text-[9px] font-bold border border-white/5"
      style={{ background: `rgba(255, 69, 0, ${0.05 + intensity * 0.6})`, color: intensity > 0.5 ? '#fff' : '#666' }}
      title={`${hour}:00 — ${count} orders`}
    >
      {count > 0 ? count : ''}
    </div>
  );
}

/* ── Main Dashboard ─── */
export default function AdminDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/admin/analytics');
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setData(json);
    } catch {
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass rounded-2xl p-5 border border-white/8 h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/8 h-72" />
          <div className="glass rounded-2xl p-6 border border-white/8 h-72" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle className="w-12 h-12 text-[#FF4500]" />
        <p className="text-gray-400">{error || 'Something went wrong.'}</p>
        <button onClick={fetchAnalytics} className="btn-flame px-6 py-2 text-sm font-bold flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  const { revenue, orders, products, reviews, topItems, dailySales, hourlyOrders, forecast, insights } = data;

  // Build heatmap data
  const hourlyMap: Record<number, number> = {};
  hourlyOrders.forEach(h => { hourlyMap[h._id] = h.count; });
  const maxHourly = Math.max(...Object.values(hourlyMap), 1);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-7xl mx-auto">

      {/* ── Header ─── */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-[#FF4500]" /> Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-1">Real-time business analytics for Satvik Fast Food</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={fetchAnalytics} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-400 hover:text-white transition-colors">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </motion.div>

      {/* ── Revenue KPIs ─── */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard label="Today's Revenue" value={formatINR(revenue.today)} sub={`${revenue.todayOrders} orders`} icon={DollarSign} gradient="linear-gradient(135deg,rgba(255,69,0,0.08),rgba(255,140,0,0.03))" iconColor="#FF4500" trend={`${revenue.todayVsYesterday >= 0 ? '+' : ''}${revenue.todayVsYesterday}%`} trendUp={revenue.todayVsYesterday >= 0} />
        <KPICard label="This Week" value={formatINR(revenue.week)} sub={`${revenue.weekOrders} orders`} icon={BarChart3} gradient="linear-gradient(135deg,rgba(59,130,246,0.08),rgba(37,99,235,0.03))" iconColor="#3B82F6" trend={`${revenue.weekVsPrevWeek >= 0 ? '+' : ''}${revenue.weekVsPrevWeek}%`} trendUp={revenue.weekVsPrevWeek >= 0} />
        <KPICard label="This Month" value={formatINR(revenue.month)} sub={`${revenue.monthOrders} orders`} icon={PieChart} gradient="linear-gradient(135deg,rgba(34,197,94,0.08),rgba(21,128,61,0.03))" iconColor="#22C55E" trend={`${revenue.monthVsPrevMonth >= 0 ? '+' : ''}${revenue.monthVsPrevMonth}%`} trendUp={revenue.monthVsPrevMonth >= 0} />
        <KPICard label="Total Revenue" value={formatINR(revenue.total)} sub={`${revenue.totalOrders} delivered`} icon={TrendingUp} gradient="linear-gradient(135deg,rgba(168,85,247,0.08),rgba(107,33,168,0.03))" iconColor="#A855F7" />
      </motion.div>

      {/* ── Order & Product KPIs ─── */}
      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black text-white">{orders.today}</p>
          <p className="text-[10px] text-gray-500 mt-1">Today&apos;s Orders</p>
        </div>
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black text-yellow-400">{orders.pending}</p>
          <p className="text-[10px] text-gray-500 mt-1">Pending</p>
        </div>
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black text-orange-400">{orders.cooking}</p>
          <p className="text-[10px] text-gray-500 mt-1">Preparing</p>
        </div>
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black text-green-400">{orders.delivered}</p>
          <p className="text-[10px] text-gray-500 mt-1">Completed</p>
        </div>
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black text-red-400">{orders.cancelled}</p>
          <p className="text-[10px] text-gray-500 mt-1">Cancelled</p>
        </div>
        <div className="glass rounded-xl p-4 border border-white/8 text-center">
          <p className="text-xl font-black flame-text">₹{orders.aov}</p>
          <p className="text-[10px] text-gray-500 mt-1">Avg Order Value</p>
        </div>
      </motion.div>

      {/* ── Charts Row ─── */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Sales Chart */}
        <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-white font-bold text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#FF4500]" /> Sales This Week
            </h3>
          </div>
          {dailySales.length > 0 ? (
            <div className="space-y-4">
              <MiniBarChart
                data={dailySales.map(d => ({
                  label: new Date(d._id).toLocaleDateString(undefined, { weekday: 'short' }),
                  value: d.revenue
                }))}
                maxH={120}
              />
              <div className="flex items-center justify-between text-xs text-gray-500">
                {dailySales.map(d => (
                  <div key={d._id} className="text-center">
                    <p className="text-white font-bold text-xs">{formatINR(d.revenue)}</p>
                    <p className="text-[10px]">{d.orders} orders</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              No sales data for this period
            </div>
          )}
        </div>

        {/* Top Sellers */}
        <div className="glass rounded-2xl p-5 border border-white/8">
          <div className="flex items-center gap-2 mb-4">
            <Flame className="w-4 h-4 text-[#FF4500]" />
            <h3 className="text-white font-bold text-sm">Top Sellers</h3>
          </div>
          <div className="space-y-3">
            {topItems.length > 0 ? topItems.slice(0, 6).map((ti, i) => (
              <div key={ti._id} className="flex items-center gap-3">
                <span className={`text-xs font-black w-5 h-5 rounded-full flex items-center justify-center ${i === 0 ? 'bg-[#FFD700]/20 text-[#FFD700]' : i === 1 ? 'bg-gray-400/20 text-gray-400' : i === 2 ? 'bg-orange-700/20 text-orange-500' : 'text-gray-600'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{ti._id}</p>
                  <p className="text-[10px] text-gray-600">{ti.totalQty} orders</p>
                </div>
                <span className="flame-text text-xs font-black shrink-0">{formatINR(ti.totalRev)}</span>
              </div>
            )) : (
              <p className="text-gray-500 text-xs">No sales data yet</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Heatmap + Product/Review Stats ─── */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Heatmap */}
        <div className="lg:col-span-2 glass rounded-2xl p-6 border border-white/8">
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-[#FF4500]" /> Orders by Hour (Last 7 Days)
          </h3>
          <div className="grid grid-cols-12 gap-1.5">
            {Array.from({ length: 24 }).map((_, h) => (
              <HeatCell key={h} hour={h} count={hourlyMap[h] || 0} max={maxHourly} />
            ))}
          </div>
          <div className="flex items-center justify-between mt-3 text-[9px] text-gray-600">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
        </div>

        {/* Product & Review Stats */}
        <div className="space-y-4">
          <div className="glass rounded-2xl p-5 border border-white/8">
            <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
              <UtensilsCrossed className="w-4 h-4 text-[#22C55E]" /> Products
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="text-lg font-black text-white">{products.total}</p>
                <p className="text-[10px] text-gray-500">Total</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-green-400">{products.active}</p>
                <p className="text-[10px] text-gray-500">Active</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-red-400">{products.outOfStock}</p>
                <p className="text-[10px] text-gray-500">Out of Stock</p>
              </div>
            </div>
          </div>

          <div className="glass rounded-2xl p-5 border border-white/8">
            <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-[#FFD700]" /> Reviews
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl font-black flame-text">{reviews.avgRating.toFixed(1)}</span>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} className={`w-3 h-3 ${n <= Math.round(reviews.avgRating) ? 'fill-[#FFD700] text-[#FFD700]' : 'text-gray-700'}`} />
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-0.5">{reviews.total} reviews</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[5, 4, 3, 2, 1].map(star => {
                const found = reviews.distribution.find(d => d.rating === star);
                const pct = reviews.total > 0 ? Math.round(((found?.count || 0) / reviews.total) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-3">{star}★</span>
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#FF4500] to-[#FFD700]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-gray-600 w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Forecast + Insights ─── */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forecast */}
        <div className="glass rounded-2xl p-6 border border-white/8 bg-gradient-to-br from-[#FF4500]/5 to-transparent">
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-[#FFD700]" /> Revenue Forecast (Next Week)
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center glass rounded-xl p-4 border border-white/8">
              <p className="text-xl font-black flame-text">{formatINR(forecast.revenue)}</p>
              <p className="text-[10px] text-gray-500 mt-1">Expected Revenue</p>
            </div>
            <div className="text-center glass rounded-xl p-4 border border-white/8">
              <p className="text-xl font-black text-white">{forecast.orders}</p>
              <p className="text-[10px] text-gray-500 mt-1">Expected Orders</p>
            </div>
            <div className="text-center glass rounded-xl p-4 border border-white/8">
              <p className={`text-xl font-black ${forecast.growthRate >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {forecast.growthRate >= 0 ? '+' : ''}{forecast.growthRate}%
              </p>
              <p className="text-[10px] text-gray-500 mt-1">Growth Rate</p>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="glass rounded-2xl p-6 border border-white/8">
          <h3 className="text-white font-bold text-sm flex items-center gap-2 mb-4">
            💡 Auto-Generated Insights
          </h3>
          <div className="space-y-3">
            {insights.length > 0 ? insights.map((insight, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-white/3 border border-white/5"
              >
                <p className="text-sm text-gray-300 leading-relaxed">{insight}</p>
              </motion.div>
            )) : (
              <p className="text-gray-500 text-xs">Not enough data to generate insights yet. Place some orders to see analytics!</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Quick Links ─── */}
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/admin/menu',    label: 'Manage Menu',    sub: `${products.total} items`,                                emoji: '🍽️',  color: '#FF4500' },
          { href: '/admin/orders',  label: 'Track Orders',   sub: `${orders.pending + orders.cooking} active`,              emoji: '🛵',  color: '#3B82F6' },
          { href: '/admin/reviews', label: 'Manage Reviews', sub: `${reviews.total} approved`,                              emoji: '⭐',  color: '#FFD700' },
        ].map(q => (
          <Link
            key={q.href}
            href={q.href}
            className="flex items-center gap-4 p-4 rounded-2xl border border-white/8 glass hover:border-white/20 transition-all group"
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
    </motion.div>
  );
}
