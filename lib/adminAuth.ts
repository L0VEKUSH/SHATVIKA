import { clearAdminJwtSession, isAdminJwtAuthed, setAdminJwtSession } from '@/lib/adminJwt';
import { type AdminDoc } from '@/models/Admin';

export async function setAdminSession() {
  await setAdminJwtSession();
}

export async function setAdminSessionForAdmin(adminId: string, admin?: AdminDoc) {
  await setAdminJwtSession(adminId, admin);
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





