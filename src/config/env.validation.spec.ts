/**
 * Regression tests for P0-4 (unsafe production defaults).
 */
import { validateEnv } from './env.validation';
import {
  ConsoleSmsProvider,
  TaqnyatSmsProvider,
  TelegramOtpProvider,
  createSmsProvider,
} from '../modules/auth/sms/sms.provider';

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

  it('accepts the temporary Telegram OTP provider in production when configured', () => {
    const env = {
      ...base,
      NODE_ENV: 'production',
      SMS_PROVIDER: 'telegram',
      TELEGRAM_BOT_TOKEN: 'bot-token',
      TELEGRAM_OTP_CHAT_ID: '-100123',
    };
    expect(() => validateEnv(env)).not.toThrow();
    // TELEGRAM_CHAT_ID is accepted as a fallback for the OTP chat.
    const { TELEGRAM_OTP_CHAT_ID, ...withFallback } = env;
    expect(() => validateEnv({ ...withFallback, TELEGRAM_CHAT_ID: '-100999' })).not.toThrow();
  });

  it('rejects SMS_PROVIDER=telegram in production without bot token or chat', () => {
    const env = { ...base, NODE_ENV: 'production', SMS_PROVIDER: 'telegram' };
    expect(() => validateEnv(env)).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => validateEnv({ ...env, TELEGRAM_BOT_TOKEN: 't' })).toThrow(/TELEGRAM_BOT_TOKEN/);
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

  it('builds the Telegram OTP provider, falling back to TELEGRAM_CHAT_ID', () => {
    const provider = createSmsProvider(
      cfg({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'telegram',
        TELEGRAM_BOT_TOKEN: 't',
        TELEGRAM_CHAT_ID: '-100',
      }),
    );
    expect(provider).toBeInstanceOf(TelegramOtpProvider);
    expect(() =>
      createSmsProvider(cfg({ NODE_ENV: 'production', SMS_PROVIDER: 'telegram', TELEGRAM_BOT_TOKEN: 't' })),
    ).toThrow(/credentials are missing/);
  });
});

describe('TelegramOtpProvider', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('sends the code to the OTP chat with a WhatsApp link for the customer', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    global.fetch = fetchMock as any;

    await new TelegramOtpProvider('bot-token', '-100123').send('0501234567', 'رمز التحقق: 4821');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('-100123');
    expect(body.text).toContain('+966501234567');
    expect(body.text).toContain('4821');
    expect(body.text).toContain('https://wa.me/966501234567?text=');
  });

  it('throws when Telegram rejects the message, so the customer is not left waiting', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }) as any;
    await expect(new TelegramOtpProvider('t', '-1').send('0501234567', 'x')).rejects.toThrow(
      'SMS_SEND_FAILED',
    );
  });

  it('throws on network errors', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(new TelegramOtpProvider('t', '-1').send('0501234567', 'x')).rejects.toThrow(
      'SMS_SEND_FAILED',
    );
  });
});
