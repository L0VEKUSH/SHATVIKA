import {
  clearCustomerJwtSession,
  isCustomerJwtAuthed,
  setCustomerJwtSession,
  getCustomerIdFromCookie,
} from '@/lib/customerJwt';
import { type UserDoc } from '@/models/User';

export async function setCustomerSession(userId: string, userData?: UserDoc, rememberMe: boolean = false) {
  await setCustomerJwtSession(userId, userData, rememberMe);
}

export async function clearCustomerSession() {
  await clearCustomerJwtSession();
}

export async function isCustomerAuthed() {
  return isCustomerJwtAuthed();
}

/**
 * Get the current customer ID from the JWT cookie without DB verification.
 * Use in non-security-critical contexts to avoid DB overhead.
 */
export async function getCustomerId(): Promise<string | null> {
  return getCustomerIdFromCookie();
}
