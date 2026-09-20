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

/** Return an account id only after signature, claims, account-state, and session-version checks. */
export async function getCustomerId(): Promise<string | null> {
  return getCustomerIdFromCookie();
}
