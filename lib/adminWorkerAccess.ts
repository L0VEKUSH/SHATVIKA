import { getAdminSessionState } from '@/lib/adminJwt';

export type WorkerAdminAuthorization =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function authorizeWorkerManagement(): Promise<WorkerAdminAuthorization> {
  const state = await getAdminSessionState();
  if (state.status === 'database_unavailable') {
    return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  }
  if (state.status !== 'valid') return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  if (!state.permissions.includes('*') && !state.permissions.includes('workers:manage')) {
    return { ok: false, status: 403, error: 'FORBIDDEN' };
  }
  return { ok: true, adminId: state.accountId };
}
