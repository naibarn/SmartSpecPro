import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auditLog } from "../audit";
import { requireRole, requireSessionScope } from "../auth";

const TestRunSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  passed: z.boolean(),
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.any()).optional(),
});

const CoverageSchema = z.object({
  iteration: z.number().int().min(0).optional(),
  percent: z.number().min(0).max(100),
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.any()).optional(),
});

const SecuritySchema = z.object({
  iteration: z.number().int().min(0).optional(),
  status: z.enum(["pass", "fail"]).default("pass"),
  artifactKey: z.string().min(1).optional(),
  summary: z.record(z.any()).optional(),
});

export async function registerResultRoutes(app: FastifyInstance) {
  app.post("/api/v1/sessions/:sessionId/test-runs", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = TestRunSchema.parse(req.body);

    const rec = await app.prisma.testRun.create({
      data: { sessionId, iteration: body.iteration ?? undefined, passed: body.passed, artifactKey: body.artifactKey ?? undefined, summary: (body.summary ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await auditLog(app.prisma, { actor: req.user.sub, action: "testrun.create", sessionId, resource: rec.id });
    return { testRun: rec };
  });

  app.post("/api/v1/sessions/:sessionId/coverage-runs", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = CoverageSchema.parse(req.body);

    const rec = await app.prisma.coverageRun.create({
      data: { sessionId, iteration: body.iteration ?? undefined, percent: body.percent, artifactKey: body.artifactKey ?? undefined, summary: (body.summary ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await auditLog(app.prisma, { actor: req.user.sub, action: "coveragerun.create", sessionId, resource: rec.id });
    return { coverageRun: rec };
  });

  app.post("/api/v1/sessions/:sessionId/security-checks", { preHandler: [requireRole(app, ["admin", "user", "runner"]), requireSessionScope(app)] }, async (req: any) => {
    const { sessionId } = req.params as any;
    const body = SecuritySchema.parse(req.body);

    const rec = await app.prisma.securityCheck.create({
      data: { sessionId, iteration: body.iteration ?? undefined, status: body.status, artifactKey: body.artifactKey ?? undefined, summary: (body.summary ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    await auditLog(app.prisma, { actor: req.user.sub, action: "securitycheck.create", sessionId, resource: rec.id });
    return { securityCheck: rec };
  });
}
