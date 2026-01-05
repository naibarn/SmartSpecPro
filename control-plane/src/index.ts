import Fastify from "fastify";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { loadEnv } from "./config";
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

declare module "fastify" {
  interface FastifyInstance {
    prisma: ReturnType<typeof createPrisma>;
    env: ReturnType<typeof loadEnv>;
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

async function main() {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    },
  });

  app.env = env;
  app.prisma = createPrisma();

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
        // if already verified
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

  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
