import dotenv from "dotenv";
import { z } from "zod";

// Load .env if present (fails gracefully if file does not exist)
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z
    .string()
    .default("4000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: "PORT must be a valid port number (1-65535)",
    }),
  DATABASE_URL: z
    .string()
    .url()
    .default(
      "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_dev?schema=public",
    ),
  TEST_DATABASE_URL: z
    .string()
    .url()
    .default(
      "postgresql://workspace_user:workspace_pass@127.0.0.1:5433/workspace_test?schema=public",
    ),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  SESSION_COOKIE_NAME: z.string().default("workspace_session"),
  SESSION_TTL_DAYS: z
    .string()
    .default("7")
    .transform((val) => parseInt(val, 10)),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((val) => val === "true"),
  // Stripe & Billing Configuration
  STRIPE_SECRET_KEY: z.string().default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().default("whsec_placeholder"),
  STRIPE_PRO_PRICE_ID: z.string().default("price_pro_placeholder"),
  APP_URL: z.string().default("http://localhost:3000"),
  // Plan limits (configurable)
  FREE_MAX_PROJECTS: z
    .string()
    .default("3")
    .transform((val) => parseInt(val, 10)),
  FREE_MAX_MEMBERS: z
    .string()
    .default("5")
    .transform((val) => parseInt(val, 10)),
  PRO_MAX_PROJECTS: z
    .string()
    .default("50")
    .transform((val) => parseInt(val, 10)),
  PRO_MAX_MEMBERS: z
    .string()
    .default("50")
    .transform((val) => parseInt(val, 10)),
  // Redis & Rate Limiting Configuration
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z
    .string()
    .default("6379")
    .transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z.string().optional(),
  RATE_LIMIT_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  TRUST_PROXY: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  USE_REDIS_MOCK: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    console.error(`[FATAL] Configuration validation failed: ${issues}`);
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

export const env = validateEnv();
