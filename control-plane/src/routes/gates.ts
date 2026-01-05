import type { FastifyInstance } from "fastify";
import { evaluateGates } from "../services/gates";

export async function registerGateRoutes(app: FastifyInstance) {
  app.get("/api/v1/sessions/:sessionId/gates/evaluate", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const evaluation = await evaluateGates({ prisma: app.prisma, env: app.env, sessionId });
    return { evaluation };
  });
}
