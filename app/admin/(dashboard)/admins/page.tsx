'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '@/lib/apiClient';

type AdminRow = {
  id: string;
  email: string;
  role: string;
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
};

const field = 'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-400';

function friendlyError(error: unknown) {
  if (!(error instanceof ApiClientError)) return 'The request failed. Try again.';
  const messages: Record<string, string> = {
    ADMIN_ALREADY_EXISTS: 'An admin with this email already exists.',
    VALIDATION_FAILED: 'Enter a valid email and a password with at least 12 characters, uppercase and lowercase letters, a number, and a symbol.',
    FORBIDDEN: 'Only a full administrator can create admin accounts.',
    TOO_MANY_REQUESTS: 'Too many accounts were created. Wait briefly and try again.',
  };
  return messages[error.code] ?? error.message;
}

export default function AdminAccountsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiRequest<{ ok: true; admins: AdminRow[] }>('/api/admin/admins', { cache: 'no-store' });
      setAdmins(data.admins ?? []);
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createAdmin(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/admin/admins', { method: 'POST', body: { email, password } });
      setEmail('');
      setPassword('');
      setNotice('Admin account created. Share the login email and password with the new administrator privately.');
      await load();
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-black text-white">Admin accounts</h1>
        <p className="mt-2 text-sm text-gray-400">Create sign-in accounts for trusted administrators. Each account has full dashboard access.</p>
      </header>

      <div aria-live="polite" className="space-y-2">
        {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p>}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-bold text-white">Create admin</h2>
        <form onSubmit={createAdmin} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-300">Email<input className={field} type="email" name="email" autoComplete="off" required maxLength={120} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label className="text-xs font-semibold text-gray-300">Initial password<input className={field} type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
          <p className="text-xs text-gray-500 md:col-span-2">Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.</p>
          <button disabled={submitting} className="min-h-11 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{submitting ? 'Creating…' : 'Create admin account'}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-white">Existing admins</h2><button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-200">Refresh</button></div>
        {loading ? <p role="status" className="mt-5 text-sm text-gray-400">Loading admins…</p> : admins.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-gray-400">No admin accounts found.</p> : (
          <ul className="mt-4 space-y-2">
            {admins.map(admin => <li key={admin.id} className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold text-white">{admin.email}</span><span className="text-xs text-emerald-300">{admin.isActive ? 'Active · full dashboard access' : 'Inactive'}</span></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
