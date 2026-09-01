/**
 * Pure frontend authorization helpers.
 *
 * These exist for UX only — every sensitive rule is enforced again server-side
 * by RLS policies and SECURITY DEFINER RPCs. Keeping them pure makes the role
 * matrix testable and prevents each page from re-inventing the check.
 */

export type AppRole = 'admin' | 'manager' | 'cashier' | 'super_admin';

const MANAGEMENT_ROLES: AppRole[] = ['admin', 'manager', 'super_admin'];
const ADMIN_ROLES: AppRole[] = ['admin', 'super_admin'];

function hasAny(role: AppRole | null | undefined, allowed: AppRole[]): boolean {
  return !!role && allowed.includes(role);
}

/** Products, promotions, loyalty packages, devices and rate plans. */
export function canManageCatalog(role: AppRole | null | undefined): boolean {
  return hasAny(role, MANAGEMENT_ROLES);
}

/** Refunding a paid ticket. */
export function canRefundTicket(role: AppRole | null | undefined): boolean {
  return hasAny(role, MANAGEMENT_ROLES);
}

/** Creating/editing devices. */
export function canManageDevices(role: AppRole | null | undefined): boolean {
  return hasAny(role, MANAGEMENT_ROLES);
}

/** Tenant user management (invites, role changes). */
export function canManageUsers(role: AppRole | null | undefined): boolean {
  return hasAny(role, ADMIN_ROLES);
}

/**
 * A tenant admin may only ever hand out tenant-level roles. Granting
 * super_admin is never allowed from the app — the database rejects it too.
 */
export function canGrantRole(
  actorRole: AppRole | null | undefined,
  targetRole: AppRole
): boolean {
  if (targetRole === 'super_admin') return false;
  return canManageUsers(actorRole);
}

export function isSuperAdmin(role: AppRole | null | undefined): boolean {
  return role === 'super_admin';
}
