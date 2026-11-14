import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // P0-4: يرجّع devCode في الـ response. مقفول افتراضياً، وممنوع في الإنتاج.
  OTP_DEV_MODE: booleanish.default(false),
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OTP_PEPPER: z.string().min(8, 'OTP_PEPPER must be at least 8 chars'),

  SMS_PROVIDER: z.enum(['console', 'taqnyat', 'msegat']).default('console'),
  SMS_SENDER_NAME: z.string().default('Relax-Spa'),
  TAQNYAT_BEARER_TOKEN: z.string().optional().default(''),
  MSEGAT_USERNAME: z.string().optional().default(''),
  MSEGAT_API_KEY: z.string().optional().default(''),

  // PayPal
  PAYPAL_CLIENT_ID: z.string().optional().default(''),
  PAYPAL_SECRET: z.string().optional().default(''),
  PAYPAL_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYPAL_BASE_URL: z.string().url().default('https://api-m.sandbox.paypal.com'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // P0-4: مقفول افتراضياً؛ لازم يتفعّل صراحةً.
  SWAGGER_ENABLED: booleanish.default(false),

  SEED_ADMIN_EMAIL: z.string().email().optional().default('admin@relax.sa'),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

/** كلمة سر الـ seed القديمة اللي كانت افتراضية — ممنوعة في الإنتاج. */
export const INSECURE_SEED_ADMIN_PASSWORD = 'ChangeMe123!';

/**
 * P0-4: في الإنتاج نرفض أي إعداد بيكشف الـ OTP أو بيبعته للـ console بدل SMS حقيقي،
 * عشان deploy ناقص الإعدادات يفشل وهو بيقوم بدل ما يشتغل بشكل غير آمن.
 */
const productionSafeEnvSchema = envSchema.superRefine((env, ctx) => {
  if (env.NODE_ENV !== 'production') return;

  const fail = (path: keyof typeof env, message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

  if (env.OTP_DEV_MODE) {
    fail('OTP_DEV_MODE', 'OTP_DEV_MODE must be false in production (it returns the OTP in the response)');
  }

  if (env.SMS_PROVIDER === 'console') {
    fail('SMS_PROVIDER', 'SMS_PROVIDER=console is not allowed in production; use taqnyat or msegat');
  }
  if (env.SMS_PROVIDER === 'taqnyat' && !env.TAQNYAT_BEARER_TOKEN) {
    fail('TAQNYAT_BEARER_TOKEN', 'TAQNYAT_BEARER_TOKEN is required when SMS_PROVIDER=taqnyat');
  }
  if (env.SMS_PROVIDER === 'msegat' && (!env.MSEGAT_USERNAME || !env.MSEGAT_API_KEY)) {
    fail('MSEGAT_API_KEY', 'MSEGAT_USERNAME and MSEGAT_API_KEY are required when SMS_PROVIDER=msegat');
  }

  if (env.SEED_ADMIN_PASSWORD === INSECURE_SEED_ADMIN_PASSWORD) {
    fail('SEED_ADMIN_PASSWORD', 'SEED_ADMIN_PASSWORD must not be the default value in production');
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = productionSafeEnvSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(details, null, 2)}`);
  }

  return parsed.data;
}
