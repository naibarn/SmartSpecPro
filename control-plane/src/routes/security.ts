import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "../services/audit";

const CreateSecurityCheckSchema = z.object({
  iteration: z.number().int().min(0).optional().nullable(),
  status: z.enum(["pass", "fail"]).default("pass"),
  artifactKey: z.string().min(1).optional().nullable(),
  summary: z.record(z.any()).optional().nullable(),
});

export async function registerSecurityRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/security-checks", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateSecurityCheckSchema.parse(req.body);

    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const securityCheck = await app.prisma.securityCheck.create({
      data: {
        sessionId,
        iteration: body.iteration ?? undefined,
        status: body.status,
        artifactKey: body.artifactKey ?? undefined,
        summary: (body.summary ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });

    await audit(app.prisma, { actor: "runner", action: "securityCheck.create", projectId: session.projectId, sessionId, details: { status: securityCheck.status } });

    return { securityCheck };
  });

  app.get("/api/v1/sessions/:sessionId/security-checks/latest", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    const securityCheck = await app.prisma.securityCheck.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
    return { securityCheck };
  });
}
