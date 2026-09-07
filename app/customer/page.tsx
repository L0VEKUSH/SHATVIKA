'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { Package, MapPin, Heart, ArrowRight, User as UserIcon } from 'lucide-react';
import { formatINR } from '@/lib/currency';

export default function CustomerDashboard() {
  const { customer, isLoading: authLoading } = useAuth();
  const { wishlist } = useCart();
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    if (customer) {
      fetch('/api/user/orders')
        .then(res => res.json())
        .then(data => {
          if (data.ok) {
            setRecentOrders(data.orders.slice(0, 3) || []);
          }
        })
        .finally(() => setLoadingOrders(false));
    }
  }, [customer]);

  if (authLoading || (customer && loadingOrders)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-[#FF4500] border-t-transparent"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 mb-4">Please log in to view your dashboard</p>
        <Link href="/auth/login" className="btn-flame px-6 py-2 rounded-xl">Login</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-black text-white">Welcome back, {customer.fullName.split(' ')[0]}!</h1>
          <p className="text-gray-400 mt-1">Here is an overview of your account</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Profile Card */}
        <div className="glass rounded-2xl p-6 border border-white/10 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF4500] to-[#FF8C00] flex items-center justify-center text-white text-xl font-bold mb-3 shadow-lg shadow-[#FF4500]/20">
            {customer.fullName.charAt(0).toUpperCase()}
          </div>
          <h3 className="text-white font-bold">{customer.fullName}</h3>
          <p className="text-sm text-gray-400 mt-1">{customer.email}</p>
          <Link href="/customer/profile" className="mt-4 text-[#FF8C00] text-sm font-semibold hover:underline flex items-center gap-1">
            Edit Profile <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Orders Stat */}
        <div className="glass rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="text-white font-bold">Recent Orders</h3>
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="mt-4">
            <Link href="/customer/orders" className="text-blue-400 text-sm font-semibold hover:underline flex items-center gap-1">
              View All Orders <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Addresses Stat */}
        <div className="glass rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="text-white font-bold">Addresses</h3>
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-white">{customer.addresses?.length || 0}</p>
            <Link href="/customer/addresses" className="text-green-400 text-sm font-semibold hover:underline mt-2 inline-flex items-center gap-1">
              Manage Addresses <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Wishlist Stat */}
        <div className="glass rounded-2xl p-6 border border-white/10 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <h3 className="text-white font-bold">Wishlist</h3>
            <div className="w-10 h-10 rounded-full bg-pink-500/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-pink-400" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-black text-white">{wishlist.length}</p>
            <Link href="/menu" className="text-pink-400 text-sm font-semibold hover:underline mt-2 inline-flex items-center gap-1">
              Explore Menu <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="mt-8 glass rounded-2xl p-6 border border-white/10">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Recent Orders</h2>
          <Link href="/customer/orders" className="text-sm text-[#FF8C00] hover:underline font-semibold">View all</Link>
        </div>
        
        {recentOrders.length === 0 ? (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-gray-400">No recent orders found.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentOrders.map(order => (
              <div key={order.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 rounded-xl bg-white/5 border border-white/5 gap-4 hover:bg-white/10 transition-colors">
                <div>
                  <p className="text-white font-bold flex items-center gap-2">
                    Order #{order.orderNumber || order.id.slice(-8)}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 uppercase tracking-wider">{order.orderStatus}</span>
                  </p>
                  <p className="text-sm text-gray-400 mt-1">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold flame-text">{formatINR(order.totalAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{order.items?.length} items</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
