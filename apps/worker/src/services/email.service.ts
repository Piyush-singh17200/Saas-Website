import { logger } from "../lib/logger.js";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId: string;
  deliveredAt: string;
}

export interface EmailProvider {
  sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult>;
}

/**
 * Development-safe email provider.
 * Does NOT require external SMTP credentials or paid SaaS providers.
 * Formats, logs, and retains sent messages in a bounded in-memory buffer for verification.
 */
export class DevelopmentEmailProvider implements EmailProvider {
  private sentMessages: Array<SendEmailOptions & { messageId: string; timestamp: string }> = [];
  private maxBufferSize = 200;

  public async sendEmail(options: SendEmailOptions): Promise<EmailDeliveryResult> {
    const messageId = `dev-mail-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();

    const record = {
      ...options,
      messageId,
      timestamp,
    };

    if (this.sentMessages.length >= this.maxBufferSize) {
      this.sentMessages.shift();
    }
    this.sentMessages.push(record);

    logger.info("Development email simulated delivery", {
      messageId,
      to: options.to,
      subject: options.subject,
    });

    return {
      success: true,
      messageId,
      deliveredAt: timestamp,
    };
  }

  public getSentMessages(): ReadonlyArray<SendEmailOptions & { messageId: string; timestamp: string }> {
    return this.sentMessages;
  }

  public clearSentMessages(): void {
    this.sentMessages = [];
  }
}

export const emailProvider = new DevelopmentEmailProvider();
