import type { FastifyInstance } from "fastify";
import { z } from "zod";

const CreateCoverageSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  percent: z.number().min(0).max(100),
  artifactKey: z.string().min(1).optional(), // pointer to coverage report (html/json) in R2
  summary: z.record(z.any()).optional(),
});

export async function registerCoverageRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/coverage-runs", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateCoverageSchema.parse(req.body);

    const coverageRun = await app.prisma.coverageRun.create({
      data: {
        sessionId,
        iteration: body.iteration ?? null,
        percent: body.percent,
        artifactKey: body.artifactKey ?? null,
        summary: body.summary ?? null,
      },
    });

    return { coverageRun };
  });

  app.get("/api/v1/sessions/:sessionId/coverage-runs/latest", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const coverageRun = await app.prisma.coverageRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { coverageRun };
  });
}
