'use client';

import { motion } from 'framer-motion';
import { Award, MapPin, Heart, TrendingUp } from 'lucide-react';
import { useAdmin } from '@/context/AdminContext';

const achievements = [
  { icon: Award,       label: 'Best Fast Food     ',   sub: '    '      },
  { icon: Heart,       label: '98% Customer Love',     sub: 'Verified Reviews'        },
  { icon: MapPin,      label: '    ',          sub: 'Across India & Online'   },
  { icon: TrendingUp,  label: '300% Growth',           sub: '    '  },
];

export default function About() {
  const { teamMembers } = useAdmin();

  return (
    <section className="section-pad bg-[#0a0a0a]">
      <div className="max-w-7xl mx-auto">

        {/* ── Brand story ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-20">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
          >
            <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-4">
              Our Story
            </p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
              Born from a{' '}
              <span className="flame-text">Passion</span>{' '}
              for Fire
            </h2>
            <div className="space-y-4 text-gray-400 text-sm md:text-base leading-relaxed">
              
              
            </div>

            {/* Values */}
            <div className="grid grid-cols-2 gap-4 mt-8">
              {[
                { emoji: '🌿', label: 'Farm to Flame',   desc: 'Local sourcing always' },
                { emoji: '🔥', label: 'Real Fire',        desc: 'No shortcuts ever'     },
                { emoji: '💚', label: 'Community First',  desc: 'We give back'          },
                { emoji: '⚡', label: 'Speed + Quality',  desc: 'Never a compromise'    },
              ].map(v => (
                <div key={v.label} className="glass rounded-xl p-4 border border-white/6">
                  <span className="text-2xl">{v.emoji}</span>
                  <p className="text-white font-semibold text-sm mt-1.5">{v.label}</p>
                  <p className="text-gray-600 text-xs mt-0.5">{v.desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Right: Visual */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
            className="relative"
          >
            {/* Main visual box */}
            <div
              className="rounded-3xl overflow-hidden relative h-[420px] flex items-center justify-center border border-white/8"
              style={{
                background: 'linear-gradient(135deg, #1a0800 0%, #0a0400 60%, #1a0a00 100%)',
              }}
            >
              {/* Large hero emoji */}
              <div className="flex flex-col items-center text-center gap-4 relative z-10">
                <motion.span
                  className="text-9xl"
                  animate={{ rotate: [0, -4, 4, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  🔥
                </motion.span>
                <p className="text-3xl font-black flame-text"> Since 2026</p>
                <p className="text-gray-500 text-sm">Serving fire with love</p>
              </div>

              {/* Background glow */}
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'radial-gradient(ellipse at center, rgba(255,69,0,0.18) 0%, transparent 60%)',
                }}
              />
            </div>

            {/* Floating achievement badges */}
            {[
              { label: '12+ Years', sub: 'of excellence', pos: 'top-4 left-4' },
              { label: '50K+ fans', sub: 'and growing',   pos: 'top-4 right-4' },
              { label: '4.9 ★',    sub: 'average rating', pos: 'bottom-4 right-4' },
            ].map(badge => (
              <div
                key={badge.label}
                className={`absolute ${badge.pos} glass-dark rounded-xl px-3.5 py-2.5 border border-white/8`}
              >
                <p className="flame-text text-sm font-black">{badge.label}</p>
                <p className="text-gray-500 text-[10px] font-medium">{badge.sub}</p>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Achievements row ──────────────────────────── */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
        >
          {achievements.map((a, i) => (
            <motion.div
              key={a.label}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.09 }}
              className="glass rounded-2xl p-5 text-center border border-white/6 hover:border-[#FF4500]/20 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF4500]/20 to-[#FFD700]/10
                              flex items-center justify-center mx-auto mb-3">
                <a.icon className="w-5 h-5 text-[#FF8C00]" />
              </div>
              <p className="text-white font-bold text-sm">{a.label}</p>
              <p className="text-gray-600 text-xs mt-0.5">{a.sub}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Team section ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-10">
            <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
              The Team
            </p>
            <h3 className="text-3xl md:text-4xl font-black text-white">
              The Flame <span className="flame-text">Keepers</span>
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {teamMembers.map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -6, transition: { duration: 0.22 } }}
                className="group rounded-2xl overflow-hidden border border-white/8 text-center"
              >
                {/* Avatar area */}
                <div
                  className="flex items-center justify-center py-10 relative overflow-hidden"
                  style={{ background: member.gradient }}
                >
                  <span className="text-6xl relative z-10 group-hover:scale-110 transition-transform duration-300">
                    {member.emoji}
                  </span>
                  <div
                    aria-hidden
                    className="absolute inset-0 opacity-30"
                    style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%)' }}
                  />
                </div>

                {/* Info */}
                <div className="p-4 bg-[#1a1a1a]">
                  <p className="text-white font-bold text-sm">{member.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5 font-medium">{member.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
