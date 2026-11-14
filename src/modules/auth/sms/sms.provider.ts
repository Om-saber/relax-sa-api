import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { toE164 } from '../phone.util';

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  send(phone: string, message: string): Promise<void>;
}

/** Development default: logs the message instead of sending an SMS. */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`[SMS -> ${phone}] ${message}`);
  }
}

/**
 * Taqnyat adapter (https://taqnyat.sa).
 * Verify the endpoint/payload against the account's API docs before enabling.
 */
export class TaqnyatSmsProvider implements SmsProvider {
  private readonly logger = new Logger(TaqnyatSmsProvider.name);

  constructor(
    private readonly bearerToken: string,
    private readonly sender: string,
  ) {}

  async send(phone: string, message: string): Promise<void> {
    const response = await fetch('https://api.taqnyat.sa/v1/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [toE164(phone)],
        body: message,
        sender: this.sender,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Taqnyat send failed (${response.status}): ${body}`);
      throw new Error('SMS_SEND_FAILED');
    }
  }
}

/**
 * Msegat adapter (https://msegat.com).
 * Verify the endpoint/payload against the account's API docs before enabling.
 */
export class MsegatSmsProvider implements SmsProvider {
  private readonly logger = new Logger(MsegatSmsProvider.name);

  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly sender: string,
  ) {}

  async send(phone: string, message: string): Promise<void> {
    const response = await fetch('https://www.msegat.com/gw/sendsms.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: this.username,
        apiKey: this.apiKey,
        numbers: toE164(phone).replace('+', ''),
        userSender: this.sender,
        msg: message,
        msgEncoding: 'UTF8',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Msegat send failed (${response.status}): ${body}`);
      throw new Error('SMS_SEND_FAILED');
    }
  }
}

/**
 * حل مؤقت لحد ما يبقى فيه مزود SMS: الكود بيتبعت لجروب تليجرام خاص بالفريق،
 * ومعاه لينك واتساب جاهز بالرسالة، وواحدة من الفريق تبعته للعميلة.
 *
 * عكس TelegramService، هنا الفشل بيرمي خطأ عشان العميلة ماتستناش كود مش جاي.
 * الجروب ده لازم يبقى خاص؛ أي حد فيه يقدر يدخل على حساب أي عميلة طالبة كود.
 */
export class TelegramOtpProvider implements SmsProvider {
  private readonly logger = new Logger(TelegramOtpProvider.name);

  constructor(
    private readonly botToken: string,
    private readonly chatId: string,
  ) {}

  async send(phone: string, message: string): Promise<void> {
    const e164 = toE164(phone);
    const whatsappLink = `https://wa.me/${e164.replace('+', '')}?text=${encodeURIComponent(message)}`;
    const text = [
      '🔐 طلب كود دخول',
      `الرقم: ${e164}`,
      '',
      message,
      '',
      'ابعتيه للعميلة واتساب من هنا:',
      whatsappLink,
    ].join('\n');

    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      this.logger.error(`Telegram OTP send failed: ${(err as Error)?.message ?? err}`);
      throw new Error('SMS_SEND_FAILED');
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Telegram OTP send failed (${response.status}): ${body}`);
      throw new Error('SMS_SEND_FAILED');
    }
  }
}

const factoryLogger = new Logger('SmsProviderFactory');

/**
 * P0-4: لو المزود المختار ناقصه مفاتيح، مانرجعش Console بصمت.
 * في الإنتاج نرمي خطأ؛ في التطوير نرجع Console مع تحذير واضح.
 */
function missingCredentials(config: ConfigService, provider: string): SmsProvider {
  const message = `SMS_PROVIDER=${provider} but its credentials are missing`;
  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error(message);
  }
  factoryLogger.warn(`${message}; falling back to console SMS (development only)`);
  return new ConsoleSmsProvider();
}

export function createSmsProvider(config: ConfigService): SmsProvider {
  const provider = config.get<string>('SMS_PROVIDER') ?? 'console';
  const sender = config.get<string>('SMS_SENDER_NAME') ?? 'Relax-Spa';

  if (provider === 'console' && config.get<string>('NODE_ENV') === 'production') {
    throw new Error('SMS_PROVIDER=console is not allowed in production');
  }

  switch (provider) {
    case 'taqnyat': {
      const token = config.get<string>('TAQNYAT_BEARER_TOKEN') ?? '';
      return token ? new TaqnyatSmsProvider(token, sender) : missingCredentials(config, provider);
    }
    case 'msegat': {
      const username = config.get<string>('MSEGAT_USERNAME') ?? '';
      const apiKey = config.get<string>('MSEGAT_API_KEY') ?? '';
      return username && apiKey
        ? new MsegatSmsProvider(username, apiKey, sender)
        : missingCredentials(config, provider);
    }
    case 'telegram': {
      const token = config.get<string>('TELEGRAM_BOT_TOKEN') ?? '';
      const chatId =
        config.get<string>('TELEGRAM_OTP_CHAT_ID') || config.get<string>('TELEGRAM_CHAT_ID') || '';
      return token && chatId
        ? new TelegramOtpProvider(token, chatId)
        : missingCredentials(config, provider);
    }
    default:
      return new ConsoleSmsProvider();
  }
}
