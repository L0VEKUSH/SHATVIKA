import { clearAdminJwtSession, isAdminJwtAuthed, setAdminJwtSession } from '@/lib/adminJwt';

export async function setAdminSession() {
  await setAdminJwtSession();
}

export async function clearAdminSession() {
  await clearAdminJwtSession();
}

export async function isAdminAuthed() {
  return isAdminJwtAuthed();
}

// Compatibility export (not used)
export function getAdminSessionTokenForDebug() {
  return undefined;
}



