import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth";

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get("/api/v1/audit", { preHandler: [requireRole(app, ["admin"])] }, async (req) => {
    const limit = Math.min(Number((req.query as any)?.limit ?? 50), 200);
    const logs = await app.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return { logs };
  });
}
