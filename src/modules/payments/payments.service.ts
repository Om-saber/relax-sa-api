import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Booking, BookingStatus, Payment, PaymentProvider, PaymentStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { findOwnedBookingOrThrow } from '../bookings/booking-ownership';

/**
 * الشكل اللي بيرجع للعميل. مفيش rawPayload (فيه اسم وإيميل الدافع من PayPal)
 * ولا idempotencyKey.
 */
export function toPublicPayment(p: Payment) {
  return {
    id: p.id,
    bookingId: p.bookingId,
    amount: p.amount,
    refundedAmount: p.refundedAmount,
    currency: p.currency,
    method: p.method,
    provider: p.provider,
    status: p.status,
    providerRef: p.providerRef,
    paidAt: p.paidAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** أقل بيانات حجز تحتاجها صفحة نجاح الدفع. */
export function toPublicBooking(b: Booking | null | undefined) {
  if (!b) return null;
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    status: b.status,
    paymentStatus: b.paymentStatus,
  };
}

type PayPalOrder = {
  id: string;
  status?: string;
  links?: Array<{ rel: string; href: string; method?: string }>;
  purchase_units?: unknown[];
  [key: string]: unknown;
};

type PayPalErrorInfo = {
  statusCode?: number;
  issue?: string;
  description?: string;
  debugId?: string;
  message?: string;
};

/**
 * ترجمة أشهر أخطاء PayPal إلى رسائل عربية واضحة للعميلة.
 * المرجع: https://developer.paypal.com/api/rest/reference/orders/v2/errors/
 */
const PAYPAL_ISSUE_AR: Record<string, string> = {
  ORDER_NOT_APPROVED:
    'لم يتم تأكيد الدفع على PayPal بعد. افتحي رابط الموافقة، أكملي العملية، ثم عودي لهذه الصفحة.',
  ORDER_ALREADY_CAPTURED: 'تم تحصيل هذا الطلب بالفعل.',
  ORDER_ALREADY_COMPLETED: 'تم إتمام هذا الطلب بالفعل.',
  ORDER_EXPIRED: 'انتهت صلاحية طلب الدفع. ابدئي عملية دفع جديدة.',
  PAYER_ACTION_REQUIRED: 'هناك خطوة إضافية مطلوبة منكِ على PayPal لإتمام الدفع.',
  INSTRUMENT_DECLINED: 'تم رفض وسيلة الدفع. جرّبي وسيلة دفع أخرى.',
  TRANSACTION_REFUSED: 'تم رفض العملية من PayPal. جرّبي وسيلة دفع أخرى.',
  UNSUPPORTED_CURRENCY: 'العملة غير مدعومة من PayPal.',
  CURRENCY_NOT_SUPPORTED: 'العملة غير مدعومة من PayPal.',
  INVALID_REQUEST: 'طلب الدفع غير صالح. تحققي من البيانات وحاولي مرة أخرى.',
  AUTHENTICATION_FAILURE: 'فشل الاتصال بحساب PayPal. تواصلي مع الدعم.',
  DUPLICATE_REQUEST_ID: 'تمت معالجة هذا الطلب مسبقًا.',
  RESOURCE_NOT_FOUND: 'لم يتم العثور على طلب الدفع على PayPal.',
  COMPLIANCE_VIOLATION:
    'رفض PayPal هذه العملية لأسباب تتعلق بالامتثال. جرّبي وسيلة دفع أخرى أو تواصلي مع الدعم.',
  PAYER_ACCOUNT_LOCKED_OR_CLOSED: 'حساب PayPal الخاص بكِ موقوف أو مغلق. تواصلي مع الدعم.',
  PAYEE_ACCOUNT_RESTRICTED: 'حساب التاجر غير قادر على استقبال هذا الدفع حاليًا.',
  PAYMENT_DENIED: 'رفض PayPal العملية. جرّبي وسيلة دفع أخرى.',
};

/** أخطاء نهائية: إعادة المحاولة بنفس الطلب لن تنجح، لذا نعلّم الدفعة FAILED. */
const TERMINAL_PAYPAL_ISSUES = new Set([
  'COMPLIANCE_VIOLATION',
  'PAYMENT_DENIED',
  'PAYER_ACCOUNT_LOCKED_OR_CLOSED',
  'PAYEE_ACCOUNT_RESTRICTED',
  'INSTRUMENT_DECLINED',
  'TRANSACTION_REFUSED',
  'ORDER_EXPIRED',
  'UNSUPPORTED_CURRENCY',
  'CURRENCY_NOT_SUPPORTED',
]);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  // ─────────────────────────────────────────────────────
  // PayPal OAuth — get access token (cached)
  // ─────────────────────────────────────────────────────
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token;
    }

    const clientId = this.config.get<string>('PAYPAL_CLIENT_ID');
    const secret = this.config.get<string>('PAYPAL_SECRET');
    const baseUrl = this.config.get<string>('PAYPAL_BASE_URL');

    if (!clientId || !secret) {
      throw new BadRequestException({
        code: 'PAYPAL_NOT_CONFIGURED',
        message: 'PayPal credentials missing',
      });
    }

    const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');

    const { data } = await firstValueFrom(
      this.http.post(
        `${baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      ),
    );

    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
  }

  // ─────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────
  private paypalError(err: any): PayPalErrorInfo {
    const data = err?.response?.data;
    const detail = Array.isArray(data?.details) ? data.details[0] : undefined;

    return {
      statusCode: err?.response?.status,
      issue: detail?.issue,
      description: detail?.description,
      debugId: data?.debug_id,
      message: data?.message || err?.message,
    };
  }

  private arabicMessage(issue: string | undefined, fallback: string): string {
    if (issue && PAYPAL_ISSUE_AR[issue]) return PAYPAL_ISSUE_AR[issue];
    return fallback;
  }

  private approvalUrlFor(order: PayPalOrder, orderId: string): string | undefined {
    const fromLinks = (order.links || []).find((l) => l.rel === 'approve')?.href;
    if (fromLinks) return fromLinks;

    const mode = this.config.get<string>('PAYPAL_MODE') || 'sandbox';
    const host = mode === 'live' ? 'https://www.paypal.com' : 'https://www.sandbox.paypal.com';
    return orderId ? `${host}/checkoutnow?token=${orderId}` : undefined;
  }

  /** قراءة حالة Order من PayPal دون رمي خطأ (تُستخدم للتحقق قبل/بعد الـ capture). */
  private async fetchOrder(orderId: string): Promise<PayPalOrder | null> {
    try {
      const token = await this.getAccessToken();
      const baseUrl = this.config.get<string>('PAYPAL_BASE_URL');

      const { data } = await firstValueFrom(
        this.http.get<PayPalOrder>(`${baseUrl}/v2/checkout/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );

      return data;
    } catch (err: any) {
      const info = this.paypalError(err);
      this.logger.warn(
        `PayPal get order ${orderId} failed [${info.issue ?? 'UNKNOWN'}] debug_id=${
          info.debugId ?? '-'
        }: ${info.message ?? ''}`,
      );
      return null;
    }
  }

  /** تحديث الدفعة والحجز إلى PAID (idempotent) */
  private async markPaymentPaid(
    paymentId: string,
    bookingId: string | null,
    payload: unknown,
  ) {
    const now = new Date();

    const payment = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        paidAt: now,
        rawPayload: payload as any,
      },
    });

    const booking = bookingId
      ? await this.prisma.booking.update({
          where: { id: bookingId },
          data: { paymentStatus: PaymentStatus.PAID, paymentMethod: 'CARD' },
        })
      : null;

    return { payment, booking };
  }

  // ─────────────────────────────────────────────────────
  // Create PayPal Order for a booking
  // ─────────────────────────────────────────────────────
  async createOrderForBooking(bookingId: string, userId: string) {
    // P0-3: لازم الحجز يكون بتاع المستخدمة (أو ADMIN).
    const booking = await findOwnedBookingOrThrow(this.prisma, bookingId, userId);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException({ code: 'BOOKING_CANCELLED', message: 'الحجز ملغي' });
    }

    if (booking.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException({ code: 'ALREADY_PAID', message: 'الحجز مدفوع بالفعل' });
    }

    const amountSar = Number(booking.totalPrice).toFixed(2);

    // PayPal doesn't support SAR. Convert to USD for the PayPal order only.
    // DB still keeps the original SAR amount (Payment.amount = booking.totalPrice).
    const SAR_TO_USD = 3.75;
    const amountUsd = (Number(booking.totalPrice) / SAR_TO_USD).toFixed(2);

    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        bookingId: booking.id,
        provider: PaymentProvider.PAYPAL,
        status: PaymentStatus.UNPAID,
      },
      orderBy: { createdAt: 'desc' },
    });

    // أعِد استخدام طلب PayPal القائم بدل إنشاء طلب جديد في كل ضغطة زر.
    if (existingPayment?.providerRef) {
      const existingOrder = await this.fetchOrder(existingPayment.providerRef);

      if (existingOrder?.status === 'COMPLETED') {
        const { payment } = await this.markPaymentPaid(
          existingPayment.id,
          existingPayment.bookingId,
          existingOrder,
        );

        return {
          paymentId: payment.id,
          paypalOrderId: existingPayment.providerRef,
          approvalUrl: null,
          amountSar,
          amountUsd,
          currency: 'USD',
          alreadyPaid: true,
          note: 'تم الدفع مسبقًا بنجاح.',
        };
      }

      if (existingOrder?.status === 'APPROVED') {
        const result = await this.captureOrderForBooking(existingPayment.providerRef);

        return {
          paymentId: result.payment.id,
          paypalOrderId: existingPayment.providerRef,
          approvalUrl: null,
          amountSar,
          amountUsd,
          currency: 'USD',
          alreadyPaid: true,
          captured: true,
          note: 'تم تأكيد الدفع بنجاح.',
        };
      }

      if (existingOrder?.status === 'CREATED') {
        // PayPal orders expire (~3h). لا تعيدي استخدام طلب قديم جدًا.
        const createdAt =
          typeof existingOrder.create_time === 'string'
            ? Date.parse(existingOrder.create_time)
            : NaN;
        const isFresh =
          !Number.isFinite(createdAt) ||
          Date.now() - createdAt < 2.5 * 60 * 60 * 1000;

        if (isFresh) {
          return {
            paymentId: existingPayment.id,
            paypalOrderId: existingPayment.providerRef,
            approvalUrl: this.approvalUrlFor(existingOrder, existingPayment.providerRef),
            amountSar,
            amountUsd,
            currency: 'USD',
            reused: true,
            note: 'تمت إعادة استخدام طلب دفع قائم لم يكتمل بعد.',
          };
        }
      }
    }

    const token = await this.getAccessToken();
    const baseUrl = this.config.get<string>('PAYPAL_BASE_URL');
    const frontendUrl = this.config.get<string>('FRONTEND_URL');

    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: booking.id,
          description: `Let's Relax - ${booking.bookingNumber}`,
          amount: { currency_code: 'USD', value: amountUsd },
        },
      ],
      application_context: {
        brand_name: "Let's Relax",
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${frontendUrl}/payment/success?bookingId=${booking.id}`,
        cancel_url: `${frontendUrl}/payment/failure?bookingId=${booking.id}`,
      },
    };

    let data: PayPalOrder;

    try {
      const res = await firstValueFrom(
        this.http.post<PayPalOrder>(`${baseUrl}/v2/checkout/orders`, body, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }),
      );
      data = res.data;
    } catch (err: any) {
      const info = this.paypalError(err);
      this.logger.error(
        `PayPal create order failed [${info.issue ?? 'UNKNOWN'}] debug_id=${
          info.debugId ?? '-'
        }: ${info.message ?? ''}`,
      );

      throw new BadRequestException({
        code: 'PAYPAL_CREATE_ORDER_FAILED',
        message: this.arabicMessage(
          info.issue,
          'تعذّر إنشاء طلب الدفع عبر PayPal. حاولي مرة أخرى.',
        ),
        details: {
          issue: info.issue,
          debugId: info.debugId,
          paypalMessage: info.message,
        },
      });
    }

    const approvalLink = this.approvalUrlFor(data, data.id);

    const payment = existingPayment
      ? await this.prisma.payment.update({
          where: { id: existingPayment.id },
          data: { providerRef: data.id, amount: booking.totalPrice, rawPayload: data as any },
        })
      : await this.prisma.payment.create({
          data: {
            bookingId: booking.id,
            amount: booking.totalPrice,
            currency: 'SAR',
            method: 'CARD',
            provider: PaymentProvider.PAYPAL,
            status: PaymentStatus.UNPAID,
            providerRef: data.id,
            rawPayload: data as any,
          },
        });

    return {
      paymentId: payment.id,
      paypalOrderId: data.id,
      approvalUrl: approvalLink,
      amountSar,
      amountUsd,
      currency: 'USD',
      note: 'Payment processed in USD (PayPal). DB keeps SAR amount.',
    };
  }

  // ─────────────────────────────────────────────────────
  // Capture PayPal Order + update Payment + Booking
  // ─────────────────────────────────────────────────────
  async captureOrderForBooking(paypalOrderId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: paypalOrderId, provider: PaymentProvider.PAYPAL },
      include: { booking: true },
    });

    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'الدفعة غير موجودة' });
    }

    // Idempotent: already recorded locally.
    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,
        alreadyPaid: true,
        payment: toPublicPayment(payment),
        booking: toPublicBooking(payment.booking),
      };
    }

    const token = await this.getAccessToken();
    const baseUrl = this.config.get<string>('PAYPAL_BASE_URL');

    let captureData: any;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
          {},
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        ),
      );
      captureData = data;
    } catch (err: any) {
      const info = this.paypalError(err);
      this.logger.error(
        `PayPal capture failed [${info.issue ?? 'UNKNOWN'}] debug_id=${
          info.debugId ?? '-'
        } order=${paypalOrderId}: ${info.message ?? ''}`,
      );

      // سبق تحصيل الطلب على PayPal (مثلاً انقطعت الشبكة بعد النجاح) → تحقق وسجّله PAID.
      if (info.issue === 'ORDER_ALREADY_CAPTURED' || info.issue === 'ORDER_ALREADY_COMPLETED') {
        const order = await this.fetchOrder(paypalOrderId);

        if (order?.status === 'COMPLETED') {
          const { payment: updatedPayment, booking } = await this.markPaymentPaid(
            payment.id,
            payment.bookingId,
            order,
          );

          return {
            success: true,
            alreadyPaid: true,
            payment: toPublicPayment(updatedPayment),
            booking: toPublicBooking(booking),
          };
        }
      }

      // خطأ نهائي (مثل COMPLIANCE_VIOLATION): لا جدوى من إعادة المحاولة بنفس الطلب.
      if (info.issue && TERMINAL_PAYPAL_ISSUES.has(info.issue)) {
        await this.prisma.payment
          .update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.FAILED,
              rawPayload: (err?.response?.data ?? {}) as any,
            },
          })
          .catch(() => undefined);
      }

      throw new BadRequestException({
        code: 'PAYPAL_CAPTURE_FAILED',
        message: this.arabicMessage(
          info.issue,
          'فشل تأكيد الدفع عبر PayPal. حاولي مرة أخرى.',
        ),
        details: {
          issue: info.issue,
          debugId: info.debugId,
          paypalMessage: info.message,
        },
      });
    }

    if (captureData.status !== 'COMPLETED') {
      throw new BadRequestException({
        code: 'PAYPAL_NOT_COMPLETED',
        message: `لم يكتمل الدفع (الحالة: ${captureData.status}). حاولي مرة أخرى.`,
      });
    }

    const { payment: updatedPayment, booking } = await this.markPaymentPaid(
      payment.id,
      payment.bookingId,
      captureData,
    );

    return {
      success: true,
      payment: toPublicPayment(updatedPayment),
      booking: toPublicBooking(booking),
    };
  }

  // ─────────────────────────────────────────────────────
  // Check payment status for a booking
  // ─────────────────────────────────────────────────────
  async getPaymentStatusForBooking(bookingId: string, userId: string) {
    // P0-3: لازم الحجز يكون بتاع المستخدمة (أو ADMIN).
    await findOwnedBookingOrThrow(this.prisma, bookingId, userId);

    const payments = await this.prisma.payment.findMany({
      where: { bookingId, provider: PaymentProvider.PAYPAL },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      bookingId,
      hasPaid: payments.some((p) => p.status === PaymentStatus.PAID),
      latest: payments[0] ? toPublicPayment(payments[0]) : null,
      all: payments.map(toPublicPayment),
    };
  }
}
