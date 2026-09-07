'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Instagram,
  ArrowRight, MapPin, Phone, Mail,
} from 'lucide-react';

const QUICK_LINKS = [
  { label: 'Home',         href: '#home'    },
  { label: 'Menu',         href: '#menu'    },
  { label: 'Special Offers', href: '#offers' },
  { label: 'About Us',     href: '#about'   },
  { label: 'Reviews',      href: '#reviews' },
  { label: 'Contact',      href: '#contact' },
];

const MENU_LINKS = [
  { label: 'Momos 🥟',       href: '#menu' },
  { label: 'Burgers 🍔',     href: '#menu' },
  { label: 'South Indian 🥞',href: '#menu' },
  { label: 'Sandwiches 🥪',  href: '#menu' },
  { label: 'Shakes 🥤',      href: '#menu' },
];

const SOCIAL = [
  { icon: Instagram, href: '#', label: 'Instagram', color: '#E1306C' },
  
];

const scrollTo = (href: string) => {
  document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
};

export default function Footer() {
  const [email,     setEmail]     = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribed(true);
    setEmail('');
    setTimeout(() => setSubscribed(false), 5000);
  };

  return (
    <footer className="bg-[#080808] border-t border-white/5">

      {/* ── CTA Banner ────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a0800 0%, #0a0400 50%, #200a00 100%)' }}
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,69,0,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-14 relative z-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h3 className="text-3xl md:text-4xl font-black text-white mb-2">
                Ready to <span className="flame-text">Order?</span>
              </h3>
              <p className="text-gray-400 text-sm md:text-base">
                Hot food, fast delivery. Your next favourite meal is one click away.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <a
                href="#menu"
                onClick={e => { e.preventDefault(); scrollTo('#menu'); }}
                className="btn-flame px-7 py-3.5 text-sm font-bold flex items-center gap-2 group"
              >
                <span>Order Now</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#menu"
                onClick={e => { e.preventDefault(); scrollTo('#menu'); }}
                className="btn-outline px-7 py-3.5 text-sm font-semibold text-center"
              >
                View Menu
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main footer body ──────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Column 1 – Brand */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0 }}
          >
            {/* Logo */}
            <a
              href="#home"
              onClick={e => { e.preventDefault(); scrollTo('#home'); }}
              className="flex items-center gap-2.5 mb-5 w-fit"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700]
                              flex items-center justify-center shadow-md shadow-[#FF4500]/25">
                <span className="text-base">🔥</span>
              </div>
              <span className="text-xl font-black tracking-tight">
                <span className="flame-text">Shatvika</span>
                <span className="text-white">Corner</span>
              </span>
            </a>

            <p className="text-gray-500 text-sm leading-relaxed mb-6">
              Premium fast food crafted with fire and passion  Since 2026.
              Farm-fresh ingredients, flame-grilled perfection.
            </p>

            {/* Contact mini */}
            <div className="space-y-2.5">
              {[
                { icon: MapPin, text: 'Quarshi Chaurah, New Aligarh' },
                { icon: Phone,  text: '+91 98765 43210'            },
                { icon: Mail,   text: 'hello@shatvikcorner.in', href: 'mailto:hello@shatvikcorner.in' },
              ].map(c => (
                <div key={c.text} className="flex items-center gap-2.5 text-gray-500 text-xs">
                  <c.icon className="w-3.5 h-3.5 text-[#FF4500] shrink-0" />
                  {c.href ? (
                    <a href={c.href} className="hover:text-white transition-colors">
                      {c.text}
                    </a>
                  ) : (
                    <span>{c.text}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Column 2 – Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.08 }}
          >
            <h4 className="text-white font-bold text-sm mb-5 uppercase tracking-wider">
              Quick Links
            </h4>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map(link => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    onClick={e => { e.preventDefault(); scrollTo(link.href); }}
                    className="text-gray-500 hover:text-[#FF8C00] text-sm font-medium
                               transition-colors duration-200 flex items-center gap-1.5 group"
                  >
                    <span
                      className="w-1 h-1 rounded-full bg-[#FF4500] opacity-0
                                 group-hover:opacity-100 transition-opacity"
                    />
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Column 3 – Menu Categories */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.16 }}
          >
            <h4 className="text-white font-bold text-sm mb-5 uppercase tracking-wider">
              On the Menu
            </h4>
            <ul className="space-y-2.5">
              {MENU_LINKS.map(link => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    onClick={e => { e.preventDefault(); scrollTo(link.href); }}
                    className="text-gray-500 hover:text-[#FF8C00] text-sm font-medium
                               transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

          </motion.div>

          {/* Column 4 – Other Services */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.24 }}
          >
            <h4 className="text-white font-bold text-sm mb-5 uppercase tracking-wider">
              Other Services
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="https://the-hitrack-blaster-b4nfv4ty0-lovekush-kumar-s-projects.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-[#FF8C00] text-sm font-medium
                             transition-colors duration-200 flex items-center gap-1.5 group"
                >
                  <span
                    className="w-1 h-1 rounded-full bg-[#FF4500] opacity-0
                               group-hover:opacity-100 transition-opacity"
                  />
                  HitTrack Blaster
                </a>
              </li>
            </ul>

            <div className="mt-8" />
          </motion.div>

          {/* Column 5 – Newsletter */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.24 }}
          >
            <h4 className="text-white font-bold text-sm mb-2 uppercase tracking-wider">
              Stay in the Loop
            </h4>
            <p className="text-gray-500 text-xs mb-5 leading-relaxed">
              Get exclusive deals, new menu drops and secret promo codes — straight to your inbox.
            </p>

            {subscribed ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-ember rounded-xl p-4 text-center"
              >
                <p className="text-2xl mb-1">🎉</p>
                <p className="text-white font-bold text-sm">You&apos;re subscribed!</p>
                <p className="text-gray-500 text-xs mt-1">
                  Check your inbox for a welcome gift.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubscribe} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  className="input-flame text-sm"
                />
                <button
                  type="submit"
                  className="btn-flame w-full py-3 text-sm font-bold flex items-center justify-center gap-2"
                >
                  <span>Subscribe</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <p className="text-[10px] text-gray-700 leading-relaxed">
                  No spam, ever. Unsubscribe at any time.
                  By subscribing you agree to our{' '}
                  <span className="text-gray-500 cursor-pointer hover:text-white">Privacy Policy</span>.
                </p>
              </form>
            )}

            {/* Social icons */}
            <div className="mt-7">
              <p className="text-xs text-gray-600 font-semibold uppercase tracking-wider mb-3">
                Follow Us
              </p>
              <div className="flex gap-3">
                {SOCIAL.map(s => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="w-9 h-9 rounded-xl border border-white/8 bg-white/4
                               flex items-center justify-center hover:bg-white/10
                               transition-colors group"
                  >
                    <s.icon
                      className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Bottom bar ────────────────────────────────── */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-5 flex flex-col sm:flex-row
                        items-center justify-between gap-4">
          <p className="text-gray-600 text-xs text-center sm:text-left">
            © {new Date().getFullYear()} SHATVIKA CORNER Pvt. Ltd. — All rights reserved.
          </p>
          <div className="flex items-center gap-5 flex-wrap justify-center">
            {['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Sitemap'].map(l => (
              <span
                key={l}
                className="text-gray-600 text-xs hover:text-gray-400 transition-colors cursor-pointer"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scroll-to-top ─────────────────────────────── */}
      <div
        className="fixed bottom-6 right-6 z-40"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <motion.button
          aria-label="Scroll to top"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-11 h-11 rounded-full bg-gradient-to-br from-[#FF4500] to-[#FF8C00]
                     flex items-center justify-center shadow-xl shadow-[#FF4500]/30 text-white
                     font-bold text-lg"
        >
          ↑
        </motion.button>
      </div>
    </footer>
  );
}
