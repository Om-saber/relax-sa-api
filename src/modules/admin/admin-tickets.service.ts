import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketStatus } from '@prisma/client';

@Injectable()
export class AdminTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.ticket.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateTicketDto) {
    // توليد رقم تذكرة فريد
    const count = await this.prisma.ticket.count();
    const ticketNumber = `CRM-${(count + 501).toString()}`;

    return this.prisma.ticket.create({
      data: {
        ticketNumber,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        category: dto.category,
        subject: dto.subject,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        status: 'NEW',
      },
    });
  }

  async updateStatus(id: string, status: TicketStatus, resolutionNotes?: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException({ message: 'التذكرة غير موجودة' });

    return this.prisma.ticket.update({
      where: { id },
      data: {
        status,
        resolutionNotes: resolutionNotes !== undefined ? resolutionNotes : ticket.resolutionNotes,
        resolvedAt: status === 'RESOLVED' ? new Date() : ticket.resolvedAt,
      },
    });
  }
}
