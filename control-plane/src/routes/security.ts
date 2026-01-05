import type { FastifyInstance } from "fastify";
import { z } from "zod";

const CreateSecurityCheckSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  status: z.enum(["pass", "fail"]).default("pass"),
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.any()).optional(),
});

export async function registerSecurityRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/security-checks", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateSecurityCheckSchema.parse(req.body);

    const securityCheck = await app.prisma.securityCheck.create({
      data: {
        sessionId,
        iteration: body.iteration ?? null,
        status: body.status,
        artifactKey: body.artifactKey ?? null,
        summary: body.summary ?? null,
      },
    });

    return { securityCheck };
  });

  app.get("/api/v1/sessions/:sessionId/security-checks/latest", { preHandler: [app.authenticate] }, async (req) => {
    const { sessionId } = req.params as { sessionId: string };
    const securityCheck = await app.prisma.securityCheck.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { securityCheck };
  });
}
