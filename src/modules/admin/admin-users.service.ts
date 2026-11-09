import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import argon2 from 'argon2';
import { UserRole, type Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';

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

    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: userPublicSelect,
    });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone?.trim() || null;

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
      select: { id: true, key: true },
    });
    if (!role) {
      throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });
    }

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

    return this.prisma.user.create({
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
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
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
    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: dto.roleId },
        select: { key: true },
      });
      if (!role) {
        throw new BadRequestException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });
      }
      newRole = ADMIN_ROLE_KEYS.includes(role.key) ? UserRole.ADMIN : UserRole.STAFF;
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
        ...(dto.roleId ? { roleId: dto.roleId } : {}),
        ...(newRole ? { role: newRole } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: userPublicSelect,
    });
  }

  async remove(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, roleId: true, roleRef: { select: { key: true } } },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
    }

    if (user.roleRef?.key === 'super-admin') {
      const count = await this.prisma.user.count({
        where: { roleId: user.roleId, deletedAt: null, isActive: true, NOT: { id } },
      });
      if (count === 0) {
        throw new BadRequestException({
          code: 'LAST_SUPER_ADMIN',
          message: 'لا يمكن حذف آخر مدير نظام',
        });
      }
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

    return { deleted: true, id };
  }

  async resetPassword(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });
    }

    const newPassword = randomBytes(6).toString('base64url').slice(0, 10);
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

    return {
      password: newPassword,
      message: 'تم إعادة تعيين كلمة المرور. يرجى إبلاغ الموظفة بكلمة المرور الجديدة.',
    };
  }
}
