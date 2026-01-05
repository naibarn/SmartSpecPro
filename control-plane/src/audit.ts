import type { PrismaClient } from "@prisma/client";

export async function auditLog(prisma: PrismaClient, args: {
  actorSub: string;
  action: string;
  sessionId?: string | null;
  projectId?: string | null;
  resource?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await prisma.auditLog.create({
    data: {
      actorSub: args.actorSub,
      action: args.action,
      sessionId: args.sessionId ?? null,
      projectId: args.projectId ?? null,
      resource: args.resource ?? null,
      metadata: args.metadata ?? null,
    },
  });
}
