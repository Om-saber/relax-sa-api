/**
 * Regression tests for P1-19 (OTP throttling / SMS pumping).
 */
import { HttpException, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController, OTP_IP_LIMIT_PER_MINUTE } from './auth.controller';
import { AuthService } from './auth.service';

// ─────────────────────────────────────────────────────────────
// Per-IP throttle (HTTP, real ThrottlerGuard)
// ─────────────────────────────────────────────────────────────
describe('AuthController — P1-19 per-IP OTP throttle', () => {
  let app: INestApplication;
  const auth = {
    requestOtp: jest.fn(async () => ({ ok: true })),
    verifyOtp: jest.fn(async () => ({ ok: true })),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      // Same global config as AppModule.
      imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same as main.ts so X-Forwarded-For drives req.ip.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (path: string, ip: string, body: object) =>
    request(app.getHttpServer()).post(path).set('X-Forwarded-For', ip).send(body);

  it('limit is 5 per minute', () => {
    expect(OTP_IP_LIMIT_PER_MINUTE).toBe(5);
  });

  it('(a) 6th OTP request per minute from the same IP returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      await send('/auth/otp/request', '10.0.0.1', { phone: `050000000${i}` }).expect(200);
    }
    await send('/auth/otp/request', '10.0.0.1', { phone: '0500000009' }).expect(429);
    expect(auth.requestOtp).toHaveBeenCalledTimes(5);
  });

  it('(a) 6th OTP verify per minute from the same IP returns 429 (brute force)', async () => {
    const body = { phone: '0500000001', code: '1234' };
    for (let i = 0; i < 5; i++) {
      await send('/auth/otp/verify', '10.0.0.2', body).expect(200);
    }
    await send('/auth/otp/verify', '10.0.0.2', body).expect(429);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(5);
  });

  it('(c) different phones from different IPs all succeed', async () => {
    for (let i = 0; i < 8; i++) {
      await send('/auth/otp/request', `10.0.1.${i}`, { phone: `051000000${i}` }).expect(200);
    }
    expect(auth.requestOtp).toHaveBeenCalledTimes(8);
  });
});

// ─────────────────────────────────────────────────────────────
// Per-phone daily limit (AuthService, mocked clock)
// ─────────────────────────────────────────────────────────────
describe('AuthService — P1-19 per-phone daily OTP limit', () => {
  type Row = { phone: string; createdAt: Date; consumedAt: Date | null };

  function makeService() {
    const rows: Row[] = [];
    const prisma = {
      otpCode: {
        findMany: jest.fn(async ({ where, take }: any) =>
          rows
            .filter((r) => r.phone === where.phone && r.createdAt >= where.createdAt.gte)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .slice(0, take),
        ),
        findFirst: jest.fn(
          async ({ where }: any) =>
            rows
              .filter((r) => r.phone === where.phone && r.consumedAt === null)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
        ),
        updateMany: jest.fn(async ({ where, data }: any) => {
          rows
            .filter((r) => r.phone === where.phone && r.consumedAt === null)
            .forEach((r) => (r.consumedAt = data.consumedAt));
          return { count: 0 };
        }),
        create: jest.fn(async ({ data }: any) => {
          rows.push({ phone: data.phone, createdAt: new Date(), consumedAt: null });
          return data;
        }),
      },
    };
    const values: Record<string, unknown> = {
      OTP_RESEND_SECONDS: 60,
      OTP_TTL_SECONDS: 300,
      OTP_DAILY_LIMIT_PER_PHONE: 5,
      OTP_PEPPER: 'pepper-123',
      OTP_DEV_MODE: false,
      NODE_ENV: 'test',
    };
    const config = {
      get: (k: string) => values[k],
      getOrThrow: (k: string) => {
        if (values[k] === undefined) throw new Error(`missing config ${k}`);
        return values[k];
      },
    };
    const sms = { send: jest.fn(async () => undefined) };
    const service = new AuthService(prisma as any, {} as any, config as any, sms as any);
    return { service, sms };
  }

  const MINUTE = 60_000;
  const DAY = 24 * 60 * MINUTE;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-11-15T08:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Request an OTP, then move the clock past the 60s resend cooldown. */
  async function requestAndWait(service: AuthService, phone: string) {
    const result = await service.requestOtp({ phone }, '10.0.0.1');
    jest.setSystemTime(Date.now() + 2 * MINUTE);
    return result;
  }

  it('(b) 6th OTP request for the same phone within 24h returns 429 with an Arabic message', async () => {
    const { service, sms } = makeService();
    for (let i = 0; i < 5; i++) {
      await requestAndWait(service, '0501234567');
    }

    const err = await service.requestOtp({ phone: '0501234567' }, '10.0.0.9').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toMatchObject({
      code: 'OTP_DAILY_LIMIT',
      message: 'تم تجاوز الحد اليومي لطلبات رمز التحقق لهذا الرقم، حاولي مرة أخرى لاحقًا',
    });
    expect(err.getResponse().retryAfter).toBeGreaterThan(0);
    expect(sms.send).toHaveBeenCalledTimes(5);
  });

  it('(c) the daily limit is per phone: another phone is unaffected', async () => {
    const { service, sms } = makeService();
    for (let i = 0; i < 5; i++) {
      await requestAndWait(service, '0501234567');
    }
    await expect(service.requestOtp({ phone: '0507654321' }, '10.0.0.2')).resolves.toBeDefined();
    expect(sms.send).toHaveBeenCalledTimes(6);
  });

  it('(d) the limit resets once the 24h window has passed', async () => {
    const { service, sms } = makeService();
    for (let i = 0; i < 5; i++) {
      await requestAndWait(service, '0501234567');
    }
    await expect(service.requestOtp({ phone: '0501234567' })).rejects.toMatchObject({
      status: 429,
    });

    // Move past 24h from the first request: the oldest code leaves the window.
    jest.setSystemTime(new Date('2026-11-15T08:00:00Z').getTime() + DAY + MINUTE);
    await expect(service.requestOtp({ phone: '0501234567' })).resolves.toBeDefined();
    expect(sms.send).toHaveBeenCalledTimes(6);
  });
});
