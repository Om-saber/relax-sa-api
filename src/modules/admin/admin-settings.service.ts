import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_BOOKING_SETTINGS = {
  allowSpecialistSelection: false,
  specialistSelectionMode: 'auto',
  showStaffRatings: true,
  mandatoryTimeSelection: true,
  minAdvanceBookingHours: 2,
  maxAdvanceBookingDays: 30,
  timeSelectionOnServicePage: false,
  showCalendarInQuickView: true,
  requireTermsApproval: true,
  termsRequireExplicitCheckbox: true,
  termsPageUrl: '/terms',
  customOtpSenderEnabled: true,
  smsGatewayProvider: 'Taqnyat',
  senderName: 'Relax-Spa',
  smsRemainingBalance: 1450,
  autoResendTimeoutSeconds: 60,
};

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookingSettings(): Promise<Record<string, unknown>> {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'booking' },
    });

    if (!row) {
      await this.prisma.setting.create({
        data: {
          key: 'booking',
          value: DEFAULT_BOOKING_SETTINGS as unknown as Prisma.InputJsonValue,
        },
      });
      return DEFAULT_BOOKING_SETTINGS;
    }

    return {
      ...DEFAULT_BOOKING_SETTINGS,
      ...(row.value as Record<string, unknown>),
    };
  }

  async updateBookingSettings(
    patch: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const current = await this.getBookingSettings();
    const next = { ...current, ...patch };

    await this.prisma.setting.upsert({
      where: { key: 'booking' },
      create: { key: 'booking', value: next as unknown as Prisma.InputJsonValue },
      update: { value: next as unknown as Prisma.InputJsonValue },
    });

    return next;
  }
}
