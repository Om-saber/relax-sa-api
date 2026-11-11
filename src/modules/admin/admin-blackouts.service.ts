import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBlackoutDto } from './dto/create-blackout.dto';

@Injectable()
export class AdminBlackoutsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.blackoutDate.findMany({
      where: { active: true },
      include: { city: { select: { nameAr: true } } },
      orderBy: { date: 'asc' },
    });
  }

  async create(dto: CreateBlackoutDto) {
    return this.prisma.blackoutDate.create({
      data: {
        title: dto.title,
        date: new Date(dto.date),
        cityId: dto.cityId || null,
      },
      include: { city: { select: { nameAr: true } } },
    });
  }

  async remove(id: string) {
    const blk = await this.prisma.blackoutDate.findUnique({ where: { id } });
    if (!blk) {
      throw new NotFoundException({
        code: 'BLACKOUT_NOT_FOUND',
        message: 'التاريخ غير موجود',
      });
    }

    await this.prisma.blackoutDate.update({
      where: { id },
      data: { active: false },
    });
    return { success: true, id };
  }
}
