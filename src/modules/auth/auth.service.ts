import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { UserRole, type Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../common/types/auth-user';
import { normalizeSaudiPhone } from './phone.util';
import { SMS_PROVIDER, type SmsProvider } from './sms/sms.provider';
import type { LoginDto } from './dto/login.dto';
import type { RequestOtpDto } from './dto/request-otp.dto';
import type { VerifyOtpDto } from './dto/verify-otp.dto';

const userInclude = {
  roleRef: {
    include: {
      permissions: {
        include: { permission: true },
      },
    },
  },
  staffProfile: {
    select: { avatarUrl: true },
  },
} satisfies Prisma.UserInclude;

type UserWithRole = Prisma.UserGetPayload<{ include: typeof userInclude }>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  // ---------------------------------------------------------------------------
  // Client login (phone + OTP)
  // ---------------------------------------------------------------------------

  async requestOtp(dto: RequestOtpDto, ip?: string) {
    const phone = this.parsePhone(dto.phone);
    const now = new Date();
    const resendSeconds = this.config.get<number>('OTP_RESEND_SECONDS') ?? 60;

    const lastOtp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOtp && now.getTime() - lastOtp.createdAt.getTime() < resendSeconds * 1000) {
      const retryAfter = Math.ceil(
        (resendSeconds * 1000 - (now.getTime() - lastOtp.createdAt.getTime())) / 1000,
      );
      throw new HttpException(
        {
          code: 'OTP_TOO_FREQUENT',
          message: `تم إرسال رمز حديثًا، حاولي بعد ${retryAfter} ثانية`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate any previous unused codes
    await this.prisma.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: now },
    });

    const ttl = this.config.get<number>('OTP_TTL_SECONDS') ?? 300;
    const code = randomInt(1000, 10000).toString();

    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hashOtp(phone, code),
        expiresAt: new Date(now.getTime() + ttl * 1000),
        ip: ip ?? null,
      },
    });

    await this.sms.send(
      phone,
      `رمز التحقق الخاص بك في Let's Relax: ${code}\nصالح لمدة ${Math.max(1, Math.round(ttl / 60))} دقائق. لا تشاركيه مع أحد.`,
    );

    const devMode = this.config.get<boolean>('OTP_DEV_MODE');

    return {
      phone,
      expiresIn: ttl,
      resendAfter: resendSeconds,
      // DEV ONLY. Never exposed when OTP_DEV_MODE=false.
      ...(devMode ? { devCode: code } : {}),
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.parsePhone(dto.phone);
    const now = new Date();
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS') ?? 3;

    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException({
        code: 'OTP_NOT_FOUND',
        message: 'لم يتم إرسال رمز لهذا الرقم، اطلبي رمزًا جديدًا',
      });
    }

    if (otp.expiresAt < now) {
      throw new BadRequestException({ code: 'OTP_EXPIRED', message: 'انتهت صلاحية الرمز' });
    }

    if (otp.attempts >= maxAttempts) {
      throw new HttpException(
        {
          code: 'OTP_ATTEMPTS_EXCEEDED',
          message: 'تجاوزتِ عدد المحاولات المسموح، اطلبي رمزًا جديدًا',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!this.safeEqual(otp.codeHash, this.hashOtp(phone, dto.code))) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({ code: 'OTP_INVALID', message: 'الرمز غير صحيح' });
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { consumedAt: now },
    });

    let user = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      include: userInclude,
    });

    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({
        data: {
          phone,
          name: dto.name?.trim() || `عميلة ${phone.slice(-4)}`,
          role: UserRole.CUSTOMER,
          phoneVerifiedAt: now,
          lastLoginAt: now,
          clientProfile: { create: {} },
        },
        include: userInclude,
      });
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { phoneVerifiedAt: now, lastLoginAt: now },
        include: userInclude,
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'هذا الحساب موقوف' });
    }

    const tokens = await this.issueTokens(user);

    return { user: this.publicUser(user), isNewUser, ...tokens };
  }

  // ---------------------------------------------------------------------------
  // Staff / admin login (email + password)
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      include: userInclude,
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }

    if (!user.isActive) {
      throw new ForbiddenException({ code: 'ACCOUNT_DISABLED', message: 'هذا الحساب موقوف' });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user);

    return { user: this.publicUser(user), ...tokens };
  }

  // ---------------------------------------------------------------------------
  // Session lifecycle
  // ---------------------------------------------------------------------------

  async refresh(refreshToken: string) {
    const now = new Date();
    const tokenHash = this.sha256(refreshToken);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: userInclude } },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt < now ||
      !record.user.isActive ||
      record.user.deletedAt
    ) {
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_INVALID',
        message: 'انتهت الجلسة، سجلي الدخول مرة أخرى',
      });
    }

    // Rotation: a refresh token can be used exactly once.
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: now },
    });

    return this.issueTokens(record.user);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.sha256(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { loggedOut: true };
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { loggedOut: true, allSessions: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });

    if (!user) throw new UnauthorizedException();

    return this.publicUser(user);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async issueTokens(user: UserWithRole) {
    // FIX: return permissions for ALL roles (ADMIN + STAFF)
    const permissions = user.roleRef
      ? user.roleRef.permissions.map((rp) => rp.permission.key)
      : [];

    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      permissions,
      tokenVersion: user.tokenVersion,
    };

    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl as JwtSignOptions['expiresIn'],
    });

    const refreshDays = this.config.get<number>('JWT_REFRESH_TTL_DAYS') ?? 30;
    const refreshToken = randomBytes(48).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.sha256(refreshToken),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTtl,
    };
  }

  private publicUser(user: UserWithRole) {
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      roleTitle: user.roleRef?.nameAr ?? null,  // ← NEW: e.g. "المشرف الميداني"
      roleKey: user.roleRef?.key ?? null,       // ← NEW: e.g. "supervisor"
      avatarUrl: user.staffProfile?.avatarUrl ?? null,
      permissions: user.roleRef
        ? user.roleRef.permissions.map((rp) => rp.permission.key)
        : [],
      createdAt: user.createdAt,
    };
  }

  private parsePhone(input: string): string {
    try {
      return normalizeSaudiPhone(input);
    } catch {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'رقم الجوال غير صحيح (مثال: 0501234567)',
      });
    }
  }

  private hashOtp(phone: string, code: string): string {
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    return createHash('sha256').update(`${pepper}:${phone}:${code}`).digest('hex');
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }
}
