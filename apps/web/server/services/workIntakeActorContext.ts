import type {
  WorkIntakeActorContext,
  WorkIntakeSourceScope,
} from "../../shared/workOrchestrator";
import { resolvePreflightPreviewAccess } from "./preflightAccessPolicyService";

export interface DeriveWorkIntakeActorContextInput {
  tenantId: string;
  actorUserId?: number | null;
  actorRole?: string | null;
  requesterUserId?: string | null;
  domainId?: string | null;
  privateVaultUnlocked?: boolean | null;
  allowedSourceScopes?: readonly WorkIntakeSourceScope[] | null;
  allowedSurfacePermissions?: readonly string[] | null;
}

const BASE_ALLOWED_SOURCE_SCOPES: readonly WorkIntakeSourceScope[] = [
  "case",
  "request",
  "conversation",
  "workpack_run",
  "role_routine_run",
  "manual",
];

const PRIVATE_SOURCE_SCOPES: readonly WorkIntakeSourceScope[] = [
  "memory",
  "library_context_pack",
  "policy",
];

const BASE_ALLOWED_SURFACE_PERMISSIONS = [
  "orchestrator.surface.skill",
  "orchestrator.surface.agency",
  "orchestrator.surface.browser",
  "orchestrator.surface.document_management",
  "orchestrator.surface.media_studio",
  "orchestrator.surface.video_editor",
  "orchestrator.surface.work_os",
  "orchestrator.surface.manual",
  "orchestrator.surface.skill_studio.create_private_or_pending_review",
] as const;

const ADMIN_ONLY_SURFACE_PERMISSIONS = [
  "orchestrator.surface.workflow",
  "orchestrator.surface.skill_studio.improve_owned_skill",
  "orchestrator.surface.skill_studio.auto_apply_proposal",
  "orchestrator.surface.skill_studio.publish_or_widen_visibility",
  "orchestrator.team_override",
  "orchestrator.preview.admin_diagnostic",
] as const;

function normalizeUnique(values: readonly string[] | null | undefined): string[] {
  return Array.from(
    new Set((values ?? []).map(value => value.trim()).filter(Boolean)),
  );
}

function deriveAllowedSourceScopes(
  input: DeriveWorkIntakeActorContextInput,
): WorkIntakeSourceScope[] {
  if (input.allowedSourceScopes && input.allowedSourceScopes.length > 0) {
    return Array.from(new Set(input.allowedSourceScopes));
  }

  const scopes = [...BASE_ALLOWED_SOURCE_SCOPES];
  if (input.privateVaultUnlocked) {
    scopes.push(...PRIVATE_SOURCE_SCOPES);
  }
  return Array.from(new Set(scopes));
}

function deriveAllowedSurfacePermissions(
  input: DeriveWorkIntakeActorContextInput,
): string[] {
  if (input.allowedSurfacePermissions && input.allowedSurfacePermissions.length > 0) {
    return normalizeUnique(input.allowedSurfacePermissions);
  }

  const permissions: string[] = [...BASE_ALLOWED_SURFACE_PERMISSIONS];
  if (input.actorRole === "admin" || input.actorRole === "domain_admin") {
    permissions.push(...ADMIN_ONLY_SURFACE_PERMISSIONS);
  }
  return normalizeUnique(permissions);
}

export function deriveWorkIntakeActorContext(
  input: DeriveWorkIntakeActorContextInput,
): WorkIntakeActorContext {
  const previewAccess = resolvePreflightPreviewAccess({
    actorUserId: input.actorUserId ?? null,
    actorRole: input.actorRole ?? null,
    requesterId: input.requesterUserId ?? null,
  });

  return {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    requesterUserId: input.requesterUserId ?? null,
    roles: input.actorRole ? [input.actorRole] : [],
    domainId: input.domainId ?? null,
    privateVaultUnlocked: Boolean(input.privateVaultUnlocked),
    allowedSourceScopes: deriveAllowedSourceScopes(input),
    allowedSurfacePermissions: deriveAllowedSurfacePermissions(input),
    previewAccessLevel: previewAccess.view ?? "requester_safe",
  };
}
