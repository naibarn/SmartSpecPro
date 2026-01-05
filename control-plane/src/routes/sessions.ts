import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const CreateSession = z.object({
  name: z.string().min(1),
});

const CreateIteration = z.object({
  number: z.number().int().nonnegative(),
});

const UpsertTasks = z.object({
  tasks: z.array(z.object({
    taskId: z.string().min(1),
    title: z.string().min(1),
    dedupeKey: z.string().min(1),
    status: z.enum(["PLANNED","DOING","DONE","BLOCKED"]).optional(),
    originatingSpec: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    mappedFiles: z.any().optional(),
    mappedTests: z.any().optional(),
  })).min(1),
});

const AttachReport = z.object({
  kind: z.string().min(1),
  title: z.string().min(1),
  iterationId: z.string().optional(),
  summaryJson: z.any().optional(),
  storageKey: z.string().optional(),
  contentType: z.string().optional(),
});

export async function registerSessionRoutes(app: FastifyInstance) {
  // create session
  app.post("/api/v1/projects/:projectId/sessions", { preHandler: async (req) => app.requireAuth(req) }, async (request, reply) => {
    const projectId = (request.params as any).projectId as string;
    const body = CreateSession.parse(request.body ?? {});
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ error: "project_not_found" });

    const session = await prisma.session.create({ data: { projectId, name: body.name } });
    await prisma.auditLog.create({
      data: {
        actorType: request.user?.actorType ?? "SYSTEM",
        actorId: request.user?.sub,
        action: "session.create",
        targetType: "Session",
        targetId: session.id,
        meta: { projectId },
      },
    });
    return { session };
  });

  // create iteration
  app.post("/api/v1/sessions/:sessionId/iterations", { preHandler: async (req) => app.requireAuth(req) }, async (request) => {
    const sessionId = (request.params as any).sessionId as string;
    const body = CreateIteration.parse(request.body ?? {});
    const iteration = await prisma.iteration.create({ data: { sessionId, number: body.number } });
    await prisma.auditLog.create({
      data: {
        actorType: request.user?.actorType ?? "SYSTEM",
        actorId: request.user?.sub,
        action: "iteration.create",
        targetType: "Iteration",
        targetId: iteration.id,
        meta: { sessionId, number: body.number },
      },
    });
    return { iteration };
  });

  // upsert tasks (dedupeKey unique per session)
  app.put("/api/v1/sessions/:sessionId/tasks", { preHandler: async (req) => app.requireAuth(req) }, async (request) => {
    const sessionId = (request.params as any).sessionId as string;
    const body = UpsertTasks.parse(request.body ?? {});

    const results = await Promise.all(
      body.tasks.map((t) =>
        prisma.task.upsert({
          where: { sessionId_dedupeKey: { sessionId, dedupeKey: t.dedupeKey } },
          create: {
            sessionId,
            taskId: t.taskId,
            title: t.title,
            dedupeKey: t.dedupeKey,
            status: (t.status as any) ?? "PLANNED",
            originatingSpec: t.originatingSpec,
            acceptanceCriteria: t.acceptanceCriteria,
            mappedFiles: t.mappedFiles,
            mappedTests: t.mappedTests,
          },
          update: {
            taskId: t.taskId,
            title: t.title,
            status: (t.status as any) ?? undefined,
            originatingSpec: t.originatingSpec,
            acceptanceCriteria: t.acceptanceCriteria,
            mappedFiles: t.mappedFiles,
            mappedTests: t.mappedTests,
          },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        actorType: request.user?.actorType ?? "SYSTEM",
        actorId: request.user?.sub,
        action: "task.upsert",
        targetType: "Session",
        targetId: sessionId,
        meta: { count: results.length },
      },
    });

    return { tasks: results };
  });

  // attach report metadata
  app.post("/api/v1/sessions/:sessionId/reports", { preHandler: async (req) => app.requireAuth(req) }, async (request) => {
    const sessionId = (request.params as any).sessionId as string;
    const body = AttachReport.parse(request.body ?? {});
    const report = await prisma.report.create({
      data: {
        sessionId,
        iterationId: body.iterationId,
        kind: body.kind,
        title: body.title,
        summaryJson: body.summaryJson,
        storageKey: body.storageKey,
        contentType: body.contentType,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorType: request.user?.actorType ?? "SYSTEM",
        actorId: request.user?.sub,
        action: "report.attach",
        targetType: "Report",
        targetId: report.id,
        meta: { sessionId, kind: body.kind },
      },
    });

    return { report };
  });

  // get session state
  app.get("/api/v1/sessions/:sessionId", { preHandler: async (req) => app.requireAuth(req) }, async (request, reply) => {
    const sessionId = (request.params as any).sessionId as string;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { iterations: true, tasks: true, reports: true, project: true },
    });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    return {
      session: {
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        project: { id: session.project.id, name: session.project.name },
      },
      iterations: session.iterations,
      tasks: session.tasks,
      reports: session.reports,
    };
  });
}
