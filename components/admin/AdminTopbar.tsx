'use client';

import { motion } from 'framer-motion';
import { ShieldCheck } from 'lucide-react';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/admin': { title: 'Business dashboard', sub: 'Measured performance and operational signals' },
  '/admin/content': { title: 'Site content', sub: 'Manage customer-facing business content' },
  '/admin/menu': { title: 'Menu manager', sub: 'Manage products, variants, pricing, and availability' },
  '/admin/gallery': { title: 'Gallery', sub: 'Manage approved durable media' },
  '/admin/reviews': { title: 'Review moderation', sub: 'Review and moderate customer feedback' },
  '/admin/orders': { title: 'Order tracker', sub: 'Review orders and apply valid status transitions' },
  '/admin/coupons': { title: 'Coupons', sub: 'Manage promotion rules and usage limits' },
};

export default function AdminTopbar() {
  const pathname = usePathname();
  const page = PAGE_TITLES[pathname] ?? { title: 'Admin workspace', sub: 'Authorized operations' };

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center justify-between border-b border-white/8 bg-[#0a0a0a]/90 px-6 backdrop-blur-xl md:px-8"
    >
      <div className="hidden min-w-0 lg:block">
        <h1 className="text-lg font-black leading-none text-white">{page.title}</h1>
        <p className="mt-0.5 text-xs text-gray-500">{page.sub}</p>
      </div>

      <div className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        <span>Authorized admin workspace</span>
      </div>
    </motion.header>
  );
}
