import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ActorType, JwtPayload } from "../auth.js";

const TokenRequest = z.object({
  apiKey: z.string().min(1),
  actorType: z.enum(["UI", "RUNNER", "SYSTEM"]).default("UI"),
  actorId: z.string().min(1).default("anon"),
});

export async function registerAuthRoutes(app: FastifyInstance, apiKeys: Set<string>, expiresIn: string) {
  app.post("/api/v1/auth/token", async (request, reply) => {
    const body = TokenRequest.parse(request.body ?? {});
    if (!apiKeys.has(body.apiKey)) {
      return reply.code(401).send({ error: "invalid_api_key" });
    }

    const payload: JwtPayload = { sub: body.actorId, actorType: body.actorType as ActorType };
    const token = app.jwt.sign(payload, { expiresIn });

    return reply.send({ token, expiresIn });
  });
}
