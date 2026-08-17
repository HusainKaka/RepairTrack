import "dotenv/config";
import { z } from "zod";

const isTest = process.env.NODE_ENV === "test";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url().default(isTest ? "postgresql://test:test@localhost:5432/repairtrack_test" : "postgresql://repairtrack:CHANGE_ME@localhost:5432/repairtrack"),
  JWT_SECRET: z.string().min(32).default(isTest ? "test-only-secret-that-is-at-least-thirty-two-characters" : "development-only-change-this-secret-now"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  PUBLIC_WEB_URL: z.string().url().default("http://localhost:5173"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(2).default(0),
  GOOGLE_WEB_CLIENT_ID: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.string().transform((value) => value === "true").default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default("RepairTrack <no-reply@example.com>"),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().optional(),
  MPESA_CONSUMER_SECRET: z.string().optional(),
  MPESA_SHORTCODE: z.string().optional(),
  MPESA_PASSKEY: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_WEBHOOK_SECRET: z.string().optional(),
  KRA_ETIMS_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  KRA_ETIMS_BASE_URL: z.string().url().optional(),
  KRA_ETIMS_CLIENT_ID: z.string().optional(),
  KRA_ETIMS_CLIENT_SECRET: z.string().optional(),
  KRA_ETIMS_SUBMIT_PATH: z.string().default("/invoices"),
  PAYMENT_GATEWAY_PROVIDER: z.string().default("MPESA"),
  PAYMENT_GATEWAY_WEBHOOK_SECRET: z.string().min(32).optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

if (parsed.data.NODE_ENV === "production" && parsed.data.JWT_SECRET.includes("change-this")) {
  throw new Error("JWT_SECRET must be replaced before production startup");
}

export const env = parsed.data;
