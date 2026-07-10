'use client';

import { useState, FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Phone, Mail, Clock, Send, Check,
  Instagram,
} from 'lucide-react';



type ContactLine = string | { label: string; href: string };

type ContactInfoCard = {
  icon: typeof MapPin;
  title: string;
  lines: ContactLine[];
  gradient: string;
};

const CONTACT_INFO: ContactInfoCard[] = [
  {
    icon: MapPin,
    title: 'Find Us',
    lines: ['Quarshi Chauraha', 'Aligarh 202001, IN'],
    gradient: 'from-[#FF4500]/15 to-transparent',
  },
  {
    icon: Phone,
    title: 'Call Us',
    lines: ['+91 98765 43210', '+91 11 4000 5000'],
    gradient: 'from-[#FF8C00]/15 to-transparent',
  },
  {
    icon: Mail,
    title: 'Email Us',
    lines: [
      { label: 'hello@shatvikcorner.in', href: 'mailto:hello@shatvikcorner.in' },
      { label: 'orders@shatvikcorner.in', href: 'mailto:orders@shatvikcorner.in' },
    ],
    gradient: 'from-[#FFD700]/15 to-transparent',
  },
  {
    icon: Clock,
    title: 'Hours',
    lines: ['Mon–Fri: 10am – 12am', 'Sat–Sun: 9am – 1am'],
    gradient: 'from-purple-500/15 to-transparent',
  },
];

/* ── Form field ────────────────────────────────────── */
function Field({
  label, id, type = 'text', placeholder, required, textarea,
}: {
  label: string; id: string; type?: string; placeholder: string;
  required?: boolean; textarea?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
        {label} {required && <span className="text-[#FF4500]">*</span>}
      </label>
      {textarea ? (
        <textarea
          id={id}
          name={id}
          placeholder={placeholder}
          required={required}
          rows={4}
          className="input-flame resize-none"
        />
      ) : (
        <input
          id={id}
          name={id}
          type={type}
          placeholder={placeholder}
          required={required}
          className="input-flame"
        />
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────── */
export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus('loading');
    await new Promise(r => setTimeout(r, 1500));
    setStatus('success');
    (e.target as HTMLFormElement).reset();
    setTimeout(() => setStatus('idle'), 4000);
  };

  return (
    <section className="section-pad bg-[#0a0a0a] relative overflow-hidden">
      {/* Background accent */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 50% 50% at 0% 100%, rgba(255,69,0,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">

        {/* Section header */}
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs uppercase tracking-[0.3em] text-[#FF8C00] font-semibold mb-3">
            Get In Touch
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-white mb-4">
            We&apos;d Love to <span className="flame-text">Hear</span> From You
          </h2>
          <p className="text-gray-400 max-w-md mx-auto text-sm md:text-base">
            Questions, feedback, or just want to tell us how much you loved our food — we&apos;re all ears.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10">

          {/* ── Left: Contact form ─────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass rounded-3xl p-8 border border-white/8"
          >
            <h3 className="text-xl font-black text-white mb-6">Send a Message</h3>

            {status === 'success' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 text-center gap-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30
                                flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <h4 className="text-xl font-black text-white">Message Sent! 🎉</h4>
                <p className="text-gray-400 text-sm max-w-xs">
                  Thanks for reaching out! Our team will get back to you within 24 hours.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field id="name"  label="Full Name"    placeholder="John Doe"           required />
                  <Field id="email" label="Email"         placeholder="john@example.com"   required type="email" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Field id="phone"   label="Phone"    placeholder="+91 98765 43210" type="tel"  />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="subject" className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Subject
                    </label>
                    <select
                      id="subject"
                      name="subject"
                      className="input-flame appearance-none"
                    >
                      <option value="">Select a subject…</option>
                      <option value="order">Order Issue</option>
                      <option value="feedback">Feedback</option>
                      <option value="catering">Catering Enquiry</option>
                      <option value="press">Press / Media</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <Field
                  id="message" label="Message" placeholder="Tell us what's on your mind…"
                  required textarea
                />

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-flame w-full py-4 text-sm font-bold flex items-center justify-center gap-2
                             disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {status === 'loading' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <span>Sending…</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Send Message</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>

          {/* ── Right: Info + map ──────────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-5"
          >
            {/* Contact info cards */}
            {CONTACT_INFO.map((info, i) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`flex items-start gap-4 rounded-2xl p-5 border border-white/8 bg-gradient-to-r ${info.gradient}`}
              >
                <div className="w-10 h-10 rounded-xl bg-white/6 border border-white/8
                                flex items-center justify-center shrink-0">
                  <info.icon className="w-4.5 h-4.5 text-[#FF8C00]" style={{ width: '1.1rem', height: '1.1rem' }} />
                </div>
                <div>
                  <p className="text-white font-bold text-sm">{info.title}</p>
                  {info.lines.map(line => (
                    <p key={typeof line === 'string' ? line : line.label} className="text-gray-400 text-xs mt-0.5 font-medium">
                      {typeof line === 'string' ? (
                        line
                      ) : (
                        <a href={line.href} className="hover:text-white transition-colors">
                          {line.label}
                        </a>
                      )}
                    </p>
                  ))}
                </div>
              </motion.div>
            ))}

            {/* Social links */}
            <div className="glass rounded-2xl p-5 border border-white/8">
              <p className="text-white font-bold text-sm mb-4">Follow Us</p>
              <div className="flex flex-col gap-3">
                {(() => {
                  const SOCIAL = [
                    { icon: Instagram, label: 'Instagram', href: '#', color: '#E1306C', handle: '@shatvikcorner' },
                  ];

                  return SOCIAL.map(s => (
                    <div key={s.label} className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${s.color}20`, border: `1px solid ${s.color}30` }}
                      >
                        <s.icon className="w-4 h-4" style={{ color: s.color }} />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-xs">{s.label}</p>
                        <p className="text-gray-500 text-xs">{s.handle}</p>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Map placeholder */}
            <div
              className="rounded-2xl overflow-hidden border border-white/8 relative h-[160px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0f0f0f, #1a0800)' }}
            >
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="text-3xl">📍</span>
                <p className="text-white font-bold text-sm">Quarshi Chauraha, Aligarh</p>
                <p className="text-gray-600 text-xs"> </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
