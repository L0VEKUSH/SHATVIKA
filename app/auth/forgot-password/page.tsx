'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';
import { validateEmail } from '@/lib/validators';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const emailVal = validateEmail(email);
    if (!emailVal.valid) {
      setError(emailVal.error || 'Invalid email');
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Request failed');

      setSuccess(true);
    } catch {
      setError('Something went wrong. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <Link href="/auth/login" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back to login
        </Link>

        <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Forgot Password?</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          No worries, we&apos;ll send you reset instructions.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-start gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Check your email</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              We sent a password reset link to <span className="font-semibold">{email}</span>
            </p>
            <button
              onClick={() => {
                setSuccess(false);
                setEmail('');
              }}
              className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline"
            >
              Didn&apos;t receive the email? Click to resend
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                  placeholder="name@example.com"
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !email}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Reset Password'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
