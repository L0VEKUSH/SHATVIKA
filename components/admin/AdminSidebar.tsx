'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, UtensilsCrossed, ShoppingBag,
  Tag, Menu, X, ChevronRight, FileText, Image, Star, LogOut, MessageSquare, CircleDollarSign, UsersRound,
} from 'lucide-react';
import { apiRequest, clearApiClientSession } from '@/lib/apiClient';

const NAV = [
  { href: '/admin',         icon: LayoutDashboard,  label: 'Dashboard'   },
  { href: '/admin/content', icon: FileText,         label: 'Content'     },
  { href: '/admin/menu',    icon: UtensilsCrossed,   label: 'Menu'        },
  { href: '/admin/gallery', icon: Image,             label: 'Gallery'     },
  { href: '/admin/reviews', icon: Star,              label: 'Reviews'     },
  { href: '/admin/contacts', icon: MessageSquare,    label: 'Contacts'    },
  { href: '/admin/orders',  icon: ShoppingBag,       label: 'Orders'      },
  { href: '/admin/finance', icon: CircleDollarSign,  label: 'Costs & stock' },
  { href: '/admin/workers', icon: UsersRound,        label: 'Counter workers' },
  { href: '/admin/coupons', icon: Tag,               label: 'Coupons'     },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const restoreFocusTarget = mobileButtonRef.current;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusable();
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusTarget?.focus();
    };
  }, [mobileOpen]);

  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiRequest('/admin/logout', { method: 'POST' });
      clearApiClientSession();
      router.replace('/admin/login');
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  };

  const NavItem = ({ href, icon: Icon, label }: typeof NAV[0]) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        onClick={() => setMobileOpen(false)}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative ${
          active
            ? 'bg-gradient-to-r from-[#FF4500]/20 to-[#FF8C00]/10 text-white border border-[#FF4500]/25'
            : 'text-gray-500 hover:text-white hover:bg-white/5'
        }`}
      >
        <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-[#FF4500]' : ''}`} />
        {!collapsed && (
          <span className="text-sm font-semibold whitespace-nowrap">{label}</span>
        )}
        {active && !collapsed && (
          <ChevronRight className="w-4 h-4 ml-auto text-[#FF4500]" />
        )}
        {/* Tooltip when collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-3 px-3 py-1.5 bg-[#1c1c1c] border border-white/10
                          rounded-lg text-xs font-semibold text-white whitespace-nowrap
                          opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
            {label}
          </div>
        )}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 p-5 border-b border-white/8 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700]
                        flex items-center justify-center shadow-lg shadow-[#FF4500]/30 shrink-0">
          <span className="text-base">🔥</span>
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-black text-white leading-none">
              <span className="flame-text">SHATVIKA</span> CORNER
            </p>
            <p className="text-[10px] text-gray-600 font-medium uppercase tracking-wider mt-0.5">Admin Panel</p>
          </div>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Admin sections">
        {NAV.map(item => <NavItem key={item.href} {...item} />)}
      </nav>

      {/* Back to site */}
      <div className="p-3 border-t border-white/8">
        <Link
          href="/"
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600
                      hover:text-white hover:bg-white/5 transition-all text-sm font-medium`}
        >
          <span className="text-base shrink-0">🏠</span>
          {!collapsed && <span>Back to Site</span>}
        </Link>
        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {!collapsed && <span>{loggingOut ? 'Signing out…' : 'Sign out'}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.aside
        animate={{ width: collapsed ? 72 : 240 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex flex-col h-screen sticky top-0 bg-[#0f0f0f] border-r border-white/8 overflow-hidden shrink-0"
      >
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="absolute top-5 right-3 w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10
                     border border-white/10 flex items-center justify-center transition-colors z-10"
          aria-label="Toggle sidebar"
          aria-expanded={!collapsed}
        >
          <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
        <SidebarContent />
      </motion.aside>

      {/* Mobile Hamburger */}
      <button
        ref={mobileButtonRef}
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-xl bg-[#0f0f0f]/90
                   border border-white/10 flex items-center justify-center backdrop-blur-lg"
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        aria-controls="admin-mobile-navigation"
      >
        <Menu className="w-5 h-5 text-white" />
      </button>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/70 z-40 lg:hidden"
            />
            <motion.aside
              ref={mobileDrawerRef}
              id="admin-mobile-navigation"
              role="dialog"
              aria-modal="true"
              aria-label="Admin navigation"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 left-0 h-full w-64 bg-[#0f0f0f] border-r border-white/8 z-50 lg:hidden"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center"
                aria-label="Close admin navigation"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
