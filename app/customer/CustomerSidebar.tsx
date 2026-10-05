'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, MapPin, Package, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const LINKS = [
  { href: '/customer', label: 'Dashboard', icon: User },
  { href: '/customer/profile', label: 'Profile', icon: User },
  { href: '/customer/orders', label: 'Orders', icon: Package },
  { href: '/customer/addresses', label: 'Addresses', icon: MapPin },
] as const;

export default function CustomerSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  const navigationLinks = (mobile = false) => LINKS.map((link) => {
    const Icon = link.icon;
    const active = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        aria-current={active ? 'page' : undefined}
        className={mobile
          ? `flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold ${active ? 'text-[#FF4500]' : 'text-gray-500 dark:text-gray-400'}`
          : `flex items-center gap-3 rounded-xl px-4 py-3 transition-colors ${active
              ? 'bg-blue-50 font-semibold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
              : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50'}`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className={mobile ? 'truncate' : undefined}>{link.label}</span>
      </Link>
    );
  });

  return (
    <>
      <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white md:flex dark:border-gray-700 dark:bg-gray-800">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Account</h2>
        </div>
        <nav className="flex-1 space-y-2 px-4" aria-label="Customer account">
          {navigationLinks()}
        </nav>
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            <span className="font-semibold">Logout</span>
          </button>
        </div>
      </aside>

      <nav
        aria-label="Customer account"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 border-t border-gray-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur md:hidden dark:border-gray-700 dark:bg-gray-900/95"
      >
        {navigationLinks(true)}
        <button
          type="button"
          onClick={() => logout()}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold text-red-500"
          aria-label="Sign out"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </nav>
    </>
  );
}
