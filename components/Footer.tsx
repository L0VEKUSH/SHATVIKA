'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Instagram, Mail, MapPin, Phone } from 'lucide-react';

const QUICK_LINKS = [
  { label: 'Home', href: '#home' },
  { label: 'Menu', href: '#menu' },
  { label: 'Special offers', href: '#offers' },
  { label: 'About', href: '#about' },
  { label: 'Reviews', href: '#reviews' },
  { label: 'Contact', href: '#contact' },
];

const MENU_LINKS = ['Momos', 'Burgers', 'South Indian', 'Sandwiches', 'Shakes'];

function scrollTo(href: string) {
  document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
}

export default function Footer() {
  const address = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim();
  const phone = process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim();
  const email = process.env.NEXT_PUBLIC_BUSINESS_EMAIL?.trim();
  const instagram = process.env.NEXT_PUBLIC_INSTAGRAM_URL?.trim();
  const contactConfigured = Boolean(address || phone || email);

  return (
    <footer className="border-t border-white/5 bg-[#080808]">
      <div className="relative overflow-hidden bg-[linear-gradient(135deg,#1a0800_0%,#0a0400_50%,#200a00_100%)]">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(255,69,0,0.12)_0%,transparent_70%)]" />
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center justify-between gap-8 px-6 py-14 md:flex-row md:px-8">
          <div>
            <h2 className="mb-2 text-3xl font-black text-white md:text-4xl">Explore the <span className="flame-text">menu</span></h2>
            <p className="text-sm text-gray-400 md:text-base">Availability, prices, charges, and delivery estimates are confirmed at checkout.</p>
          </div>
          <a href="#menu" onClick={event => { event.preventDefault(); scrollTo('#menu'); }} className="btn-flame flex shrink-0 items-center gap-2 px-7 py-3.5 text-sm font-bold">View menu <ArrowRight className="h-4 w-4" aria-hidden="true" /></a>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <section aria-labelledby="footer-brand">
          <a href="#home" onClick={event => { event.preventDefault(); scrollTo('#home'); }} className="mb-5 flex w-fit items-center gap-2.5">
            <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF4500] to-[#FFD700] font-black text-[#0a0a0a]">SC</span>
            <span id="footer-brand" className="text-xl font-black tracking-tight"><span className="flame-text">Shatvika</span><span className="text-white"> Corner</span></span>
          </a>
          <p className="mb-6 text-sm leading-relaxed text-gray-500">Menu, ordering, and account services from SHATVIKA CORNER.</p>
          <div className="space-y-2.5 text-xs text-gray-500">
            {address && <p className="flex items-start gap-2.5"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#FF4500]" aria-hidden="true" /><span>{address}</span></p>}
            {phone && <p><a className="flex items-center gap-2.5 hover:text-white" href={`tel:${phone.replace(/[^+\d]/g, '')}`}><Phone className="h-3.5 w-3.5 text-[#FF4500]" aria-hidden="true" />{phone}</a></p>}
            {email && <p><a className="flex items-center gap-2.5 hover:text-white" href={`mailto:${email}`}><Mail className="h-3.5 w-3.5 text-[#FF4500]" aria-hidden="true" />{email}</a></p>}
            {!contactConfigured && <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-amber-200">Business contact details await owner confirmation.</p>}
          </div>
        </section>

        <motion.nav aria-label="Footer navigation" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wider text-white">Quick links</h2>
          <ul className="space-y-2.5">{QUICK_LINKS.map(link => <li key={link.href}><a href={link.href} onClick={event => { event.preventDefault(); scrollTo(link.href); }} className="text-sm font-medium text-gray-500 transition-colors hover:text-[#FF8C00]">{link.label}</a></li>)}</ul>
        </motion.nav>

        <motion.nav aria-label="Menu categories" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wider text-white">On the menu</h2>
          <ul className="space-y-2.5">{MENU_LINKS.map(label => <li key={label}><a href="#menu" onClick={event => { event.preventDefault(); scrollTo('#menu'); }} className="text-sm font-medium text-gray-500 transition-colors hover:text-[#FF8C00]">{label}</a></li>)}</ul>
        </motion.nav>

        <motion.section aria-labelledby="footer-policies" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 id="footer-policies" className="mb-5 text-sm font-bold uppercase tracking-wider text-white">Business information</h2>
          <ul className="space-y-2.5">
            <li><Link href="/policies#delivery" className="text-sm text-gray-500 hover:text-[#FF8C00]">Delivery policy</Link></li>
            <li><Link href="/policies#cancellation" className="text-sm text-gray-500 hover:text-[#FF8C00]">Cancellation and refunds</Link></li>
            <li><Link href="/policies#privacy" className="text-sm text-gray-500 hover:text-[#FF8C00]">Privacy notice</Link></li>
            <li><Link href="/policies#tax" className="text-sm text-gray-500 hover:text-[#FF8C00]">Tax information</Link></li>
          </ul>
          {instagram && <a href={instagram} target="_blank" rel="noopener noreferrer" className="mt-7 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-gray-500 hover:text-white" aria-label="SHATVIKA CORNER on Instagram"><Instagram className="h-4 w-4" aria-hidden="true" /></a>}
        </motion.section>
      </div>

      <div className="border-t border-white/5"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-6 py-5 sm:flex-row md:px-8"><p className="text-center text-xs text-gray-600 sm:text-left">© {new Date().getFullYear()} SHATVIKA CORNER.</p><Link href="/sitemap.xml" className="text-xs text-gray-600 hover:text-gray-400">Sitemap</Link></div></div>
      <motion.button type="button" aria-label="Scroll to top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} initial={{ scale: 0 }} animate={{ scale: 1 }} whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} className="fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#FF4500] to-[#FF8C00] font-bold text-white shadow-xl shadow-[#FF4500]/30 focus:outline-none focus:ring-2 focus:ring-[#FFD700] focus:ring-offset-2 focus:ring-offset-black"><span aria-hidden>↑</span></motion.button>
    </footer>
  );
}
