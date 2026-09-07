'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, MapPin, Package, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function CustomerSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();

  const links = [
    { href: '/customer', label: 'Dashboard', icon: User },
    { href: '/customer/profile', label: 'Profile', icon: User },
    { href: '/customer/orders', label: 'Orders', icon: Package },
    { href: '/customer/addresses', label: 'Addresses', icon: MapPin },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 hidden md:flex flex-col">
      <div className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">My Account</h2>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-4 py-3 w-full text-left rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-semibold">Logout</span>
        </button>
      </div>
    </aside>
  );
}
