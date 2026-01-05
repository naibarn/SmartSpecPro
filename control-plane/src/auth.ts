import type { FastifyInstance } from "fastify";
import { z } from "zod";

export type Role = "admin" | "runner" | "user";

export function registerAuth(app: FastifyInstance) {
  // authenticate middleware
  app.decorate("authenticate", async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  // Mint scoped JWT using server-to-server API key.
  const MintSchema = z.object({
    apiKey: z.string().min(1),
    scope: z.object({
      role: z.enum(["admin", "runner", "user"]).default("user"),
      projectId: z.string().optional(),
      sessionId: z.string().optional(),
      sub: z.string().optional(), // optional subject override
    }),
    ttlSeconds: z.number().int().min(60).max(3600).optional(),
  });

  app.post("/api/v1/auth/token", async (req, reply) => {
    const body = MintSchema.parse(req.body);
    if (body.apiKey !== app.env.CONTROL_PLANE_API_KEY) {
      return reply.code(401).send({ error: "invalid_api_key" });
    }

    const ttl = body.ttlSeconds ?? 900;
    const sub = body.scope.sub ?? `svc:${body.scope.role}`;
    const token = await (app as any).jwt.sign(
      {
        role: body.scope.role,
        projectId: body.scope.projectId ?? null,
        sessionId: body.scope.sessionId ?? null,
      },
      { subject: sub, expiresIn: ttl }
    );

    return { token, expiresInSeconds: ttl };
  });
}

export function requireRole(app: FastifyInstance, roles: Role[]) {
  return async (req: any, reply: any) => {
    await (app as any).authenticate(req, reply);
    const role = req.user?.role as Role | undefined;
    if (!role || !roles.includes(role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
}

export function requireSessionScope(app: FastifyInstance) {
  return async (req: any, reply: any) => {
    await (app as any).authenticate(req, reply);
    const claimSession = req.user?.sessionId as string | null | undefined;
    const sessionId = (req.params as any)?.sessionId as string | undefined;
    // If token is session-scoped, enforce it
    if (claimSession && sessionId && claimSession !== sessionId) {
      return reply.code(403).send({ error: "session_scope_mismatch" });
    }
  };
}
