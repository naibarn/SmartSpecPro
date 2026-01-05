import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog } from "../audit";
import { requireRole } from "../auth";

const CreateProjectSchema = z.object({ name: z.string().min(1) });

export async function registerProjectRoutes(app: FastifyInstance) {
  app.post("/api/v1/projects", { preHandler: [requireRole(app, ["admin", "user"])] }, async (req: any) => {
    const body = CreateProjectSchema.parse(req.body);
    const project = await app.prisma.project.create({ data: { name: body.name } });
    await auditLog(app.prisma, { actorSub: req.user.sub, action: "project.create", projectId: project.id });
    return { project };
  });

  app.get("/api/v1/projects/:projectId", { preHandler: [requireRole(app, ["admin", "user", "runner"])] }, async (req) => {
    const { projectId } = req.params as any;
    const project = await app.prisma.project.findUnique({ where: { id: projectId } });
    return { project };
  });
}
