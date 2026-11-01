import "server-only";
import { z } from "zod";

/** Server-only configuration. Never import this from a client component. */
const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  GOOGLE_AUTH_ENABLED: z.enum(["true", "false"]).optional(),
});

export const serverEnv = schema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  CRON_SECRET: process.env.CRON_SECRET || undefined,
  RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  GOOGLE_AUTH_ENABLED: (process.env.GOOGLE_AUTH_ENABLED as "true" | "false" | undefined) || undefined,
});

export const integrations = {
  email: Boolean(serverEnv.RESEND_API_KEY && serverEnv.EMAIL_FROM),
  google: serverEnv.GOOGLE_AUTH_ENABLED === "true",
  serviceRole: Boolean(serverEnv.SUPABASE_SERVICE_ROLE_KEY),
};
