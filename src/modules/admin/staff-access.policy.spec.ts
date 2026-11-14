import { canGrantRole, canManageUser, type RoleSnapshot, type StaffActor } from './staff-access.policy';

const ALL = [
  'viewBookings',
  'editBookings',
  'cancelBookings',
  'manageStaff',
  'manageClients',
  'manageServices',
  'manageCities',
  'viewReports',
  'manageRoles',
  'manageComplaints',
  'manageFinance',
  'manageContent',
];

// Mirrors prisma/seed.ts
const superAdmin: RoleSnapshot = { key: 'super-admin', permissions: ALL };
const management: RoleSnapshot = { key: 'management', permissions: ALL.filter((p) => p !== 'manageRoles') };
const supervisor: RoleSnapshot = {
  key: 'supervisor',
  permissions: ['viewBookings', 'editBookings', 'manageStaff', 'manageClients', 'viewReports', 'manageComplaints'],
};
const branchManager: RoleSnapshot = {
  key: 'branch-manager',
  permissions: [
    'viewBookings',
    'editBookings',
    'cancelBookings',
    'manageStaff',
    'manageClients',
    'manageCities',
    'viewReports',
    'manageComplaints',
  ],
};
const accountant: RoleSnapshot = { key: 'accountant', permissions: ['viewBookings', 'viewReports', 'manageFinance'] };

const actor = (role: RoleSnapshot | null): StaffActor => ({ id: 'actor', role });

describe('staff-access.policy', () => {
  describe('canGrantRole', () => {
    it('lets super-admin grant any role, including super-admin', () => {
      expect(canGrantRole(actor(superAdmin), superAdmin)).toBe(true);
      expect(canGrantRole(actor(superAdmin), management)).toBe(true);
    });

    it('never lets a non super-admin grant super-admin', () => {
      expect(canGrantRole(actor(management), superAdmin)).toBe(false);
      expect(canGrantRole(actor(supervisor), superAdmin)).toBe(false);
      expect(canGrantRole(actor(branchManager), superAdmin)).toBe(false);
    });

    it('blocks super-admin by key even if its permission list was reduced', () => {
      const reduced: RoleSnapshot = { key: 'super-admin', permissions: ['viewBookings'] };
      expect(canGrantRole(actor(supervisor), reduced)).toBe(false);
    });

    it('blocks granting a role with permissions the actor lacks', () => {
      expect(canGrantRole(actor(supervisor), management)).toBe(false);
      expect(canGrantRole(actor(supervisor), branchManager)).toBe(false); // cancelBookings, manageCities
      expect(canGrantRole(actor(supervisor), accountant)).toBe(false); // manageFinance
    });

    it('allows granting a role whose permissions are a subset', () => {
      expect(canGrantRole(actor(management), supervisor)).toBe(true);
      expect(canGrantRole(actor(management), accountant)).toBe(true);
      expect(canGrantRole(actor(branchManager), supervisor)).toBe(true);
    });

    it('denies an actor without any role', () => {
      expect(canGrantRole(actor(null), accountant)).toBe(false);
    });
  });

  describe('canManageUser', () => {
    it('blocks managing a super-admin unless the actor is super-admin', () => {
      expect(canManageUser(actor(management), superAdmin)).toBe(false);
      expect(canManageUser(actor(supervisor), superAdmin)).toBe(false);
      expect(canManageUser(actor(superAdmin), superAdmin)).toBe(true);
    });

    it('blocks managing a user with more permissions', () => {
      expect(canManageUser(actor(supervisor), management)).toBe(false);
    });

    it('allows managing a staff account without a role', () => {
      expect(canManageUser(actor(supervisor), null)).toBe(true);
    });
  });
});
