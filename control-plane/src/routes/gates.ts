import type { FastifyInstance } from "fastify";
import { evaluateGates } from "../services/gates";
import { requireRole, requireSessionScope } from "../auth";

export async function registerGateRoutes(app: FastifyInstance) {
  app.get("/api/v1/sessions/:sessionId/gates/evaluate", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req) => {
    const { sessionId } = req.params as any;
    const evaluation = await evaluateGates(app.prisma, app.env, sessionId);
    return { evaluation };
  });
}
