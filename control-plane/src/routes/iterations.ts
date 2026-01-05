import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../services/audit";

const CreateIterationSchema = z.object({
  number: z.number().int().min(0).optional(),
});

export async function registerIterationRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/iterations", { preHandler: [app.authenticate] }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const body = CreateIterationSchema.parse(req.body);

    const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return reply.code(404).send({ error: "session_not_found" });

    let number = body.number;
    if (number === undefined) {
      const last = await app.prisma.iteration.findFirst({ where: { sessionId }, orderBy: { number: "desc" } });
      number = last ? last.number + 1 : 0;
    }

    const iter = await app.prisma.iteration.create({ data: { sessionId, number } });
    await audit(app.prisma, { actor: "runner", action: "iteration.create", projectId: session.projectId, sessionId, details: { number } });
    return { iteration: iter };
  });
}
