'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ApiClientError, apiRequest } from '@/lib/apiClient';

type WorkerRow = {
  id: string;
  name: string;
  email: string;
  locationId: string;
  locationMatches: boolean;
  permissions: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};
type CounterLocation = { id: string; name: string };

const field = 'mt-1 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-sm text-white outline-none focus:border-orange-400';

function friendlyError(error: unknown) {
  if (!(error instanceof ApiClientError)) return 'The request failed. Try again.';
  const messages: Record<string, string> = {
    WORKER_ALREADY_EXISTS: 'A worker with this email already exists. No account was overwritten.',
    VALIDATION_FAILED: 'Check the fields. Passwords require at least 12 characters plus upper/lowercase, a number, and a symbol.',
    FORBIDDEN: 'Your admin account does not have worker-management permission.',
    TOO_MANY_REQUESTS: 'Too many changes were attempted. Wait briefly and retry.',
    INVALID_COUNTER_LOCATION: 'The location must match the configured counter. Refresh this page and try again.',
  };
  return messages[error.code] ?? error.message;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', locationId: '' });
  const [configuredLocationId, setConfiguredLocationId] = useState('');
  const [locations, setLocations] = useState<CounterLocation[]>([]);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [locationDrafts, setLocationDrafts] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<{ id: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest<{
        ok: true;
        workers: WorkerRow[];
        configuredLocationId: string;
        locations: CounterLocation[];
        locationConfiguration: { explicit: boolean; warning: string | null };
      }>('/api/admin/workers?limit=100', { cache: 'no-store' });
      setWorkers(data.workers ?? []);
      setConfiguredLocationId(data.configuredLocationId);
      setLocations(data.locations ?? []);
      setLocationWarning(data.locationConfiguration.warning);
      setLocationDrafts(Object.fromEntries((data.workers ?? []).map(worker => [
        worker.id,
        worker.locationMatches ? worker.locationId : data.configuredLocationId,
      ])));
      setForm(current => ({ ...current, locationId: data.configuredLocationId }));
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createWorker(event: FormEvent) {
    event.preventDefault();
    if (busyId) return;
    setBusyId('create'); setError(null); setNotice(null);
    try {
      await apiRequest('/api/admin/workers', { method: 'POST', body: form });
      setForm(current => ({ ...current, name: '', email: '', password: '' }));
      setNotice('Worker created. Their password was not retained by this page.');
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusyId(null); }
  }

  async function updateWorker(id: string, body: Record<string, unknown>, success: string) {
    if (busyId) return;
    setBusyId(id); setError(null); setNotice(null);
    try {
      await apiRequest(`/api/admin/workers/${id}`, { method: 'PATCH', body });
      setNotice(success);
      setReset(null);
      await load();
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setBusyId(null); }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-3xl font-black text-white">Counter workers</h1>
        <p className="mt-2 text-sm text-gray-400">Create restricted counter operators, assign one location, revoke access, and reset credentials. There is no public worker signup.</p>
      </header>

      <div aria-live="polite" className="space-y-2">
        {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-200">{notice}</p>}
        {locationWarning && <p role="alert" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{locationWarning} Add it to the server environment and restart before production use.</p>}
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="text-lg font-bold text-white">Create worker</h2>
        <form onSubmit={createWorker} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-gray-300">Name<input className={field} name="name" autoComplete="name" required minLength={2} maxLength={120} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-300">Email<input className={field} name="email" type="email" autoComplete="off" required maxLength={120} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-300">Temporary password<input className={field} name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label>
          <label className="text-xs font-semibold text-gray-300">Counter location<select className={field} name="locationId" required value={form.locationId} onChange={event => setForm({ ...form, locationId: event.target.value })}>{locations.map(location => <option key={location.id} value={location.id}>{location.name} ({location.id})</option>)}</select></label>
          <button disabled={busyId !== null} className="min-h-11 rounded-xl bg-gradient-to-r from-[#FF4500] to-[#FF8C00] px-5 py-2.5 font-bold text-white disabled:opacity-50 md:col-span-2">{busyId === 'create' ? 'Creating securely…' : 'Create authorized worker'}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-white">Authorized workers</h2><button type="button" onClick={() => void load()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-200">Refresh</button></div>
        {loading ? <p role="status" className="mt-5 text-sm text-gray-400">Loading workers…</p> : workers.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-white/10 p-5 text-sm text-gray-400">No worker accounts exist yet.</p> : (
          <div className="mt-4 space-y-3">
            {workers.map(worker => (
              <article key={worker.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="font-bold text-white">{worker.name}</p><p className="text-sm text-gray-400">{worker.email}</p><p className="mt-1 font-mono text-xs text-gray-500">{worker.locationId} · counter:operate</p>{!worker.locationMatches && <p role="alert" className="mt-2 text-xs font-semibold text-amber-300">Location mismatch: this account cannot enter the configured queue ({configuredLocationId}).</p>}</div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${worker.isActive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'}`}>{worker.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" disabled={busyId !== null} onClick={() => void updateWorker(worker.id, { action: worker.isActive ? 'deactivate' : 'activate' }, worker.isActive ? 'Worker deactivated and existing sessions revoked.' : 'Worker activated; old revoked sessions remain invalid.')} className="min-h-10 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-200 disabled:opacity-50">{worker.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button type="button" disabled={busyId !== null} onClick={() => setReset({ id: worker.id, password: '' })} className="min-h-10 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-gray-200 disabled:opacity-50">Reset password</button>
                  <label className="min-w-56 text-xs font-semibold text-gray-300">Assigned location<select aria-label={`Assigned location for ${worker.name}`} className={field} value={locationDrafts[worker.id] ?? configuredLocationId} onChange={event => setLocationDrafts(current => ({ ...current, [worker.id]: event.target.value }))}>{locations.map(location => <option key={location.id} value={location.id}>{location.name} ({location.id})</option>)}</select></label>
                  <button type="button" disabled={busyId !== null || !locationDrafts[worker.id] || (worker.locationMatches && locationDrafts[worker.id] === worker.locationId)} onClick={() => void updateWorker(worker.id, { action: 'assign_location', locationId: locationDrafts[worker.id] }, `Worker assigned to ${locationDrafts[worker.id]}; existing sessions were revoked.`)} className="min-h-10 self-end rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-200 disabled:opacity-50">Save location</button>
                </div>
                {reset?.id === worker.id && (
                  <form onSubmit={event => { event.preventDefault(); void updateWorker(worker.id, { action: 'reset_password', password: reset.password }, 'Password reset and every previous worker session revoked.'); }} className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-xs font-semibold text-gray-300">New password<input className={field} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={reset.password} onChange={event => setReset({ ...reset, password: event.target.value })} /></label>
                    <button disabled={busyId !== null} className="min-h-11 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save and revoke sessions</button>
                    <button type="button" onClick={() => setReset(null)} className="min-h-11 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300">Cancel</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
