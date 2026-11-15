import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { UserRole, type Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';
import {
  SUPER_ADMIN_ROLE_KEY,
  canGrantRole,
  canManageUser,
  type RoleSnapshot,
  type StaffActor,
} from './staff-access.policy';

const ADMIN_ROLE_KEYS = ['super-admin', 'management', 'branch-manager'];

const userPublicSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  roleId: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  roleRef: { select: { key: true, nameAr: true, nameEn: true } },
  staffProfile: {
    select: {
      id: true,
      staffCode: true,
      status: true,
      roleTitle: true,
      rating: true,
      reviewsCount: true,
      commissionRate: true,
      avatarUrl: true,
      isPartOfTeam: true,
      completedBookingsCount: true,
      cityId: true,
      services: {
        select: { service: { select: { titleAr: true, titleEn: true } } },
      },
      offDays: {
        select: { id: true, weekday: true },
      },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryUsersDto) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      role: { in: [UserRole.ADMIN, UserRole.STAFF] },
    };

    if (query.roleId) where.roleId = query.roleId;
    if (query.roleKey) where.roleRef = { key: query.roleKey };
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: userPublicSelect,
    });

    // Lookup cities for staff profiles
    const cityIds = users
      .map((u) => u.staffProfile?.cityId)
      .filter((id): id is string => Boolean(id));
    const cities = cityIds.length
      ? await this.prisma.city.findMany({
          where: { id: { in: cityIds } },
          select: { id: true, nameAr: true, key: true },
        })
      : [];
    const cityMap = new Map(cities.map((c) => [c.id, c.nameAr]));

    return users.map((u) => {
      const sp = u.staffProfile as any;
      if (!sp) return u;
      return {
        ...u,
        staffProfile: {
          ...sp,
          city: sp.cityId ? cityMap.get(sp.cityId) ?? null : null,
          specialties: (sp.services || [])
            .map((s: any) => s.service?.titleAr)
            .filter(Boolean),
        },
      };
    });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const actor = await this.loadActor(actorId);
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;

    const role = await this.loadRole(dto.roleId);
    if (!role) {
      throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });
    }
    this.assertCanGrant(actor, role);

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
      select: { id: true, email: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'USER_EXISTS',
        message: existing.email === email ? 'البريد الإلكتروني مستخدم بالفعل' : 'رقم الجوال مستخدم بالفعل',
      });
    }

    const userRole = ADMIN_ROLE_KEYS.includes(role.key) ? UserRole.ADMIN : UserRole.STAFF;
    const passwordHash = await argon2.hash(dto.password);

    const created = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone,
        passwordHash,
        role: userRole,
        roleId: role.id,
        isActive: true,
      },
      select: userPublicSelect,
    });

    await this.audit(actor.id, 'user.create', created.id, null, {
      email,
      roleKey: role.key,
    });

    return created;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const actor = await this.loadActor(actorId);
    const target = await this.loadManageableTarget(id);
    this.assertCanManage(actor, target.role);

    const isSelf = target.id === actor.id;
    const roleChanged = Boolean(dto.roleId) && dto.roleId !== target.roleId;
    const deactivating = dto.isActive === false && target.isActive;

    if (isSelf && (roleChanged || dto.isActive === false)) {
      throw new ForbiddenException({
        code: 'CANNOT_MODIFY_SELF',
        message: 'لا يمكنكِ تغيير دوركِ أو تعطيل حسابكِ بنفسكِ',
      });
    }

    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const conflict = await this.prisma.user.findFirst({
        where: { email, NOT: { id } },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'البريد الإلكتروني مستخدم بالفعل' });
      }
    }

    let newRole: UserRole | undefined;
    let newRoleKey: string | undefined;
    if (roleChanged) {
      const role = await this.loadRole(dto.roleId!);
      if (!role) {
        throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });
      }
      this.assertCanGrant(actor, role);
      if (target.role?.key === SUPER_ADMIN_ROLE_KEY) {
        await this.assertNotLastSuperAdmin(target.id, target.roleId);
      }
      newRole = ADMIN_ROLE_KEYS.includes(role.key) ? UserRole.ADMIN : UserRole.STAFF;
      newRoleKey = role.key;
    }

    if (deactivating && target.role?.key === SUPER_ADMIN_ROLE_KEY) {
      await this.assertNotLastSuperAdmin(target.id, target.roleId);
    }

    // A role change or a deactivation must end every live session immediately.
    const revokeSessions = roleChanged || deactivating;

    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim() } : {}),
          ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          ...(roleChanged ? { roleId: dto.roleId, role: newRole } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
        },
        select: userPublicSelect,
      });

      if (revokeSessions) {
        await tx.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return user;
    });

    await this.audit(
      actor.id,
      'user.update',
      id,
      { roleKey: target.role?.key ?? null, isActive: target.isActive },
      {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(roleChanged ? { roleKey: newRoleKey } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    );

    return updated;
  }

  async remove(id: string, actorId: string) {
    const actor = await this.loadActor(actorId);
    const target = await this.loadManageableTarget(id);
    this.assertCanManage(actor, target.role);

    if (target.id === actor.id) {
      throw new ForbiddenException({
        code: 'CANNOT_MODIFY_SELF',
        message: 'لا يمكنكِ حذف حسابكِ بنفسكِ',
      });
    }

    if (target.role?.key === SUPER_ADMIN_ROLE_KEY) {
      await this.assertNotLastSuperAdmin(target.id, target.roleId);
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.audit(actor.id, 'user.delete', id, { roleKey: target.role?.key ?? null }, null);

    return { deleted: true, id };
  }

  async resetPassword(id: string, actorId: string) {
    const actor = await this.loadActor(actorId);
    const target = await this.loadManageableTarget(id);
    this.assertCanManage(actor, target.role);

    if (target.id === actor.id) {
      throw new ForbiddenException({
        code: 'CANNOT_MODIFY_SELF',
        message: 'لا يمكنكِ إعادة تعيين كلمة مروركِ من هنا',
      });
    }

    const newPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash, tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    // Never log the password itself.
    await this.audit(actor.id, 'user.reset_password', id, null, null);

    return {
      password: newPassword,
      message: 'تم إعادة تعيين كلمة المرور. يرجى إبلاغ الموظفة بكلمة المرور الجديدة.',
    };
  }

  async updateOffDays(staffProfileId: string, weekdays: number[], actorId: string) {
    const actor = await this.loadActor(actorId);
    const staff = await this.prisma.staffProfile.findUnique({
      where: { id: staffProfileId },
      select: { id: true, userId: true },
    });
    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'الموظفة غير موجودة',
      });
    }
    const target = await this.loadManageableTarget(staff.userId);
    this.assertCanManage(actor, target.role);

    const uniqueDays = Array.from(new Set(weekdays)).filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6,
    );

    await this.prisma.$transaction([
      this.prisma.staffOffDay.deleteMany({ where: { staffId: staffProfileId } }),
      ...uniqueDays.map((weekday) =>
        this.prisma.staffOffDay.create({
          data: { staffId: staffProfileId, weekday },
        }),
      ),
    ]);

    return { success: true, weekdays: uniqueDays };
  }

  // ---------------------------------------------------------------------------
  // Authorization helpers (see staff-access.policy.ts)
  // ---------------------------------------------------------------------------

  private async loadActor(actorId: string): Promise<StaffActor> {
    const actor = await this.prisma.user.findFirst({
      where: { id: actorId, deletedAt: null, isActive: true },
      select: {
        id: true,
        roleRef: {
          select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
        },
      },
    });
    if (!actor) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'غير مصرح لك بهذا الإجراء' });
    }
    return { id: actor.id, role: toRoleSnapshot(actor.roleRef) };
  }

  private async loadRole(roleId: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        key: true,
        permissions: { select: { permission: { select: { key: true } } } },
      },
    });
    if (!role) return null;
    return { id: role.id, ...toRoleSnapshot(role)! };
  }

  /** Only staff/admin accounts are managed here; customers are out of scope. */
  private async loadManageableTarget(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null, role: { in: [UserRole.ADMIN, UserRole.STAFF] } },
      select: {
        id: true,
        roleId: true,
        isActive: true,
        roleRef: {
          select: { key: true, permissions: { select: { permission: { select: { key: true } } } } },
        },
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
    }
    return { id: user.id, roleId: user.roleId, isActive: user.isActive, role: toRoleSnapshot(user.roleRef) };
  }

  private assertCanGrant(actor: StaffActor, role: RoleSnapshot) {
    if (!canGrantRole(actor, role)) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_ASSIGNABLE',
        message: 'لا يمكنكِ منح دور بصلاحيات أعلى من صلاحياتكِ',
      });
    }
  }

  private assertCanManage(actor: StaffActor, targetRole: RoleSnapshot | null) {
    if (!canManageUser(actor, targetRole)) {
      throw new ForbiddenException({
        code: 'USER_NOT_MANAGEABLE',
        message: 'لا يمكنكِ إدارة حساب بصلاحيات أعلى من صلاحياتكِ',
      });
    }
  }

  private async assertNotLastSuperAdmin(userId: string, roleId: string | null) {
    const others = await this.prisma.user.count({
      where: { roleId, deletedAt: null, isActive: true, NOT: { id: userId } },
    });
    if (others === 0) {
      throw new BadRequestException({
        code: 'LAST_SUPER_ADMIN',
        message: 'لا يمكن إزالة آخر مدير نظام',
      });
    }
  }

  private async audit(
    actorId: string,
    action: string,
    entityId: string,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'user',
        entityId,
        ...(before !== null ? { before } : {}),
        ...(after !== null ? { after } : {}),
      },
    });
  }
}

function toRoleSnapshot(
  role: { key: string; permissions: Array<{ permission: { key: string } }> } | null,
): RoleSnapshot | null {
  if (!role) return null;
  return { key: role.key, permissions: role.permissions.map((rp) => rp.permission.key) };
}
