'use client';

import { type FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock, Instagram, Mail, MapPin, Phone, Send } from 'lucide-react';
import { ApiClientError, apiRequest } from '@/lib/apiClient';

type ContactLine = string | { label: string; href: string };

type ContactInfoCard = {
  icon: typeof MapPin;
  title: string;
  lines: ContactLine[];
  gradient: string;
};

function configuredContactInfo(): ContactInfoCard[] {
  const address = process.env.NEXT_PUBLIC_BUSINESS_ADDRESS?.trim();
  const phone = process.env.NEXT_PUBLIC_BUSINESS_PHONE?.trim();
  const email = process.env.NEXT_PUBLIC_BUSINESS_EMAIL?.trim();
  const hours = process.env.NEXT_PUBLIC_BUSINESS_HOURS?.trim();
  const cards: ContactInfoCard[] = [];

  if (address) {
    cards.push({
      icon: MapPin,
      title: 'Find Us',
      lines: [address],
      gradient: 'from-[#FF4500]/15 to-transparent',
    });
  }
  if (phone) {
    cards.push({
      icon: Phone,
      title: 'Call Us',
      lines: [{ label: phone, href: `tel:${phone.replace(/[^+\d]/g, '')}` }],
      gradient: 'from-[#FF8C00]/15 to-transparent',
    });
  }
  if (email) {
    cards.push({
      icon: Mail,
      title: 'Email Us',
      lines: [{ label: email, href: `mailto:${email}` }],
      gradient: 'from-[#FFD700]/15 to-transparent',
    });
  }
  if (hours) {
    cards.push({
      icon: Clock,
      title: 'Business Hours',
      lines: [hours],
      gradient: 'from-purple-500/15 to-transparent',
    });
  }

  return cards;
}

function safeHttpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function Field({
  label,
  id,
  type = 'text',
  placeholder,
  required,
  textarea,
  minLength,
  maxLength,
  autoComplete,
}: {
  label: string;
  id: string;
  type?: string;
  placeholder: string;
  required?: boolean;
  textarea?: boolean;
  minLength?: number;
  maxLength?: number;
  autoComplete?: string;
}) {
  const sharedProps = { id, name: id, placeholder, required, minLength, maxLength, autoComplete };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {label} {required && <span className="text-[#FF4500]" aria-hidden="true">*</span>}
      </label>
      {textarea ? (
        <textarea {...sharedProps} rows={4} className="input-flame resize-none" />
      ) : (
        <input {...sharedProps} type={type} className="input-flame" />
      )}
    </div>
  );
}

function submissionError(error: unknown): string {
  if (!(error instanceof ApiClientError)) return 'The contact form is temporarily unavailable. Please try again.';
  if (error.status === 429) {
    return error.retryAfter
      ? `Too many submissions. Please try again in ${error.retryAfter} seconds.`
      : 'Too many submissions. Please wait before trying again.';
  }
  if (error.status === 400) return 'Please check the form fields and try again.';
  return 'The contact form is temporarily unavailable. Please try again later.';
}

