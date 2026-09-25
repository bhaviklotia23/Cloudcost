import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { ENV, Env } from '../config/env';

export type MailMessage = { to: string | string[]; subject: string; html: string; text: string };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter;
  /** In tests we keep sent mail in memory instead of talking SMTP. */
  readonly outbox: MailMessage[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport =
      env.NODE_ENV === 'test' ? createTransport({ jsonTransport: true }) : createTransport(env.SMTP_URL);
  }

  async send(msg: MailMessage): Promise<void> {
    if (this.env.NODE_ENV === 'test') this.outbox.push(msg);
    await this.transport.sendMail({ from: this.env.MAIL_FROM, ...msg });
    this.logger.log(`Sent "${msg.subject}" to ${Array.isArray(msg.to) ? msg.to.length + ' recipients' : msg.to}`);
  }
}
