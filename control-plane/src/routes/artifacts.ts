import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { Env } from "../config.js";
import { createR2Client, presignPut, presignGet, sanitizeObjectName } from "../storage/r2.js";

const PresignPutBody = z.object({
  iteration: z.number().int().nonnegative(),
  name: z.string().min(1),
  contentType: z.string().min(1).optional(),
});

const PresignGetQuery = z.object({
  key: z.string().min(1),
});

function buildAllowedPrefix(projectId: string, sessionId: string, iteration: number) {
  return `projects/${projectId}/sessions/${sessionId}/iter/${iteration}/`;
}

export async function registerArtifactRoutes(app: FastifyInstance, env: Env) {
  const s3 = createR2Client(env);
  // Presign PUT for an artifact under the session
  app.post(
    "/api/v1/sessions/:sessionId/artifacts/presign-put",
    { preHandler: async (req) => app.requireAuth(req) },
    async (request, reply) => {
      const sessionId = (request.params as any).sessionId as string;
      const body = PresignPutBody.parse(request.body ?? {});

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) return reply.code(404).send({ error: "session_not_found" });

      const safeName = sanitizeObjectName(body.name);
      const prefix = buildAllowedPrefix(session.projectId, sessionId, body.iteration);
      // Convention: store reports under reports/
      const key = `${prefix}reports/${safeName}`;

      const result = await presignPut(env, s3, {
        key,
        contentType: body.contentType ?? "application/octet-stream",
      });

      await prisma.auditLog.create({
        data: {
          actorType: request.user?.actorType ?? "SYSTEM",
          actorId: request.user?.sub,
          action: "artifact.presign_put",
          targetType: "Session",
          targetId: sessionId,
          meta: { key, iteration: body.iteration },
        },
      });

      return { artifact: result };
    }
  );

  // Presign GET for an artifact key (must be within this session)
  app.get(
    "/api/v1/sessions/:sessionId/artifacts/presign-get",
    { preHandler: async (req) => app.requireAuth(req) },
    async (request, reply) => {
      const sessionId = (request.params as any).sessionId as string;
      const query = PresignGetQuery.parse(request.query ?? {});

      const session = await prisma.session.findUnique({ where: { id: sessionId } });
      if (!session) return reply.code(404).send({ error: "session_not_found" });

      // Enforce: key must start with projects/{projectId}/sessions/{sessionId}/ and not contain traversal
      const allowedRoot = `projects/${session.projectId}/sessions/${sessionId}/`;
      if (!query.key.startsWith(allowedRoot)) {
        return reply.code(403).send({ error: "artifact_key_not_allowed" });
      }
      if (query.key.includes("..") || query.key.includes("\\")) {
        return reply.code(403).send({ error: "artifact_key_not_allowed" });
      }

      const result = await presignGet(env, s3, { key: query.key });

      await prisma.auditLog.create({
        data: {
          actorType: request.user?.actorType ?? "SYSTEM",
          actorId: request.user?.sub,
          action: "artifact.presign_get",
          targetType: "Session",
          targetId: sessionId,
          meta: { key: query.key },
        },
      });

      return { artifact: result };
    }
  );
}
