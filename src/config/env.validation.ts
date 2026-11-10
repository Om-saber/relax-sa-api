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

  OTP_DEV_MODE: booleanish.default(true),
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

  SWAGGER_ENABLED: booleanish.default(true),

  SEED_ADMIN_EMAIL: z.string().email().optional().default('admin@relax.sa'),
  SEED_ADMIN_PASSWORD: z.string().optional().default('ChangeMe123!'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables: ${JSON.stringify(details, null, 2)}`);
  }

  return parsed.data;
}
