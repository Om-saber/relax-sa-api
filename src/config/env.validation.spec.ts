/**
 * Regression tests for P0-4 (unsafe production defaults).
 */
import { validateEnv } from './env.validation';
import { ConsoleSmsProvider, TaqnyatSmsProvider, createSmsProvider } from '../modules/auth/sms/sms.provider';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  OTP_PEPPER: 'pepper-123',
};

const prodSafe = {
  ...base,
  NODE_ENV: 'production',
  SMS_PROVIDER: 'taqnyat',
  TAQNYAT_BEARER_TOKEN: 'tq-token',
};

describe('validateEnv — P0-4 safe defaults', () => {
  it('defaults OTP_DEV_MODE and SWAGGER_ENABLED to false', () => {
    const env = validateEnv(base);
    expect(env.OTP_DEV_MODE).toBe(false);
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.SEED_ADMIN_PASSWORD).toBeUndefined();
  });

  it('still allows dev conveniences outside production', () => {
    const env = validateEnv({ ...base, OTP_DEV_MODE: 'true', SWAGGER_ENABLED: 'true' });
    expect(env.OTP_DEV_MODE).toBe(true);
    expect(env.SMS_PROVIDER).toBe('console');
  });

  it('accepts a properly configured production env', () => {
    expect(() => validateEnv(prodSafe)).not.toThrow();
  });

  it('rejects a production env that relies on the console SMS default', () => {
    const { SMS_PROVIDER, TAQNYAT_BEARER_TOKEN, ...rest } = prodSafe;
    expect(() => validateEnv(rest)).toThrow(/SMS_PROVIDER/);
  });

  it('rejects OTP_DEV_MODE=true in production', () => {
    expect(() => validateEnv({ ...prodSafe, OTP_DEV_MODE: 'true' })).toThrow(/OTP_DEV_MODE/);
  });

  it('rejects a production SMS provider with missing credentials', () => {
    expect(() => validateEnv({ ...prodSafe, TAQNYAT_BEARER_TOKEN: '' })).toThrow(
      /TAQNYAT_BEARER_TOKEN/,
    );
    expect(() =>
      validateEnv({ ...prodSafe, SMS_PROVIDER: 'msegat', MSEGAT_USERNAME: 'u' }),
    ).toThrow(/MSEGAT/);
  });

  it('rejects the default seed admin password in production', () => {
    expect(() => validateEnv({ ...prodSafe, SEED_ADMIN_PASSWORD: 'ChangeMe123!' })).toThrow(
      /SEED_ADMIN_PASSWORD/,
    );
  });
});

describe('createSmsProvider — P0-4 no silent console fallback', () => {
  const cfg = (values: Record<string, string>) => ({ get: (k: string) => values[k] }) as any;

  it('throws in production when the chosen provider has no credentials', () => {
    expect(() => createSmsProvider(cfg({ NODE_ENV: 'production', SMS_PROVIDER: 'taqnyat' }))).toThrow(
      /credentials are missing/,
    );
    expect(() => createSmsProvider(cfg({ NODE_ENV: 'production', SMS_PROVIDER: 'msegat' }))).toThrow(
      /credentials are missing/,
    );
  });

  it('throws in production for the console provider', () => {
    expect(() => createSmsProvider(cfg({ NODE_ENV: 'production', SMS_PROVIDER: 'console' }))).toThrow(
      /console/,
    );
  });

  it('falls back to console only outside production', () => {
    const provider = createSmsProvider(cfg({ NODE_ENV: 'development', SMS_PROVIDER: 'taqnyat' }));
    expect(provider).toBeInstanceOf(ConsoleSmsProvider);
  });

  it('builds the real provider when credentials are present', () => {
    const provider = createSmsProvider(
      cfg({ NODE_ENV: 'production', SMS_PROVIDER: 'taqnyat', TAQNYAT_BEARER_TOKEN: 't' }),
    );
    expect(provider).toBeInstanceOf(TaqnyatSmsProvider);
  });
});
