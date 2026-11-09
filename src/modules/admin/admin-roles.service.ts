import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        permissions: { include: { permission: { select: { key: true, label: true } } } },
        _count: { select: { users: true } },
      },
    });

    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      nameAr: r.nameAr,
      nameEn: r.nameEn,
      description: r.description,
      isSystem: r.isSystem,
      usersCount: r._count.users,
      permissions: r.permissions.map((rp) => rp.permission.key),
    }));
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
      select: { id: true, key: true, label: true },
    });
  }

  async updateRolePermissions(roleId: string, dto: UpdateRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'الدور غير موجود' });
    }
    if (role.key === 'super-admin') {
      throw new BadRequestException({
        code: 'CANNOT_MODIFY_SUPER_ADMIN',
        message: 'لا يمكن تعديل صلاحيات مدير النظام',
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: dto.permissions } },
      select: { id: true, key: true },
    });
    const foundKeys = new Set(permissions.map((p) => p.key));
    const missing = dto.permissions.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_PERMISSIONS',
        message: `الصلاحيات غير موجودة: ${missing.join(', ')}`,
      });
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
      }),
    ]);

    const updated = await this.listRoles();
    return updated.find((r) => r.id === roleId);
  }
}
