import "server-only";
import { z } from "zod";

/** Server-only configuration. Never import this from a client component. */
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
  PAYSTACK_SECRET_KEY: z.string().startsWith("sk_").optional(),
  PAYSTACK_PLAN_STARTER: z.string().optional(),
  PAYSTACK_PLAN_GROWTH: z.string().optional(),
  PAYSTACK_PLAN_PROFESSIONAL: z.string().optional(),
  AI_BASE_URL: z.url().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  WHATSAPP_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
});

export const serverEnv = schema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  GOOGLE_AUTH_ENABLED: (process.env.GOOGLE_AUTH_ENABLED as "true" | "false" | undefined) || undefined,
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || undefined,
  PAYSTACK_PLAN_STARTER: process.env.PAYSTACK_PLAN_STARTER || undefined,
  PAYSTACK_PLAN_GROWTH: process.env.PAYSTACK_PLAN_GROWTH || undefined,
  PAYSTACK_PLAN_PROFESSIONAL: process.env.PAYSTACK_PLAN_PROFESSIONAL || undefined,
  AI_BASE_URL: process.env.AI_BASE_URL || undefined,
  AI_API_KEY: process.env.AI_API_KEY || undefined,
  AI_MODEL: process.env.AI_MODEL || undefined,
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || undefined,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || undefined,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || undefined,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET || undefined,
});

export const integrations = {
  email: Boolean(serverEnv.RESEND_API_KEY && serverEnv.EMAIL_FROM),
  google: serverEnv.GOOGLE_AUTH_ENABLED === "true",
  serviceRole: Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY),
  paystack: Boolean(serverEnv.PAYSTACK_SECRET_KEY && serverEnv.SUPABASE_SERVICE_ROLE_KEY),
  ai: Boolean(serverEnv.AI_BASE_URL && serverEnv.AI_API_KEY && serverEnv.AI_MODEL),
  whatsapp: Boolean(serverEnv.WHATSAPP_TOKEN && serverEnv.WHATSAPP_PHONE_NUMBER_ID),
};
