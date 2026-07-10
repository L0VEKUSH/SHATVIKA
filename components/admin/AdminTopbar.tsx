'use client';

import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Bell, Search } from 'lucide-react';

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/admin':         { title: 'Dashboard',      sub: 'Welcome back, Admin 👋' },
  '/admin/menu':    { title: 'Menu Manager',   sub: 'Manage your 24+ menu items' },
  '/admin/orders':  { title: 'Order Tracker',  sub: 'Real-time order status updates' },
  '/admin/coupons': { title: 'Coupons',        sub: 'Manage promo codes & discounts' },
};

export default function AdminTopbar() {
  const pathname = usePathname();
  const page = PAGE_TITLES[pathname] ?? { title: 'Admin', sub: '' };

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/8
                 flex items-center justify-between px-6 md:px-8 h-[68px] shrink-0"
    >
      {/* Left: page title */}
      <div className="lg:block hidden">
        <h1 className="text-lg font-black text-white leading-none">{page.title}</h1>
        <p className="text-xs text-gray-500 mt-0.5">{page.sub}</p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
          <input
            type="search"
            placeholder="Search…"
            className="bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2
                       text-sm text-white placeholder-gray-600 focus:outline-none
                       focus:border-[#FF4500]/50 w-44 transition-all focus:w-56"
          />
        </div>

        {/* Notifications */}
        <button className="relative w-9 h-9 rounded-xl bg-white/5 border border-white/10
                           flex items-center justify-center hover:bg-white/10 transition-colors">
          <Bell className="w-4 h-4 text-gray-400" />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#FF4500]
                           text-[9px] font-black text-white flex items-center justify-center">3</span>
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700]
                          flex items-center justify-center text-sm font-black text-white shadow-lg">
            A
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-bold text-white leading-none">Admin</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Super User</p>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
