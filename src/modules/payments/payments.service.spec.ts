/**
 * Regression tests for P0-3 (payments IDOR + payer data leak).
 */
import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';

// @nestjs/axios ships ESM that ts-jest can't load; the service only needs it as a DI type.
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import { PaymentsService } from './payments.service';

const OWNER = 'u-owner';
const OTHER = 'u-other';
const ADMIN = 'u-admin';
const BOOKING = '11111111-1111-4111-8111-111111111111';

const users: Record<string, any> = {
  [OWNER]: { phone: '0500000001', role: 'CUSTOMER', clientProfile: { id: 'cp-owner' } },
  [OTHER]: { phone: '0500000002', role: 'CUSTOMER', clientProfile: { id: 'cp-other' } },
  [ADMIN]: { phone: null, role: 'ADMIN', clientProfile: null },
};

const booking = {
  id: BOOKING,
  bookingNumber: 'RX-1001',
  clientId: 'cp-owner',
  customerPhone: '0500000001',
  status: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  totalPrice: 375,
  deletedAt: null,
};

const rawPayload = { payer: { name: { given_name: 'Sara' }, email_address: 'sara@example.com' } };

const payment = {
  id: 'pay-1',
  bookingId: BOOKING,
  orderId: null,
  amount: 375,
  refundedAmount: 0,
  currency: 'SAR',
  method: 'CARD',
  provider: 'PAYPAL',
  status: 'UNPAID',
  providerRef: 'PAYPAL-ORDER-1',
  idempotencyKey: 'idem-secret',
  rawPayload,
  paidAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** Minimal Prisma fake that honours the ownership `where` used by findOwnedBookingOrThrow. */
function makePrisma() {
  const matches = (where: any) => {
    if (where.id !== booking.id) return false;
    if (!where.OR) return true;
    return where.OR.some(
      (c: any) =>
        (c.clientId && c.clientId === booking.clientId) ||
        (c.customerPhone && c.customerPhone === booking.customerPhone),
    );
  };
  return {
    user: { findFirst: jest.fn(async ({ where }: any) => users[where.id] ?? null) },
    booking: {
      findFirst: jest.fn(async ({ where }: any) => (matches(where) ? { ...booking } : null)),
      update: jest.fn(async () => ({ ...booking, paymentStatus: 'PAID' })),
    },
    payment: {
      findMany: jest.fn(async () => [{ ...payment }]),
      findFirst: jest.fn(async () => ({ ...payment, booking: { ...booking } })),
      create: jest.fn(),
      update: jest.fn(async () => ({ ...payment, status: 'PAID', paidAt: new Date() })),
    },
  };
}

function makeService(prisma = makePrisma()) {
  const config = {
    get: (k: string) =>
      ({ PAYPAL_CLIENT_ID: 'id', PAYPAL_SECRET: 'secret', PAYPAL_BASE_URL: 'https://paypal.test' })[k],
  };
  const http = {
    post: jest.fn((url: string) =>
      url.endsWith('/oauth2/token')
        ? of({ data: { access_token: 't', expires_in: 3600 } })
        : of({ data: { id: 'PAYPAL-ORDER-1', status: 'COMPLETED', ...rawPayload } }),
    ),
    get: jest.fn(),
  };
  const service = new PaymentsService(prisma as any, config as any, http as any);
  return { service, prisma, http };
}

function expectNoSecrets(value: unknown) {
  const json = JSON.stringify(value);
  expect(json).not.toContain('rawPayload');
  expect(json).not.toContain('sara@example.com');
  expect(json).not.toContain('idem-secret');
}

describe('PaymentsService — P0-3 IDOR', () => {
  describe('getPaymentStatusForBooking', () => {
    it("rejects another customer's booking with BOOKING_NOT_FOUND", async () => {
      const { service, prisma } = makeService();
      await expect(service.getPaymentStatusForBooking(BOOKING, OTHER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.payment.findMany).not.toHaveBeenCalled();
    });

    it('returns status to the owner without rawPayload or idempotencyKey', async () => {
      const { service } = makeService();
      const res = await service.getPaymentStatusForBooking(BOOKING, OWNER);
      expect(res.all).toHaveLength(1);
      expect(res.latest?.id).toBe('pay-1');
      expectNoSecrets(res);
    });

    it('lets an admin read any booking status', async () => {
      const { service } = makeService();
      const res = await service.getPaymentStatusForBooking(BOOKING, ADMIN);
      expect(res.bookingId).toBe(BOOKING);
      expectNoSecrets(res);
    });
  });

  describe('createOrderForBooking', () => {
    it("refuses to create a PayPal order for another customer's booking", async () => {
      const { service, prisma, http } = makeService();
      await expect(service.createOrderForBooking(BOOKING, OTHER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(http.post).not.toHaveBeenCalled();
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('captureOrderForBooking (public endpoint)', () => {
    it('does not leak PayPal payer data in the response', async () => {
      const { service } = makeService();
      const res = await service.captureOrderForBooking('PAYPAL-ORDER-1');
      expect(res.success).toBe(true);
      expect(res.booking?.bookingNumber).toBe('RX-1001');
      expectNoSecrets(res);
    });

    it('does not leak payer data when the payment is already PAID', async () => {
      const prisma = makePrisma();
      prisma.payment.findFirst.mockResolvedValueOnce({
        ...payment,
        status: 'PAID',
        booking: { ...booking },
      } as any);
      const { service } = makeService(prisma);
      const res = await service.captureOrderForBooking('PAYPAL-ORDER-1');
      expect(res.alreadyPaid).toBe(true);
      expectNoSecrets(res);
    });
  });
});
