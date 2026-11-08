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

export function createSmsProvider(config: ConfigService): SmsProvider {
  const provider = config.get<string>('SMS_PROVIDER') ?? 'console';
  const sender = config.get<string>('SMS_SENDER_NAME') ?? 'Relax-Spa';

  switch (provider) {
    case 'taqnyat': {
      const token = config.get<string>('TAQNYAT_BEARER_TOKEN') ?? '';
      return token ? new TaqnyatSmsProvider(token, sender) : new ConsoleSmsProvider();
    }
    case 'msegat': {
      const username = config.get<string>('MSEGAT_USERNAME') ?? '';
      const apiKey = config.get<string>('MSEGAT_API_KEY') ?? '';
      return username && apiKey
        ? new MsegatSmsProvider(username, apiKey, sender)
        : new ConsoleSmsProvider();
    }
    default:
      return new ConsoleSmsProvider();
  }
}
