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
  // Storage & Object Storage Configuration
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./uploads"),
  STORAGE_S3_BUCKET: z.string().default("workspace-attachments"),
  STORAGE_S3_REGION: z.string().default("us-east-1"),
  STORAGE_S3_ENDPOINT: z.string().optional(),
  STORAGE_S3_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_S3_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_S3_FORCE_PATH_STYLE: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  STORAGE_MAX_FILE_SIZE_BYTES: z
    .string()
    .default("10485760")
    .transform((val) => parseInt(val, 10)),
  STORAGE_SIGNED_URL_EXPIRES_SECONDS: z
    .string()
    .default("900")
    .transform((val) => parseInt(val, 10)),
  ALLOW_LOCAL_WEBHOOKS: z
    .string()
    .default("false")
    .transform((val) => val === "true"),
  // Enterprise Security & MFA Configuration
  MFA_ENCRYPTION_KEY: z
    .string()
    .default("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
    .refine(
      (key) => {
        const isHex = /^[0-9a-fA-F]{64}$/.test(key);
        const isUtf8 = Buffer.from(key, "utf8").length === 32;
        return isHex || isUtf8;
      },
      {
        message:
          "MFA_ENCRYPTION_KEY must be 32 bytes (64 hex characters or 32 UTF-8 characters)",
      },
    ),
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

  // Production-specific security and configuration constraints
  if (parsed.data.NODE_ENV === "production") {
    if (
      parsed.data.MFA_ENCRYPTION_KEY ===
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    ) {
      throw new Error(
        "Production deployment requires a unique, securely generated MFA_ENCRYPTION_KEY. Default development key is forbidden in production.",
      );
    }

    if (parsed.data.STORAGE_PROVIDER === "s3") {
      if (
        !parsed.data.STORAGE_S3_ACCESS_KEY_ID ||
        !parsed.data.STORAGE_S3_SECRET_ACCESS_KEY
      ) {
        throw new Error(
          "When STORAGE_PROVIDER is set to 's3' in production, STORAGE_S3_ACCESS_KEY_ID and STORAGE_S3_SECRET_ACCESS_KEY are required.",
        );
      }
    }
  }

  return parsed.data;
}

export const env = validateEnv();
