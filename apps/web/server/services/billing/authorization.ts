import { TRPCError } from "@trpc/server";
import { resolveTenantIdVarchar } from "../tenantContext";

export type BillingAction =
  | "view_invoice"
  | "download_invoice_document"
  | "edit_billing_profile"
  | "view_payment_method"
  | "manage_payment_method"
  | "set_default_payment_method"
  | "enable_auto_renew"
  | "disable_auto_renew"
  | "revoke_payment_method"
  | "manage_renewal_attempt"
  | "edit_seller_profile"
  | "edit_tax_and_numbering"
  | "sync_invoice_header"
  | "replace_paid_invoice"
  | "cancel_invoice"
  | "reopen_invoice"
  | "cancel_stale_payment_attempt"
  | "regenerate_payment_attempt"
  | "apply_missing_credits"
  | "apply_missing_subscription_renewal"
  | "manual_mark_paid"
  | "reverse_wrong_downgrade"
  | "view_decline_metadata"
  | "view_raw_provider_payload"
  | "view_recovery_evidence"
  | "create_support_recovery_case"
  | "request_reconciliation";

export interface BillingActor {
  id: number | null;
  role?: string | null;
  currentTenantId?: unknown;
  registeredDomain?: string | null;
}

export interface BillingTarget {
  ownerUserId?: number | null;
  tenantId?: unknown;
  tenantPrimaryDomain?: string | null;
}

export interface BillingAuthorizationDecision {
  allowed: boolean;
  reason:
    | "privileged_role"
    | "owner_scope"
    | "tenant_scope"
    | "anonymous"
    | "insufficient_role"
    | "owner_mismatch"
    | "tenant_mismatch";
}

const PRIVILEGED_ROLES = new Set(["super_admin", "admin", "system_agent"]);
const USER_SELF_ACTIONS = new Set<BillingAction>([
  "view_invoice",
  "download_invoice_document",
  "edit_billing_profile",
  "view_payment_method",
  "manage_payment_method",
  "set_default_payment_method",
  "enable_auto_renew",
  "disable_auto_renew",
]);
const TENANT_VIEW_ACTIONS = new Set<BillingAction>([
  "view_invoice",
  "download_invoice_document",
  "view_payment_method",
  "create_support_recovery_case",
  "request_reconciliation",
]);
const TENANT_SUPPORT_ACTIONS = new Set<BillingAction>([
  ...TENANT_VIEW_ACTIONS,
]);
const TENANT_BILLING_ADMIN_ACTIONS = new Set<BillingAction>([
  ...TENANT_VIEW_ACTIONS,
  "edit_seller_profile",
  "sync_invoice_header",
  "replace_paid_invoice",
  "reverse_wrong_downgrade",
  "manage_renewal_attempt",
]);
const TENANT_FINANCE_ACTIONS = new Set<BillingAction>([
  ...TENANT_SUPPORT_ACTIONS,
  "revoke_payment_method",
  "manage_renewal_attempt",
  "edit_tax_and_numbering",
  "manual_mark_paid",
  "cancel_invoice",
  "reopen_invoice",
  "cancel_stale_payment_attempt",
  "regenerate_payment_attempt",
  "apply_missing_credits",
  "apply_missing_subscription_renewal",
  "view_decline_metadata",
  "view_raw_provider_payload",
  "view_recovery_evidence",
]);
const TENANT_SCOPED_ROLES = new Set([
  "domain_admin",
  "support_admin",
  "billing_admin",
  "finance_admin",
]);

function isPrivilegedRole(role: string | null | undefined): boolean {
  return role != null && PRIVILEGED_ROLES.has(role);
}

function isTenantScopedDomainAdmin(actor: BillingActor, target: BillingTarget): boolean {
  if (!actor.role || !TENANT_SCOPED_ROLES.has(actor.role)) {
    return false;
  }

  const actorTenantId = resolveTenantIdVarchar(null, actor.currentTenantId);
  const targetTenantId = resolveTenantIdVarchar(target.tenantId, null);
  if (actorTenantId && targetTenantId && actorTenantId === targetTenantId) {
    return true;
  }

  return Boolean(
    actor.registeredDomain &&
      target.tenantPrimaryDomain &&
      actor.registeredDomain === target.tenantPrimaryDomain,
  );
}

export function authorizeBillingAction(
  actor: BillingActor,
  action: BillingAction,
  target: BillingTarget = {},
): BillingAuthorizationDecision {
  if (!actor.id) {
    return { allowed: false, reason: "anonymous" };
  }

  if (isPrivilegedRole(actor.role)) {
    return { allowed: true, reason: "privileged_role" };
  }

  if (USER_SELF_ACTIONS.has(action) && target.ownerUserId === actor.id) {
    return { allowed: true, reason: "owner_scope" };
  }

  if (isTenantScopedDomainAdmin(actor, target)) {
    if (actor.role === "domain_admin" && TENANT_VIEW_ACTIONS.has(action)) {
      return { allowed: true, reason: "tenant_scope" };
    }
    if (actor.role === "support_admin" && TENANT_SUPPORT_ACTIONS.has(action)) {
      return { allowed: true, reason: "tenant_scope" };
    }
    if (actor.role === "billing_admin" && TENANT_BILLING_ADMIN_ACTIONS.has(action)) {
      return { allowed: true, reason: "tenant_scope" };
    }
    if (actor.role === "finance_admin" && TENANT_FINANCE_ACTIONS.has(action)) {
      return { allowed: true, reason: "tenant_scope" };
    }
  }

  if (
    TENANT_VIEW_ACTIONS.has(action)
    || TENANT_SUPPORT_ACTIONS.has(action)
    || TENANT_BILLING_ADMIN_ACTIONS.has(action)
    || TENANT_FINANCE_ACTIONS.has(action)
  ) {
    if (actor.role && TENANT_SCOPED_ROLES.has(actor.role)) {
      return { allowed: false, reason: "tenant_mismatch" };
    }
  }

  if (USER_SELF_ACTIONS.has(action)) {
    return { allowed: false, reason: "owner_mismatch" };
  }

  if (
    TENANT_VIEW_ACTIONS.has(action)
    || TENANT_SUPPORT_ACTIONS.has(action)
    || TENANT_BILLING_ADMIN_ACTIONS.has(action)
    || TENANT_FINANCE_ACTIONS.has(action)
  ) {
    return { allowed: false, reason: "tenant_mismatch" };
  }

  return { allowed: false, reason: "insufficient_role" };
}

export function assertBillingActionAuthorized(
  actor: BillingActor,
  action: BillingAction,
  target: BillingTarget = {},
): void {
  const decision = authorizeBillingAction(actor, action, target);
  if (decision.allowed) {
    return;
  }

  throw new TRPCError({
    code: actor.id ? "FORBIDDEN" : "UNAUTHORIZED",
    message: `Not authorized for billing action: ${action}`,
  });
}
