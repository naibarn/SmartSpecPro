import { TRPCError } from "@trpc/server";
import type { ContextOwnerScope } from "../../shared/contextEngine";

export interface ContextAccessSubject {
  userId: number;
  role?: string | null;
  tenantId: string;
}

export interface RoomContextAccessCheckerInput {
  subject: ContextAccessSubject;
  roomId: string;
  teamId?: string | null;
  canAccessRoom: () => Promise<boolean>;
}

export async function assertRoomContextAccess(
  input: RoomContextAccessCheckerInput,
): Promise<void> {
  const isElevated =
    input.subject.role === "admin" || input.subject.role === "domain_admin";
  if (isElevated) return;
  const allowed = await input.canAccessRoom();
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this room context",
    });
  }
}

export function canMutateOwnedContextScope(
  subject: ContextAccessSubject,
  scope: ContextOwnerScope,
): boolean {
  if (scope.type === "user") {
    return scope.id === String(subject.userId);
  }
  if (subject.role === "admin" || subject.role === "domain_admin") {
    return true;
  }
  return scope.tenantId === subject.tenantId;
}

export function assertContextScopeOwnership(
  subject: ContextAccessSubject,
  scope: ContextOwnerScope,
): void {
  if (!canMutateOwnedContextScope(subject, scope)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to mutate this context scope",
    });
  }
}

