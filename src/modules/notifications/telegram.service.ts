import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token: string;
  private readonly chatId: string;

  constructor(private configService: ConfigService) {
    this.token = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.chatId = this.configService.get<string>('TELEGRAM_CHAT_ID') || '';
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.token || !this.chatId) {
      this.logger.warn('Telegram token or chatId is missing in .env');
      return;
    }
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML' }),
      });
      if (!res.ok) {
        const err = await res.text();
        this.logger.error('Telegram API error:', err);
      }
    } catch (err) {
      this.logger.error('Telegram send failed', err);
    }
  }
}
