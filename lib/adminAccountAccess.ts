import { getAdminSessionState } from '@/lib/adminJwt';

export type AdminAccountAuthorization =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403 | 503; error: string };

/** Admin account creation grants full dashboard access, so only a full admin can manage it. */
export async function authorizeAdminAccountManagement(): Promise<AdminAccountAuthorization> {
  const state = await getAdminSessionState();
  if (state.status === 'database_unavailable') {
    return { ok: false, status: 503, error: 'DATABASE_UNAVAILABLE' };
  }
  if (state.status !== 'valid') return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  if (!state.permissions.includes('*')) return { ok: false, status: 403, error: 'FORBIDDEN' };
  return { ok: true, adminId: state.accountId };
}
