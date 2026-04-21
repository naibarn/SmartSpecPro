import type { PreflightPreviewView } from "../../shared/workOrchestrator";

export interface ResolvePreflightPreviewAccessInput {
  actorUserId?: number | null;
  actorRole?: string | null;
  requesterId?: string | null;
}

export interface PreflightPreviewAccessDecision {
  allowed: boolean;
  view: PreflightPreviewView | null;
  reasonCode: "admin_diagnostic" | "requester_safe" | "not_requester_or_admin" | "missing_actor";
  redacted: boolean;
}

export function isPreflightAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "domain_admin";
}

export function resolvePreflightPreviewAccess(
  input: ResolvePreflightPreviewAccessInput,
): PreflightPreviewAccessDecision {
  if (!input.actorUserId) {
    return {
      allowed: false,
      view: null,
      reasonCode: "missing_actor",
      redacted: true,
    };
  }
  if (isPreflightAdminRole(input.actorRole)) {
    return {
      allowed: true,
      view: "admin_diagnostic",
      reasonCode: "admin_diagnostic",
      redacted: false,
    };
  }
  if (input.requesterId && input.requesterId === String(input.actorUserId)) {
    return {
      allowed: true,
      view: "requester_safe",
      reasonCode: "requester_safe",
      redacted: true,
    };
  }
  return {
    allowed: false,
    view: null,
    reasonCode: "not_requester_or_admin",
    redacted: true,
  };
}

export function redactPreflightDiagnostics<T extends Record<string, unknown>>(
  diagnostics: T,
  access: Pick<PreflightPreviewAccessDecision, "view" | "redacted">,
): Record<string, unknown> {
  if (access.view === "admin_diagnostic" && !access.redacted) {
    return diagnostics;
  }
  return {
    redacted: true,
    visibleReasonCodes: Array.isArray(diagnostics.visibleReasonCodes)
      ? diagnostics.visibleReasonCodes
      : [],
  };
}
