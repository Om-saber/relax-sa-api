import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        phoneVerifiedAt: true,
        createdAt: true,
        clientProfile: {
          select: {
            id: true,
            tier: true,
            totalBookings: true,
            totalSpent: true,
            lastBookingDate: true,
            district: true,
            address: true,
            cityId: true,
          },
        },
        staffProfile: {
          select: {
            id: true,
            staffCode: true,
            roleTitle: true,
            commissionRate: true,
            status: true,
            rating: true,
            reviewsCount: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'المستخدمة غير موجودة' });

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'هذا البريد الإلكتروني مستخدم بالفعل',
        });
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
      },
    });

    if (dto.district !== undefined || dto.address !== undefined || dto.cityId !== undefined) {
      await this.prisma.clientProfile.updateMany({
        where: { userId },
        data: {
          ...(dto.district !== undefined ? { district: dto.district } : {}),
          ...(dto.address !== undefined ? { address: dto.address } : {}),
          ...(dto.cityId !== undefined ? { cityId: dto.cityId } : {}),
        },
      });
    }

    return this.getProfile(userId);
  }
}
