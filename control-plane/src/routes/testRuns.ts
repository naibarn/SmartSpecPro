import type { FastifyInstance } from "fastify";
import { z } from "zod";

const CreateTestRunSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  passed: z.boolean(),
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.any()).optional(),
});

export async function registerTestRunRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/test-runs", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateTestRunSchema.parse(req.body);

    const testRun = await app.prisma.testRun.create({
      data: {
        sessionId,
        iteration: body.iteration ?? null,
        passed: body.passed,
        artifactKey: body.artifactKey ?? null,
        summary: body.summary ?? null,
      },
    });

    return { testRun };
  });

  app.get("/api/v1/sessions/:sessionId/test-runs/latest", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const testRun = await app.prisma.testRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { testRun };
  });
}
