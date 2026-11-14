import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Regression tests for P0-1 (privilege escalation through /admin/users).
 * Uses a tiny in-memory Prisma double so the rules are checked end to end
 * through the service, without a database.
 */

type FakeUser = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  roleId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  tokenVersion: number;
  passwordHash?: string;
};

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

const ROLES: Record<string, { id: string; key: string; permissions: string[] }> = {
  'role-super': { id: 'role-super', key: 'super-admin', permissions: ALL },
  'role-supervisor': {
    id: 'role-supervisor',
    key: 'supervisor',
    permissions: ['viewBookings', 'editBookings', 'manageStaff', 'manageClients', 'viewReports', 'manageComplaints'],
  },
  'role-cs': {
    id: 'role-cs',
    key: 'customer-service',
    permissions: ['viewBookings', 'editBookings', 'manageClients', 'manageComplaints'],
  },
};

function roleRef(roleId: string | null) {
  const role = roleId ? ROLES[roleId] : undefined;
  if (!role) return null;
  return { key: role.key, permissions: role.permissions.map((key) => ({ permission: { key } })) };
}

function makePrisma(users: FakeUser[]) {
  const audits: Array<Record<string, unknown>> = [];
  const revoked: string[] = [];

  const matches = (u: FakeUser, where: any): boolean => {
    if (!where) return true;
    if (where.id !== undefined && u.id !== where.id) return false;
    if (where.deletedAt === null && u.deletedAt !== null) return false;
    if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
    if (where.roleId !== undefined && u.roleId !== where.roleId) return false;
    if (where.email !== undefined && u.email !== where.email) return false;
    if (where.role?.in && !where.role.in.includes(u.role)) return false;
    if (where.NOT?.id && u.id === where.NOT.id) return false;
    if (where.OR && !where.OR.some((w: any) => matches(u, w))) return false;
    return true;
  };

  const view = (u: FakeUser) => ({ ...u, roleRef: roleRef(u.roleId) });

  const user = {
    findFirst: async ({ where }: any) => {
      const found = users.find((u) => matches(u, where));
      return found ? view(found) : null;
    },
    count: async ({ where }: any) => users.filter((u) => matches(u, where)).length,
    create: async ({ data }: any) => {
      const created: FakeUser = {
        id: `user-${users.length + 1}`,
        tokenVersion: 0,
        deletedAt: null,
        ...data,
      };
      users.push(created);
      return view(created);
    },
    update: async ({ where, data }: any) => {
      const target = users.find((u) => u.id === where.id)!;
      for (const [key, value] of Object.entries(data)) {
        if (key === 'tokenVersion' && typeof value === 'object') target.tokenVersion += 1;
        else (target as any)[key] = value;
      }
      return view(target);
    },
  };

  const prisma = {
    user,
    role: {
      findUnique: async ({ where }: any) => {
        const role = ROLES[where.id];
        return role ? { id: role.id, ...roleRef(role.id)! } : null;
      },
    },
    refreshToken: {
      updateMany: async ({ where }: any) => {
        revoked.push(where.userId);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        audits.push(data);
        return data;
      },
    },
    staffProfile: { findUnique: async () => null },
    $transaction: async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
  };

  return { prisma: prisma as unknown as PrismaService, audits, revoked };
}

function seedUsers(): FakeUser[] {
  const base = { deletedAt: null, isActive: true, tokenVersion: 0, phone: null };
  return [
    { ...base, id: 'u-super', name: 'Admin', email: 'admin@relax.sa', role: 'ADMIN', roleId: 'role-super' },
    { ...base, id: 'u-super-2', name: 'Admin 2', email: 'admin2@relax.sa', role: 'ADMIN', roleId: 'role-super' },
    { ...base, id: 'u-sup', name: 'Supervisor', email: 'sup@relax.sa', role: 'STAFF', roleId: 'role-supervisor' },
    { ...base, id: 'u-cs', name: 'CS', email: 'cs@relax.sa', role: 'STAFF', roleId: 'role-cs' },
    { ...base, id: 'u-client', name: 'Client', email: null, phone: '0500000000', role: 'CUSTOMER', roleId: null },
  ];
}

async function expectRejects(promise: Promise<unknown>, type: Function, code?: string) {
  let error: any;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (!(error instanceof type)) {
    throw new Error(`expected ${type.name}, got ${error?.constructor?.name ?? 'no error'}`);
  }
  const actualCode = (error as { getResponse(): { code?: string } }).getResponse().code;
  if (code && actualCode !== code) {
    throw new Error(`expected code ${code}, got ${actualCode}`);
  }
}

describe('AdminUsersService — P0-1 privilege escalation', () => {
  it('supervisor cannot create a super-admin account', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(
      service.create(
        { name: 'Evil', email: 'evil@relax.sa', password: 'Password123', roleId: 'role-super' },
        'u-sup',
      ),
      ForbiddenException,
      'ROLE_NOT_ASSIGNABLE',
    );
  });

  it('supervisor cannot promote themselves', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(service.update('u-sup', { roleId: 'role-super' }, 'u-sup'), ForbiddenException);
  });

  it('supervisor cannot promote another staff member to super-admin', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(
      service.update('u-cs', { roleId: 'role-super' }, 'u-sup'),
      ForbiddenException,
      'ROLE_NOT_ASSIGNABLE',
    );
  });

  it('supervisor cannot reset the super-admin password', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(service.resetPassword('u-super', 'u-sup'), ForbiddenException, 'USER_NOT_MANAGEABLE');
  });

  it('supervisor cannot delete or disable the super-admin', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(service.remove('u-super', 'u-sup'), ForbiddenException, 'USER_NOT_MANAGEABLE');
    await expectRejects(service.update('u-super', { isActive: false }, 'u-sup'), ForbiddenException);
  });

  it('customer accounts cannot be edited through the staff endpoint', async () => {
    const { prisma } = makePrisma(seedUsers());
    const service = new AdminUsersService(prisma);
    await expectRejects(service.update('u-client', { roleId: 'role-cs' }, 'u-super'), NotFoundException);
  });

  it('super-admin can change a role; sessions are revoked and the change is audited', async () => {
    const users = seedUsers();
    const { prisma, audits, revoked } = makePrisma(users);
    const service = new AdminUsersService(prisma);

    await service.update('u-cs', { roleId: 'role-supervisor' }, 'u-super');

    const cs = users.find((u) => u.id === 'u-cs')!;
    expect(cs.roleId).toBe('role-supervisor');
    expect(cs.tokenVersion).toBe(1);
    expect(revoked.includes('u-cs')).toBe(true);
    expect(audits.length).toBe(1);
    expect(audits[0].action).toBe('user.update');
  });

  it('supervisor can still manage a lower role (customer service)', async () => {
    const users = seedUsers();
    const { prisma } = makePrisma(users);
    const service = new AdminUsersService(prisma);

    await service.update('u-cs', { name: 'CS Renamed' }, 'u-sup');
    expect(users.find((u) => u.id === 'u-cs')!.name).toBe('CS Renamed');
  });
});
