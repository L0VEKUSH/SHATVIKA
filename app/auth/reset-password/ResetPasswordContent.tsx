'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiRequest } from '@/lib/apiClient';
import { validatePassword } from '@/lib/validators';

type ResetResponse = { ok: true; message: string };

export default function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const validTokenShape = /^[a-f\d]{64}$/i.test(token);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const validation = validatePassword(password);
    if (!validation.valid) {
      setError(validation.errors[0] ?? 'Choose a stronger password.');
      return;
    }
    if (password !== confirmation) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await apiRequest<ResetResponse>('/api/auth/reset-password', {
        method: 'POST',
        body: { token, password, confirmPassword: confirmation },
        suppressSessionExpiry: true,
      });
      setPassword('');
      setConfirmation('');
      setComplete(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 shadow-xl" aria-labelledby="reset-title">
        <h1 id="reset-title" className="text-2xl font-black">Choose a new password</h1>
        <p className="mt-2 text-sm text-gray-400">Reset links are single-use and expire after 15 minutes.</p>

        {!validTokenShape ? (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
            This reset link is invalid. Request a new one from the forgot-password page.
          </div>
        ) : complete ? (
          <div className="mt-6 space-y-4" role="status">
            <p className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
              Your password was reset and existing sessions were revoked.
            </p>
            <Link href="/auth/login" className="block w-full rounded-xl bg-orange-600 px-4 py-3 text-center font-bold hover:bg-orange-500">
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{error}</p>}
            <div>
              <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-gray-200">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-gray-200">Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                minLength={8}
                maxLength={128}
                required
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-orange-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-orange-600 px-4 py-3 font-bold hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Resetting…' : 'Reset password'}
            </button>
          </form>
        )}

        <Link href="/auth/forgot-password" className="mt-6 block text-center text-sm text-orange-300 hover:text-orange-200">
          Request another link
        </Link>
      </section>
    </main>
  );
}
