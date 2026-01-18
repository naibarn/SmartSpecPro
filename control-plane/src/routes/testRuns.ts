import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "../services/audit";

const CreateTestRunSchema = z.object({
  iteration: z.number().int().min(0).optional().nullable(),
  passed: z.boolean(),
  artifactKey: z.string().min(1).optional().nullable(),
  summary: z.record(z.any()).optional().nullable(),
});

export async function registerTestRunRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/test-runs", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateTestRunSchema.parse(req.body);

    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const testRun = await app.prisma.testRun.create({
      data: {
        sessionId,
        iteration: body.iteration ?? undefined,
        passed: body.passed,
        artifactKey: body.artifactKey ?? undefined,
        summary: (body.summary ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await audit(app.prisma, { actor: "runner", action: "testRun.create", projectId: session.projectId, sessionId, details: { passed: testRun.passed } });

    return { testRun };
  });

  app.get("/api/v1/sessions/:sessionId/test-runs/latest", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const testRun = await app.prisma.testRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { testRun };
  });
}
