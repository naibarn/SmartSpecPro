import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().default(7070),

  DATABASE_URL: z.string(),

  JWT_ISSUER: z.string().default("smartspec-control-plane"),
  JWT_AUDIENCE: z.string().default("smartspec"),
  JWT_SECRET: z.string().min(16),

  // Phase 3: Gate thresholds
  COVERAGE_MIN_PERCENT: z.coerce.number().default(70),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error(parsed.error.format());
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}
