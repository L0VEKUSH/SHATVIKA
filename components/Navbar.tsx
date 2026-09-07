'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag, Heart, Search, X, Menu, Sun, Moon,
} from 'lucide-react';
import { useCart } from '@/context/CartContext';

interface NavbarProps {
  onCartOpen:        (tab: 'cart' | 'wishlist') => void;
  darkMode:          boolean;
  onDarkModeToggle:  () => void;
}

const NAV_LINKS = [
  { href: '#home',    label: 'Home'    },
  { href: '#menu',    label: 'Menu'    },
  { href: '#offers',  label: 'Offers'  },
  { href: '#about',   label: 'About'   },
  { href: '#reviews', label: 'Reviews' },
  { href: '#contact', label: 'Contact' },
];

export default function Navbar({ onCartOpen, darkMode, onDarkModeToggle }: NavbarProps) {
  const [scrolled,       setScrolled]       = useState(false);
  const [mobileOpen,     setMobileOpen]      = useState(false);
  const [searchOpen,     setSearchOpen]      = useState(false);
  const [searchQuery,    setSearchQuery]     = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { totalItems, wishlistCount } = useCart();

  /* ── scroll listener ─────────────────────────────── */
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  /* ── focus search on open ─────────────────────────── */
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  /* ── sync search with menu section ────────────────── */
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('menu-search', { detail: searchQuery }));
  }, [searchQuery]);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ── Icon button helper ───────────────────────────── */
  const IconBtn = ({
    onClick, label, children, badge,
  }: {
    onClick?: () => void;
    label: string;
    children: React.ReactNode;
    badge?: number;
  }) => (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 border border-white/10
                 flex items-center justify-center transition-colors duration-200"
    >
      {children}
      {!!badge && (
        <motion.span
          key={`badge-${badge}`}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full
                     bg-gradient-to-r from-[#FF4500] to-[#FFD700]
                     text-[10px] font-bold flex items-center justify-center text-white"
        >
          {badge > 9 ? '9+' : badge}
        </motion.span>
      )}

    </button>
  );

  return (
    <>
      {/* ─── Main Nav ─────────────────────────────────── */}
      <motion.nav
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]'
            : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between h-[72px]">

          {/* Logo */}
          <a
            href="#home"
            onClick={e => { e.preventDefault(); scrollTo('#home'); }}
            className="flex items-center gap-2.5 shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700]
                            flex items-center justify-center shadow-lg shadow-[#FF4500]/30
                            group-hover:scale-110 transition-transform">
              <span className="text-base">🔥</span>
            </div>
            <span className="text-xl font-black tracking-tight select-none">
              <span className="flame-text">SHATVIKA</span>
              <span className="text-white">CORNER</span>
            </span>
          </a>

          {/* Desktop Links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Primary navigation">
            {NAV_LINKS.map(link => (
              <a
                key={link.href}
                href={link.href}
                onClick={e => { e.preventDefault(); scrollTo(link.href); }}
                className="relative text-sm font-medium text-gray-400 hover:text-white
                           transition-colors duration-200 group"
              >
                {link.label}
                <span className="absolute -bottom-0.5 left-0 w-0 h-[2px] rounded-full
                                 bg-gradient-to-r from-[#FF4500] to-[#FFD700]
                                 group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Expandable search */}
            <div className="flex items-center gap-2">
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 180, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <input
                      ref={searchRef}
                      type="search"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onBlur={() => !searchQuery && setSearchOpen(false)}
                      placeholder="Search menu…"
                      className="w-full bg-white/8 border border-white/15 rounded-full
                                 px-4 py-1.5 text-sm text-white placeholder-gray-500
                                 focus:outline-none focus:border-[#FF4500]/60"
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <IconBtn label="Toggle search" onClick={() => setSearchOpen(v => !v)}>
                <Search className="w-4 h-4 text-gray-400" />
              </IconBtn>
            </div>

            {/* Wishlist */}
            <IconBtn label="Wishlist" badge={wishlistCount || undefined} onClick={() => onCartOpen('wishlist')}>
              <Heart className="w-4 h-4 text-gray-400" />
            </IconBtn>

            {/* Cart */}
            <IconBtn label="Open cart" onClick={() => onCartOpen('cart')} badge={totalItems || undefined}>
              <ShoppingBag className="w-4 h-4 text-gray-400" />
            </IconBtn>

            {/* Dark mode – desktop only */}
            <div className="hidden md:block">
              <IconBtn label="Toggle dark mode" onClick={onDarkModeToggle}>
                {darkMode
                  ? <Sun className="w-4 h-4 text-yellow-400" />
                  : <Moon className="w-4 h-4 text-gray-400" />
                }
              </IconBtn>
            </div>

            {/* Hamburger – mobile only */}
            <div className="md:hidden">
              <IconBtn label="Toggle mobile menu" onClick={() => setMobileOpen(v => !v)}>
                {mobileOpen
                  ? <X className="w-4 h-4 text-white" />
                  : <Menu className="w-4 h-4 text-gray-400" />
                }
              </IconBtn>
            </div>
          </div>
        </div>
      </motion.nav>

      {/* ─── Mobile Menu Overlay ───────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="fixed inset-0 z-40 bg-[#080808]/98 backdrop-blur-3xl
                       flex flex-col items-center justify-center gap-7 md:hidden"
          >
            {/* Logo in menu */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF4500] to-[#FFD700]
                              flex items-center justify-center">
                <span className="text-2xl">🔥</span>
              </div>
              <span className="text-2xl font-black">
                <span className="flame-text">SHATVIKA</span>
                <span className="text-white">CORNER</span>
              </span>
            </div>

            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                onClick={e => { e.preventDefault(); scrollTo(link.href); }}
                className="text-2xl font-semibold text-gray-300 hover:text-white
                           transition-colors duration-200 tracking-wide"
              >
                {link.label}
              </motion.a>
            ))}

            <motion.button
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: NAV_LINKS.length * 0.07 }}
              onClick={onDarkModeToggle}
              className="flex items-center gap-2.5 mt-4 px-6 py-3 rounded-full
                         bg-white/8 border border-white/10 text-white text-sm font-medium"
            >
              {darkMode ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
