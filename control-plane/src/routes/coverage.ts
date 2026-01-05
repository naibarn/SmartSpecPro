import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../services/audit";

const CreateCoverageSchema = z.object({
  iteration: z.number().int().min(0).optional().nullable(),
  percent: z.number().min(0).max(100),
  artifactKey: z.string().min(1).optional().nullable(),
  summary: z.record(z.any()).optional().nullable(),
});

export async function registerCoverageRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/coverage-runs", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateCoverageSchema.parse(req.body);

    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const coverageRun = await app.prisma.coverageRun.create({
      data: {
        sessionId,
        iteration: body.iteration ?? null,
        percent: body.percent,
        artifactKey: body.artifactKey ?? null,
        summary: body.summary ?? null,
      },
    });

    await audit(app.prisma, { actor: "runner", action: "coverageRun.create", projectId: session.projectId, sessionId, details: { percent: coverageRun.percent } });

    return { coverageRun };
  });

  app.get("/api/v1/sessions/:sessionId/coverage-runs/latest", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const coverageRun = await app.prisma.coverageRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { coverageRun };
  });
}
