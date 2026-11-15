/**
 * Who may create / edit / disable / reset which staff accounts.
 *
 * Rule (no privilege escalation):
 *  - `super-admin` may manage everyone and grant any role.
 *  - Anyone else may only grant a role, or act on a user, whose permissions are a
 *    subset of their own permissions. `super-admin` itself is never grantable or
 *    manageable by a non super-admin, even if its permission list were reduced.
 *  - Nobody may change their own role, disable/delete themselves, or reset their own
 *    password through the admin endpoints.
 *
 * Permissions are always read fresh from the database (never from the JWT), so a
 * stale token cannot be used to escalate.
 */

export const SUPER_ADMIN_ROLE_KEY = 'super-admin';

export interface RoleSnapshot {
  key: string;
  permissions: string[];
}

export interface StaffActor {
  id: string;
  role: RoleSnapshot | null;
}

export function isSuperAdmin(actor: StaffActor): boolean {
  return actor.role?.key === SUPER_ADMIN_ROLE_KEY;
}

/** Can `actor` assign `target` role to someone? */
export function canGrantRole(actor: StaffActor, target: RoleSnapshot): boolean {
  if (!actor.role) return false;
  if (isSuperAdmin(actor)) return true;
  if (target.key === SUPER_ADMIN_ROLE_KEY) return false;

  const granted = new Set(actor.role.permissions);
  return target.permissions.every((permission) => granted.has(permission));
}

/** Can `actor` edit / disable / delete / reset a user currently holding `targetRole`? */
export function canManageUser(actor: StaffActor, targetRole: RoleSnapshot | null): boolean {
  if (!actor.role) return false;
  if (isSuperAdmin(actor)) return true;
  // A staff account without any role has no permissions: always below the actor.
  if (!targetRole) return true;
  return canGrantRole(actor, targetRole);
}
