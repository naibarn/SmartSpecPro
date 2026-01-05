import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

const CreateProject = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function registerProjectRoutes(app: FastifyInstance) {
  app.post("/api/v1/projects", { preHandler: async (req) => app.requireAuth(req) }, async (request) => {
    const body = CreateProject.parse(request.body ?? {});
    const project = await prisma.project.create({ data: { name: body.name, description: body.description } });
    await prisma.auditLog.create({
      data: {
        actorType: request.user?.actorType ?? "SYSTEM",
        actorId: request.user?.sub,
        action: "project.create",
        targetType: "Project",
        targetId: project.id,
        meta: { name: project.name },
      },
    });
    return { project };
  });

  app.get("/api/v1/projects/:projectId", { preHandler: async (req) => app.requireAuth(req) }, async (request, reply) => {
    const projectId = (request.params as any).projectId as string;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return reply.code(404).send({ error: "not_found" });
    return { project };
  });
}

declare module "fastify" {
  interface FastifyRequest {
    user?: any;
  }
}
