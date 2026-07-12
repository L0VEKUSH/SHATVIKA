'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminSignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/admin/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, setupKey }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message ?? 'Signup failed');
        return;
      }

      // After signup we go straight to admin.
      router.replace('/admin');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8">
        <h1 className="text-2xl font-black text-white">Admin Signup</h1>
        <p className="text-sm text-gray-500 mt-2">
          Create the initial admin session. Enter the one-time setup key from your <span className="text-gray-300 font-semibold">.env.local</span>.
        </p>


        {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF4500]/50"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF4500]/50"
              placeholder="Create a password"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">Setup Key</label>
            <input
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              type="password"
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FF4500]/50"
              placeholder="Enter ADMIN_SETUP_KEY"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}

            className="w-full rounded-xl bg-[#FF4500] hover:bg-[#FF8C00] transition-colors py-2 font-bold disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Admin'}
          </button>
        </form>

        <div className="mt-4 text-xs text-gray-500">
          Already have an account?{' '}
          <button
            type="button"
            className="text-[#FF8C00] hover:underline"
            onClick={() => router.replace('/admin/login')}
          >
            Go to login
          </button>
        </div>
      </div>
    </div>
  );
}

