import type { PrismaClient } from "@prisma/client";

export async function audit(prisma: PrismaClient, input: {
  actor: string;
  action: string;
  details?: Record<string, unknown>;
  projectId?: string | null;
  sessionId?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: input.action,
        details: input.details ?? null,
        projectId: input.projectId ?? null,
        sessionId: input.sessionId ?? null,
      },
    });
  } catch {
    // audit must not break core flows
  }
}
