'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Package } from 'lucide-react';
import { formatINR } from '@/lib/currency';

function statusLabel(status?: string) {
  switch (status) {
    case 'pending': return 'Pending';
    case 'accepted':
    case 'preparing': return 'Preparing';
    case 'ready':
    case 'out_for_delivery': return 'Out for Delivery';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return 'Pending';
  }
}

export default function OrdersPage() {
  const { customer, isLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch('/api/user/orders', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch (err) {
        console.error('Failed to load orders', err);
      } finally {
        setLoadingOrders(false);
      }
    };
    if (customer) fetchOrders();
  }, [customer]);

  if (isLoading || loadingOrders) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Package className="w-8 h-8 text-blue-500" />
          My Orders
        </h1>
        <p className="text-sm text-gray-500 mt-1">View and track your recent orders</p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center shadow-sm">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No orders yet</h3>
          <p className="text-gray-500 mb-6">Looks like you haven&apos;t placed any orders yet.</p>
          <a href="/menu" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors">
            Explore Menu
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <div key={order.id} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <p className="text-sm text-gray-500">Order ID: #{order.orderNumber || order.id?.slice(-8)}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(order.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    order.orderStatus === 'pending' || order.orderStatus === 'preparing' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    order.orderStatus === 'delivered' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  }`}>
                    {statusLabel(order.orderStatus)}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                {order.items?.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center text-xs font-medium">
                        {item.quantity}x
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name || 'Item'}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{formatINR((item.unitPrice || 0) * (item.quantity || 0))}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <div className="flex items-center gap-4">
                  <p className="font-semibold text-gray-900 dark:text-white">Total</p>
                  <p className="text-xl font-black flame-text">{formatINR(order.totalAmount)}</p>
                </div>
                <div className="flex items-center gap-2 mt-4 sm:mt-0">
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Reorder
                  </button>
                  <button className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Invoice
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
                    Track Order
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
