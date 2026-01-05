import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { PrismaClient } from "@prisma/client";
import { loadEnv } from "./config";

import { registerTaskRoutes } from "./routes/tasks";
import { registerTestRunRoutes } from "./routes/testRuns";
import { registerCoverageRoutes } from "./routes/coverage";
import { registerSecurityRoutes } from "./routes/security";
import { registerGateRoutes } from "./routes/gates";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    env: ReturnType<typeof loadEnv>;
    authenticate: any;
  }
}

async function main() {
  const env = loadEnv();
  const app = Fastify({ logger: true });

  app.env = env;
  app.prisma = new PrismaClient();

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
    verify: { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
  });

  app.decorate("authenticate", async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  // Phase 3 routes
  await registerTaskRoutes(app);
  await registerTestRunRoutes(app);
  await registerCoverageRoutes(app);
  await registerSecurityRoutes(app);
  await registerGateRoutes(app);

  app.get("/healthz", async () => ({ ok: true }));

  const port = env.PORT;
  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