export default function Contact() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const contactInfo = configuredContactInfo();
  const instagramUrl = safeHttpsUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL);
  const hasCompleteBusinessInfo = contactInfo.length === 4;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('loading');
    setErrorMessage('');

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiRequest<{ ok: true; message: string }>('/api/contact', {
        method: 'POST',
        body: {
          name: data.get('name'),
          email: data.get('email'),
          phone: data.get('phone') || '',
          subject: data.get('subject') || undefined,
          message: data.get('message'),
          website: data.get('website') || '',
        },
      });
      form.reset();
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setErrorMessage(submissionError(error));
    }
  };

  return (
    <section className="section-pad relative overflow-hidden bg-[#0a0a0a]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 50% 50% at 0% 100%, rgba(255,69,0,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          className="mb-14 text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-[#FF8C00]">Get In Touch</p>
          <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">
            We&apos;d Love to <span className="flame-text">Hear</span> From You
          </h2>
          <p className="mx-auto max-w-md text-sm text-gray-400 md:text-base">
            Send a question, order enquiry, or feedback using the form below.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px]">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="glass rounded-3xl border border-white/8 p-8"
          >
            <h3 className="mb-6 text-xl font-black text-white">Send a Message</h3>

            {status === 'error' && errorMessage && (
              <p role="alert" className="mb-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {errorMessage}
              </p>
            )}

            {status === 'success' ? (
              <motion.div
                role="status"
                aria-live="polite"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center gap-4 py-12 text-center"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-green-500/30 bg-green-500/20">
                  <Check className="h-8 w-8 text-green-400" aria-hidden="true" />
                </div>
                <h4 className="text-xl font-black text-white">Message received</h4>
                <p className="max-w-xs text-sm text-gray-400">
                  Your message was recorded for authorized follow-up.
                </p>
                <button type="button" className="text-sm font-semibold text-[#FF8C00] hover:text-[#FFD700]" onClick={() => setStatus('idle')}>
                  Send another message
                </button>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} aria-busy={status === 'loading'} className="space-y-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field id="name" label="Full Name" placeholder="Your name" required minLength={2} maxLength={80} autoComplete="name" />
                  <Field id="email" label="Email" placeholder="you@example.com" required type="email" maxLength={120} autoComplete="email" />
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field id="phone" label="Phone" placeholder="Optional" type="tel" maxLength={20} autoComplete="tel" />
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="subject" className="text-xs font-semibold uppercase tracking-wider text-gray-400">Subject</label>
                    <select id="subject" name="subject" className="input-flame appearance-none" defaultValue="">
                      <option value="">Select a subject</option>
                      <option value="order">Order Issue</option>
                      <option value="feedback">Feedback</option>
                      <option value="catering">Catering Enquiry</option>
                      <option value="press">Press / Media</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <Field id="message" label="Message" placeholder="Tell us what you need help with" required textarea minLength={10} maxLength={2000} />

                <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-flame flex w-full items-center justify-center gap-2 py-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'loading' ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <span>Submitting</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" aria-hidden="true" />
                      <span>Submit Message</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </motion.div>

          <motion.aside
            aria-label="Business contact information"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="flex flex-col gap-5"
          >
            {contactInfo.map((info, index) => (
              <motion.div
                key={info.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className={`flex items-start gap-4 rounded-2xl border border-white/8 bg-gradient-to-r p-5 ${info.gradient}`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/6">
                  <info.icon className="text-[#FF8C00]" style={{ width: '1.1rem', height: '1.1rem' }} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">{info.title}</p>
                  {info.lines.map(line => (
                    <p key={typeof line === 'string' ? line : line.label} className="mt-0.5 break-words text-xs font-medium text-gray-400">
                      {typeof line === 'string' ? line : (
                        <a href={line.href} className="transition-colors hover:text-white">{line.label}</a>
                      )}
                    </p>
                  ))}
                </div>
              </motion.div>
            ))}

            {!hasCompleteBusinessInfo && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-sm text-amber-100">
                <p className="font-bold">Owner confirmation pending</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/75">
                  {contactInfo.length === 0
                    ? 'Business address, phone, email, and hours have not been published. The message form remains available.'
                    : 'Only owner-confirmed details are shown. One or more business contact fields still need configuration.'}
                </p>
              </div>
            )}

            {instagramUrl && (
              <div className="glass rounded-2xl border border-white/8 p-5">
                <p className="mb-4 text-sm font-bold text-white">Follow Us</p>
                <a
                  href={instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFD700]"
                  aria-label="Open SHATVIKA CORNER on Instagram"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E1306C]/30 bg-[#E1306C]/20">
                    <Instagram className="h-4 w-4 text-[#E1306C]" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold text-white">Instagram</span>
                </a>
              </div>
            )}
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
