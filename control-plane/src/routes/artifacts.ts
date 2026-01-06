import type { FastifyInstance } from "fastify";
import { z, ZodError } from "zod";
import { allowedContentTypes } from "../config";
import { createR2, presignPut, presignGet } from "../storage/r2";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const PresignPutSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  name: z.string().min(1),
  contentType: z.string().min(1),
  sizeBytes: z.number().int().min(1),
});

const CompleteSchema = z.object({
  key: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  sizeBytes: z.number().int().min(1),
});

function safeName(name: string) {
  // allow letters, numbers, dash, underscore, dot, slash
  if (name.includes("..") || name.includes("\\") || name.startsWith("/")) throw new Error("invalid_name");
  return name.replace(/[^a-zA-Z0-9._\-\/]/g, "_");
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown, reply: any): T | null {
  try {
    return schema.parse(body);
  } catch (e: any) {
    if (e instanceof ZodError) {
      reply.code(400).send({ error: "invalid_request", issues: e.issues });
      return null;
    }
    throw e;
  }
}

export async function registerArtifactRoutes(app: FastifyInstance) {
  const r2 = createR2(app.env);
  const allowed = allowedContentTypes(app.env);

  app.post(
    "/api/v1/sessions/:sessionId/artifacts/presign-put",
    { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] },
    async (req: any, reply) => {
      const { sessionId } = req.params as any;
      const body = parseBody(PresignPutSchema, req.body, reply);
      if (!body) return;

      if (!allowed.has(body.contentType)) return reply.code(400).send({ error: "content_type_not_allowed" });
      if (body.sizeBytes > app.env.ARTIFACT_MAX_BYTES) return reply.code(400).send({ error: "artifact_too_large", maxBytes: app.env.ARTIFACT_MAX_BYTES });

      const session = await app.prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) return reply.code(404).send({ error: "session_not_found" });

      let safe: string;
      try {
        safe = safeName(body.name);
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (msg.includes("invalid_name")) return reply.code(400).send({ error: "invalid_name" });
        throw e;
      }

      const key = `projects/${session.projectId}/sessions/${sessionId}/iter/${body.iteration ?? 0}/${safe}`;

      const artifact = await app.prisma.artifact.create({
        data: { sessionId, projectId: session.projectId, key, status: "pending", contentType: body.contentType, sizeBytes: body.sizeBytes },
      });

      const url = await presignPut({ env: app.env, r2, key, contentType: body.contentType, contentLength: body.sizeBytes });

      await auditLog(app.prisma, { actorSub: req.user.sub, action: "artifact.presign_put", sessionId, projectId: session.projectId, resource: artifact.id, metadata: { key } });

      return { url, key, expiresInSeconds: app.env.R2_PRESIGN_EXPIRES_SECONDS };
    }
  );

  app.post(
    "/api/v1/sessions/:sessionId/artifacts/complete",
    { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] },
    async (req: any, reply) => {
      const { sessionId } = req.params as any;
      const body = parseBody(CompleteSchema, req.body, reply);
      if (!body) return;

      const artifact = await app.prisma.artifact.findFirst({ where: { sessionId, key: body.key } });
      if (!artifact) return reply.code(404).send({ error: "artifact_not_found" });

      const updated = await app.prisma.artifact.update({
        where: { id: artifact.id },
        data: { status: "complete", sha256: body.sha256, sizeBytes: body.sizeBytes },
      });

      await auditLog(app.prisma, { actorSub: req.user.sub, action: "artifact.complete", sessionId, projectId: updated.projectId, resource: updated.id, metadata: { key: body.key } });

      return { artifact: updated };
    }
  );

  app.get(
    "/api/v1/sessions/:sessionId/artifacts/presign-get",
    { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] },
    async (req: any, reply) => {
      const { sessionId } = req.params as any;
      const key = (req.query as any)?.key as string | undefined;
      if (!key) return reply.code(400).send({ error: "missing_key" });

      const artifact = await app.prisma.artifact.findFirst({ where: { sessionId, key, status: "complete" } });
      if (!artifact) return reply.code(404).send({ error: "artifact_not_found_or_not_complete" });

      const url = await presignGet({ env: app.env, r2, key });
      await auditLog(app.prisma, { actorSub: req.user.sub, action: "artifact.presign_get", sessionId, projectId: artifact.projectId, resource: artifact.id, metadata: { key } });

      return { url, key, expiresInSeconds: app.env.R2_PRESIGN_EXPIRES_SECONDS };
    }
  );
}
