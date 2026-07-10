'use client';

import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Star, Clock, Truck } from 'lucide-react';

interface HeroProps {
  onOrderNow: () => void;
}

/* ── Floating food card data ─────────────────────────── */
const floatingCards = [
  {
    id: 'fc1',
    emoji: '🍔',
    name: 'Double Inferno',
    price: '',
    rating: '',
    top: '18%', left: '5%',
    delay: 0,
    animation: 'animate-float',
  },
  
  {
    id: 'fc3',
    emoji: '🍟',
    name: 'Loaded Fries',
    price: '',
    rating: '',
    top: '22%', right: '4%',
    delay: 0.4,
    animation: 'animate-float-delay',
  },
];

/* ── Badge pill ──────────────────────────────────────── */
const Badge = ({ icon, text }: { icon: React.ReactNode; text: string }) => (
  <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full glass text-xs font-medium text-gray-300 border border-white/8">
    {icon}
    {text}
  </div>
);

export default function Hero({ onOrderNow }: HeroProps) {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center
                        overflow-hidden bg-[#0a0a0a] pt-20">

      {/* ── Background ambience ─────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Central glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                        w-[700px] h-[700px] rounded-full
                        bg-[radial-gradient(ellipse,rgba(255,69,0,0.12)_0%,transparent_65%)]" />
        {/* Orange orb top-right */}
        <motion.div
          className="absolute top-[10%] right-[15%] w-64 h-64 rounded-full blur-3xl
                     bg-[#FF4500] opacity-10"
          animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.14, 0.08] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Amber orb bottom-left */}
        <motion.div
          className="absolute bottom-[15%] left-[10%] w-72 h-72 rounded-full blur-3xl
                     bg-[#FF8C00] opacity-10"
          animate={{ scale: [1, 1.2, 1], opacity: [0.07, 0.13, 0.07] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        />
        {/* Gold orb bottom-right */}
        <motion.div
          className="absolute bottom-[20%] right-[8%] w-48 h-48 rounded-full blur-3xl
                     bg-[#FFD700] opacity-8"
          animate={{ scale: [1, 1.1, 1], opacity: [0.05, 0.1, 0.05] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />
        {/* Subtle grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px,transparent 1px),' +
              'linear-gradient(90deg,rgba(255,255,255,0.1) 1px,transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* ── Floating food cards – desktop ─────────────── */}
      {floatingCards.map(card => (
        <motion.div
          key={card.id}
          className={`hidden lg:flex absolute glass rounded-2xl p-3.5 items-center gap-3
                      min-w-[170px] shadow-xl ${card.animation}`}
          style={{
            top:   card.top,
            left:  card.left,
            right: (card as { right?: string }).right,
          }}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 + card.delay, duration: 0.5, ease: 'backOut' }}
        >
          <span className="text-3xl">{card.emoji}</span>
          <div>
            <p className="text-xs font-semibold text-white leading-tight">{card.name}</p>
            <p className="flame-text text-sm font-black mt-0.5">{card.price}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Star className="w-2.5 h-2.5 fill-[#FFD700] text-[#FFD700]" />
              <span className="text-[10px] text-gray-400 font-medium">{card.rating}</span>
            </div>
          </div>
        </motion.div>
      ))}

      {/* ── Hero Content ─────────────────────────────────── */}
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">

        {/* Top badge row */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
        
          
        </motion.div>

        {/* Main headline */}
        <div className="overflow-hidden mb-4">
          <motion.h1
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-none
                       tracking-tight uppercase"
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.span
              className="inline-block flame-text text-glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Fast.{' '}
            </motion.span>
            <motion.span
              className="inline-block text-white"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
            >
              Fresh.
            </motion.span>
            <br />
            <motion.span
              className="inline-block flame-text-r"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Delicious.
            </motion.span>
          </motion.h1>
        </div>

        {/* Sub-headline */}
        <motion.p
          className="text-base sm:text-lg md:text-xl text-gray-400 max-w-xl mx-auto mb-10 leading-relaxed font-light"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65, duration: 0.6 }}
        >
          Premium flame-grilled burgers, stone-baked pizzas, and handcrafted sides —{' '}
          <span className="text-white font-medium">crafted with fire, served with love.</span>
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          <button
            onClick={onOrderNow}
            className="btn-flame px-8 py-4 text-base font-bold flex items-center gap-2.5
                       group w-full sm:w-auto justify-center"
          >
            <span>Order Now</span>
            <ArrowRight
              className="w-4 h-4 group-hover:translate-x-1 transition-transform"
            />
          </button>

          <a
            href="#menu"
            onClick={e => {
              e.preventDefault();
              document.querySelector('#menu')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn-outline px-8 py-4 text-base font-semibold
                       flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            Explore Menu
          </a>
        </motion.div>

        {/* Social proof numbers */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-8 mt-14"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.7 }}
        >
          {[
            { value: '50K+', label: 'Happy Customers' },
            { value: '4.9★', label: 'Average Rating' },
            { value: '<30',  label: 'Min Delivery' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-black flame-text">{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5 font-medium">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Scroll indicator ──────────────────────────────── */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        <p className="text-[10px] text-gray-600 uppercase tracking-[0.2em] font-medium">
          Scroll to explore
        </p>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <ChevronDown className="w-4 h-4 text-gray-600" />
        </motion.div>
      </motion.div>

      {/* ── Bottom gradient fade ──────────────────────────── */}
      <div
        aria-hidden
        className="absolute bottom-0 inset-x-0 h-32
                   bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none"
      />
    </section>
  );
}
