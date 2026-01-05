import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const RequestSchema = z.object({
  reason: z.string().min(1).optional(),
  ttlSeconds: z.number().int().min(60).max(1800).optional(),
});

const ValidateSchema = z.object({
  token: z.string().min(20),
});

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export async function registerApprovalRoutes(app: FastifyInstance) {
  // User requests an apply-approval token (one-time).
  app.post("/api/v1/sessions/:sessionId/approvals/apply", { preHandler: [requireRole(app, ["admin", "user"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = RequestSchema.parse(req.body ?? {});
    const ttl = body.ttlSeconds ?? 600;

    const raw = crypto.randomBytes(24).toString("base64url");
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    const approval = await app.prisma.applyApproval.create({
      data: { sessionId, tokenHash, expiresAt, status: "issued", reason: body.reason ?? null, issuedToSub: req.user.sub },
    });

    await auditLog(app.prisma, { actorSub: req.user.sub, action: "approval.issue_apply", sessionId, resource: approval.id, metadata: { ttlSeconds: ttl } });

    // Return raw token ONCE. Store only hash.
    return { approvalId: approval.id, token: raw, expiresInSeconds: ttl };
  });

  // Orchestrator/runner validates (consumes) approval token before applying.
  app.post("/api/v1/sessions/:sessionId/approvals/apply/consume", { preHandler: [requireRole(app, ["admin", "runner"]), requireSessionScope(app)] }, async (req: any, reply) => {
    const { sessionId } = req.params as any;
    const body = ValidateSchema.parse(req.body);

    const tokenHash = hashToken(body.token);

    const approval = await app.prisma.applyApproval.findFirst({ where: { sessionId, tokenHash } });
    if (!approval) return reply.code(404).send({ error: "approval_not_found" });
    if (approval.status !== "issued") return reply.code(400).send({ error: "approval_not_usable", status: approval.status });
    if (approval.expiresAt.getTime() < Date.now()) return reply.code(400).send({ error: "approval_expired" });

    const updated = await app.prisma.applyApproval.update({
      where: { id: approval.id },
      data: { status: "consumed", consumedAt: new Date() },
    });

    await auditLog(app.prisma, { actorSub: req.user.sub, action: "approval.consume_apply", sessionId, resource: updated.id });

    return { ok: true };
  });
}
