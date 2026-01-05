import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { computeDedupeKey } from "../services/dedupe";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const TaskUpsertSchema = z.object({
  dedupeKey: z.string().min(16).optional(),
  taskId: z.string().min(1).optional(),
  title: z.string().min(1),
  originatingSpec: z.string().min(1).optional(),
  acceptanceCriteria: z.string().optional(),
  mappedFiles: z.array(z.string()).default([]),
  mappedTests: z.array(z.string()).default([]),
  status: z.enum(["planned", "doing", "done", "blocked"]).default("planned"),
  notes: z.string().optional(),
});

export async function registerTaskRoutes(app: FastifyInstance) {
  app.get("/api/v1/sessions/:sessionId/tasks", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req) => {
    const { sessionId } = req.params as any;
    const tasks = await app.prisma.task.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
    return { tasks };
  });

  app.put("/api/v1/sessions/:sessionId/tasks", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = TaskUpsertSchema.parse(req.body);

    const dedupeKey =
      body.dedupeKey ??
      computeDedupeKey({ originatingSpec: body.originatingSpec ?? null, title: body.title, acceptanceCriteria: body.acceptanceCriteria ?? null });

    const task = await app.prisma.task.upsert({
      where: { sessionId_dedupeKey: { sessionId, dedupeKey } },
      update: {
        taskId: body.taskId ?? undefined,
        title: body.title,
        originatingSpec: body.originatingSpec ?? undefined,
        acceptanceCriteria: body.acceptanceCriteria ?? undefined,
        mappedFiles: body.mappedFiles,
        mappedTests: body.mappedTests,
        status: body.status,
        notes: body.notes ?? undefined,
      },
      create: {
        sessionId,
        dedupeKey,
        taskId: body.taskId ?? null,
        title: body.title,
        originatingSpec: body.originatingSpec ?? null,
        acceptanceCriteria: body.acceptanceCriteria ?? null,
        mappedFiles: body.mappedFiles,
        mappedTests: body.mappedTests,
        status: body.status,
        notes: body.notes ?? null,
      },
    });

    await auditLog(app.prisma, { actorSub: req.user.sub, action: "task.upsert", sessionId, resource: task.id, metadata: { dedupeKey } });

    return { task };
  });
}
