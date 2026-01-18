import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export async function auditLog(prisma: PrismaClient, args: {
  actor: string;
  action: string;
  sessionId?: string | null;
  projectId?: string | null;
  resource?: string | null;
  details?: Record<string, unknown> | null;
}) {
  await prisma.auditLog.create({
    data: {
      actor: args.actor,
      action: args.action,
      sessionId: args.sessionId ?? undefined,
      projectId: args.projectId ?? undefined,
      resource: args.resource ?? undefined,
      details: (args.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
