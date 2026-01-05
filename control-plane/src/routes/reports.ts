import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const CreateReportSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  title: z.string().min(1),
  artifactKey: z.string().min(1),
  kind: z.string().min(1).default("workflow_report"),
  summary: z.record(z.any()).optional(),
});

export async function registerReportRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/reports", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = CreateReportSchema.parse(req.body);

    const report = await app.prisma.report.create({
      data: {
        sessionId,
        iteration: body.iteration ?? null,
        title: body.title,
        kind: body.kind,
        artifactKey: body.artifactKey,
        summary: body.summary ?? null,
      },
    });

    await auditLog(app.prisma, { actorSub: req.user.sub, action: "report.create", sessionId, resource: report.id, metadata: { artifactKey: body.artifactKey } });

    return { report };
  });

  app.get("/api/v1/sessions/:sessionId/reports", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req) => {
    const { sessionId } = req.params as any;
    const reports = await app.prisma.report.findMany({ where: { sessionId }, orderBy: { createdAt: "desc" }, take: 100 });
    return { reports };
  });
}
