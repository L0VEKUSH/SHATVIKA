import { NextResponse } from 'next/server';
import { connectToMongo } from '@/lib/mongoose';
import { Order } from '@/models/Order';
import { MenuItem } from '@/models/MenuItem';
import { Review } from '@/models/Review';
import { isAdminJwtAuthed } from '@/lib/adminJwt';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const isAuthed = await isAdminJwtAuthed();
    if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await connectToMongo();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86400000);
    const prevWeekStart = new Date(todayStart.getTime() - 14 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // ── Revenue Metrics ──
    const [todayRev, yesterdayRev, weekRev, prevWeekRev, monthRev, prevMonthRev, totalRev] = await Promise.all([
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: yesterdayStart, $lt: todayStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: weekStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: prevWeekStart, $lt: weekStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered', createdAt: { $gte: prevMonthStart, $lt: monthStart } } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { orderStatus: 'delivered' } }, { $group: { _id: null, total: { $sum: '$totalAmount' }, count: { $sum: 1 } } }]),
    ]);

    // ── Order Status Counts ──
    const [orderCounts, todayOrders] = await Promise.all([
      Order.aggregate([{ $group: { _id: '$orderStatus', count: { $sum: 1 } } }]),
      Order.countDocuments({ createdAt: { $gte: todayStart } }),
    ]);
    const statusMap: Record<string, number> = {};
    orderCounts.forEach((o: { _id: string; count: number }) => { statusMap[o._id] = o.count; });

    // ── Top Selling Items ──
    const topItems = await Order.aggregate([
      { $match: { orderStatus: 'delivered' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', totalQty: { $sum: '$items.quantity' }, totalRev: { $sum: '$items.totalPrice' } } },
      { $sort: { totalRev: -1 } },
      { $limit: 10 },
    ]);

    // ── Category Performance ──
    const categoryPerf = await Order.aggregate([
      { $match: { orderStatus: 'delivered' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', revenue: { $sum: '$items.totalPrice' }, orders: { $sum: '$items.quantity' } } },
      { $sort: { revenue: -1 } },
    ]);

    // ── Daily Sales (last 7 days) ──
    const dailySales = await Order.aggregate([
      { $match: { orderStatus: 'delivered', createdAt: { $gte: weekStart } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$totalAmount' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // ── Orders by Hour (heatmap) ──
    const hourly = await Order.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // ── Product Stats ──
    const [totalProducts, activeProducts] = await Promise.all([
      MenuItem.countDocuments(),
      MenuItem.countDocuments({ available: { $ne: false } }),
    ]);

    // ── Review Stats ──
    const reviewStats = await Review.aggregate([
      { $match: { status: 'approved' } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);
    const totalReviews = await Review.countDocuments({ status: 'approved' });
    const avgRating = await Review.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' } } }]);

    // ── Recent Orders (last 10) ──
    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(10).lean();

    // ── Helpers ──
    const val = (arr: { total?: number; count?: number }[]) => arr[0] || { total: 0, count: 0 };
    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // ── Revenue Forecast (simple linear projection) ──
    const weekRevVal = val(weekRev).total || 0;
    const prevWeekRevVal = val(prevWeekRev).total || 0;
    const growthRate = prevWeekRevVal > 0 ? (weekRevVal - prevWeekRevVal) / prevWeekRevVal : 0;
    const forecastRevenue = Math.round(weekRevVal * (1 + growthRate));
    const forecastOrders = Math.round((val(weekRev).count || 0) * (1 + growthRate));

    // ── Auto-generated Insights ──
    const insights: string[] = [];
    const weekChange = pctChange(weekRevVal, prevWeekRevVal);
    if (weekChange > 0) insights.push(`📈 Sales increased by ${weekChange}% this week.`);
    else if (weekChange < 0) insights.push(`📉 Sales decreased by ${Math.abs(weekChange)}% this week.`);
    if (topItems[0]) insights.push(`🥤 ${topItems[0]._id} generated the highest revenue.`);
    const peakHour = hourly.sort((a: { count: number }, b: { count: number }) => b.count - a.count)[0];
    if (peakHour) insights.push(`🕒 Peak ordering time is ${peakHour._id}:00–${peakHour._id + 1}:00.`);
    const totalOrderCount = Object.values(statusMap).reduce((s, c) => s + c, 0);
    const aov = totalOrderCount > 0 ? Math.round((val(totalRev).total || 0) / (val(totalRev).count || 1)) : 0;
    if (aov > 0) insights.push(`💰 Average customer spends ₹${aov}.`);

    return NextResponse.json({
      revenue: {
        today: val(todayRev).total || 0,
        todayOrders: val(todayRev).count || 0,
        yesterday: val(yesterdayRev).total || 0,
        yesterdayOrders: val(yesterdayRev).count || 0,
        week: weekRevVal,
        weekOrders: val(weekRev).count || 0,
        prevWeek: prevWeekRevVal,
        month: val(monthRev).total || 0,
        monthOrders: val(monthRev).count || 0,
        prevMonth: val(prevMonthRev).total || 0,
        total: val(totalRev).total || 0,
        totalOrders: val(totalRev).count || 0,
        todayVsYesterday: pctChange(val(todayRev).total || 0, val(yesterdayRev).total || 0),
        weekVsPrevWeek: pctChange(weekRevVal, prevWeekRevVal),
        monthVsPrevMonth: pctChange(val(monthRev).total || 0, val(prevMonthRev).total || 0),
      },
      orders: {
        today: todayOrders,
        pending: statusMap['pending'] || 0,
        confirmed: statusMap['accepted'] || 0,
        cooking: statusMap['preparing'] || 0,
        delivery: statusMap['out_for_delivery'] || 0,
        delivered: statusMap['delivered'] || 0,
        cancelled: statusMap['cancelled'] || 0,
        total: totalOrderCount,
        aov,
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        outOfStock: totalProducts - activeProducts,
      },
      reviews: {
        total: totalReviews,
        avgRating: avgRating[0]?.avg || 0,
        distribution: reviewStats.map((r: { _id: number; count: number }) => ({ rating: r._id, count: r.count })),
      },
      topItems,
      categoryPerf,
      dailySales,
      hourlyOrders: hourly,
      recentOrders,
      forecast: { revenue: forecastRevenue, orders: forecastOrders, growthRate: Math.round(growthRate * 100) },
      insights,
    });
  } catch (err) {
    console.error('[GET /api/admin/analytics]', err);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
