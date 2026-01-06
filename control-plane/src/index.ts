import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { loadEnv, type Env } from "./config";
import { createPrisma } from "./db";
import { registerAuth } from "./auth";

import { registerProjectRoutes } from "./routes/projects";
import { registerSessionRoutes } from "./routes/sessions";
import { registerTaskRoutes } from "./routes/tasks";
import { registerReportRoutes } from "./routes/reports";
import { registerArtifactRoutes } from "./routes/artifacts";
import { registerResultRoutes } from "./routes/results";
import { registerGateRoutes } from "./routes/gates";
import { registerApprovalRoutes } from "./routes/approvals";
import { registerAuditRoutes } from "./routes/audit";

import path from "node:path";
import { fileURLToPath } from "node:url";

declare module "fastify" {
  interface FastifyInstance {
    prisma: ReturnType<typeof createPrisma>;
    env: Env;
    authenticate: any;
  }
}

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.x-api-key",
  "req.headers.cookie",
  "req.body.apiKey",
  "req.body.token",
];

export type BuildAppOptions = {
  env?: Env;
  prisma?: any;
  logger?: boolean;
};

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = opts.env ?? loadEnv();
  const app = Fastify({
    logger: opts.logger
      ? { redact: { paths: REDACT_PATHS, censor: "[REDACTED]" } }
      : false,
  });

  app.env = env as any;
  app.prisma = (opts.prisma ?? createPrisma()) as any;

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    verify: { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_TIME_WINDOW,
    keyGenerator: (req) => {
      try {
        const user = (req as any).user;
        if (user?.sub) return `sub:${user.sub}`;
      } catch {}
      return req.ip;
    },
  });

  registerAuth(app);

  // Routes
  await registerProjectRoutes(app);
  await registerSessionRoutes(app);
  await registerTaskRoutes(app);
  await registerReportRoutes(app);
  await registerArtifactRoutes(app);
  await registerResultRoutes(app);
  await registerGateRoutes(app);
  await registerApprovalRoutes(app);
  await registerAuditRoutes(app);

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}

async function main() {
  const app = await buildApp({ logger: true });
  await app.listen({ host: "0.0.0.0", port: app.env.PORT });
}

// ESM "main" detection: only auto-start when executed directly.
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
