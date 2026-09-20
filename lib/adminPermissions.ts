export function hasAdminPermission(permissions: readonly string[], permission: string) {
  return permissions.includes('*') || permissions.includes(permission);
}
