/**
 * P0-3 (d): invalid booking ids are rejected with 400 before reaching the service.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// @nestjs/axios ships ESM that ts-jest can't load; the service is mocked anyway.
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const BOOKING = '11111111-1111-4111-8111-111111111111';

describe('PaymentsController — P0-3 route validation', () => {
  let app: INestApplication;
  const service = {
    createOrderForBooking: jest.fn(async () => ({ paymentId: 'pay-1' })),
    getPaymentStatusForBooking: jest.fn(async (bookingId: string) => ({ bookingId })),
    captureOrderForBooking: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();

    app = moduleRef.createNestApplication();
    // Stand-in for JwtAuthGuard: attach an authenticated user.
    app.use((req: any, _res: unknown, next: () => void) => {
      req.user = { id: 'u-owner' };
      next();
    });
    // Same options as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('(d) GET /payments/booking/:bookingId/status with an invalid UUID → 400', async () => {
    await request(app.getHttpServer()).get('/payments/booking/not-a-uuid/status').expect(400);
    expect(service.getPaymentStatusForBooking).not.toHaveBeenCalled();
  });

  it('(d) POST /payments/paypal/create-order with an invalid bookingId → 400', async () => {
    await request(app.getHttpServer())
      .post('/payments/paypal/create-order')
      .send({ bookingId: 'not-a-uuid' })
      .expect(400);
    expect(service.createOrderForBooking).not.toHaveBeenCalled();
  });

  it('(e) valid UUID passes through with the authenticated user id', async () => {
    await request(app.getHttpServer()).get(`/payments/booking/${BOOKING}/status`).expect(200);
    expect(service.getPaymentStatusForBooking).toHaveBeenCalledWith(BOOKING, 'u-owner');

    await request(app.getHttpServer())
      .post('/payments/paypal/create-order')
      .send({ bookingId: BOOKING })
      .expect(201);
    expect(service.createOrderForBooking).toHaveBeenCalledWith(BOOKING, 'u-owner');
  });
});
