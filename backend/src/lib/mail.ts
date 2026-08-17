import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

export interface MailProvider {
  send(message: MailMessage): Promise<{ providerId: string }>;
}

class SmtpMailProvider implements MailProvider {
  private readonly transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
  });

  async send(message: MailMessage): Promise<{ providerId: string }> {
    const result = await this.transport.sendMail({ from: env.SMTP_FROM, ...message });
    return { providerId: result.messageId };
  }
}

class UnconfiguredMailProvider implements MailProvider {
  async send(): Promise<{ providerId: string }> {
    throw new Error("Email provider is not configured");
  }
}

export const mailProvider: MailProvider = env.SMTP_HOST ? new SmtpMailProvider() : new UnconfiguredMailProvider();

