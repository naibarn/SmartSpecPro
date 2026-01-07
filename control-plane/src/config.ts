import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(7070),

  DATABASE_URL: z.string(),

  CONTROL_PLANE_API_KEY: z.string().min(24),

  JWT_SECRET: z.string().min(16),
  JWT_ISSUER: z.string().default("smartspec-control-plane"),
  JWT_AUDIENCE: z.string().default("smartspec"),

  // Gates
  COVERAGE_MIN_PERCENT: z.coerce.number().default(70),

  // Artifacts
  R2_ENDPOINT: z.string().url(),
  R2_REGION: z.string().default("auto"),
  R2_BUCKET: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_PRESIGN_EXPIRES_SECONDS: z.coerce.number().default(600),

  ARTIFACT_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  ARTIFACT_ALLOWED_CONTENT_TYPES: z.string().default("application/json,text/plain,text/markdown,application/zip"),

  RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_TIME_WINDOW: z.coerce.number().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }
  const env = parsed.data;

  // Extra safety: do not allow known placeholder secrets in production
  const placeholderSecrets = new Set([
    "change_me_long_random",
    "change_me_long_random_at_least_16_chars",
    "change_me_long_random_change_me_long_random",
  ]);

  if (env.NODE_ENV === "production") {
    if (placeholderSecrets.has(env.CONTROL_PLANE_API_KEY)) {
      throw new Error("CONTROL_PLANE_API_KEY must be overridden in production");
    }
    if (placeholderSecrets.has(env.JWT_SECRET)) {
      throw new Error("JWT_SECRET must be overridden in production");
    }
  }

  return env;
}

export function allowedContentTypes(env: Env): Set<string> {
  return new Set(env.ARTIFACT_ALLOWED_CONTENT_TYPES.split(",").map((s) => s.trim()).filter(Boolean));
}
