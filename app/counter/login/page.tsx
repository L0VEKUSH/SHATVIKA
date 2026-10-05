'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, apiRequest } from '@/lib/apiClient';
import { safeReturnPath } from '@/lib/returnPath';

export default function CounterLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest('/counter/api/login', {
        method: 'POST', body: { email, password }, suppressSessionExpiry: true,
      });
      const returnTo = safeReturnPath(new URLSearchParams(window.location.search).get('returnTo'), '/counter');
      router.replace(returnTo);
      router.refresh();
    } catch (requestError) {
      const messages: Record<string, string> = {
        RATE_LIMITED: 'Too many attempts. Wait a minute and try again.',
        RATE_LIMIT_UNAVAILABLE: 'Sign-in protection is temporarily unavailable. Try again shortly.',
        AUTH_UNAVAILABLE: 'Worker sign-in is not configured on this server. Ask an administrator to check the worker session secret.',
        WORKER_LOCATION_MISMATCH: 'Your account is assigned to a different counter. Ask an administrator to update the worker location.',
      };
      setError(requestError instanceof ApiClientError
        ? messages[requestError.code] ?? 'Sign-in failed. Check your worker email and password.'
        : 'Sign-in failed. Check your worker email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main id="main-content" className="min-h-screen bg-[#0a0a0a] text-white grid place-items-center p-5">
      <section className="w-full max-w-md rounded-3xl border border-orange-500/20 bg-[#151515] p-6 sm:p-8 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-400">Shatvika Corner</p>
        <h1 className="mt-2 text-3xl font-black">Counter workspace</h1>
        <p className="mt-2 text-sm text-gray-400">Restricted access for authorized counter workers.</p>
        {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="worker-email" className="mb-2 block text-sm font-semibold">Worker email</label>
            <input id="worker-email" name="email" type="email" autoComplete="username" required maxLength={120}
              value={email} onChange={event => setEmail(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:border-orange-400 focus:outline-none" />
          </div>
          <div>
            <label htmlFor="worker-password" className="mb-2 block text-sm font-semibold">Password</label>
            <input id="worker-password" name="password" type="password" autoComplete="current-password" required maxLength={128}
              value={password} onChange={event => setPassword(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-white focus:border-orange-400 focus:outline-none" />
          </div>
          <button type="submit" disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-5 py-3 font-extrabold disabled:cursor-not-allowed disabled:opacity-60">
            {submitting ? 'Signing in…' : 'Open counter queue'}
          </button>
        </form>
      </section>
    </main>
  );
}
