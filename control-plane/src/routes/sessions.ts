import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const CreateSessionSchema = z.object({ name: z.string().min(1).optional() });

export async function registerSessionRoutes(app: FastifyInstance) {
  app.post("/api/v1/projects/:projectId/sessions", { preHandler: [requireRole(app, ["admin", "user"])] }, async (req: any) => {
    const { projectId } = req.params as any;
    const body = CreateSessionSchema.parse(req.body);
    const session = await app.prisma.session.create({ data: { projectId, name: body.name ?? null } });
    await auditLog(app.prisma, { actorSub: req.user.sub, action: "session.create", projectId, sessionId: session.id });
    return { session };
  });

  app.post("/api/v1/sessions/:sessionId/iterations", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const iter = await app.prisma.iteration.create({ data: { sessionId } });
    await auditLog(app.prisma, { actorSub: req.user.sub, action: "iteration.create", sessionId });
    return { iteration: iter };
  });

  app.get("/api/v1/sessions/:sessionId", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req) => {
    const { sessionId } = req.params as any;

    const session = await app.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        project: true,
        iterations: { orderBy: { createdAt: "asc" } },
        tasks: { orderBy: { createdAt: "asc" } },
        reports: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    return { session };
  });
}
