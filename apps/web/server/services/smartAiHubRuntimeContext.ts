import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  appIdentities,
  canonicalProjectAppBindings,
  canonicalProjectMemberships,
  canonicalProjects,
  conversations,
  tenants,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { resolveAppRouteForTenant } from "./appIdentityRepository";
import {
  CANONICAL_PROJECT_CONTEXT_POLICY_VERSION,
  resolveCanonicalProjectContext,
  type CanonicalProjectContextState,
} from "./canonicalProjectContextResolver";

export const SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION = "spec269-app-project-memory.phase1.v1" as const;
export const PROJECT_RESOLUTION_RECEIPT_VERSION = "spec302-invocation-receipt.phase1.v1" as const;

export interface TrustedAppRuntimeContext {
  version: "spec304-trusted-host-app-context.v1";
  tenantId: string;
  hostAppId: string;
  publicAppId: string;
  routeProvenance: "verified_custom_domain_alias";
  permissionCeiling: {
    projectMemoryRead: "authorized_bound_project_only";
    durableProjectMemoryWrite: false;
  };
  policyVersion: typeof SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION;
}

export type ProjectResolutionReceipt = Readonly<{
  version: typeof PROJECT_RESOLUTION_RECEIPT_VERSION;
  receiptId: string;
  tenantId: string;
  principalId: string;
  appId: string | null;
  canonicalProjectId: string | null;
  sessionId: string | null;
  conversationId: string | null;
  resolutionState: CanonicalProjectContextState;
  resolutionPolicyVersion: typeof CANONICAL_PROJECT_CONTEXT_POLICY_VERSION;
  policyVersion: typeof SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION;
  provenance: string;
  authorizationResult: "ALLOW_READ" | "DENY" | "NOT_REQUIRED";
  authorizationReference: string;
  correlationId: string;
  issuedAt: string;
}>;

export type ProjectReceiptValidation =
  | { authorized: true; canonicalProjectId: string }
  | { authorized: false; reason: "INVALID_RECEIPT" | "SCOPE_MISMATCH" | "REVOKED_OR_UNBOUND" | "DURABLE_WRITE_RECEIPT_REQUIRED" };

const issuedReceipts = new WeakSet<object>();
const RESOLVED_STATES = new Set<CanonicalProjectContextState>([
  "RESOLVED_EXPLICIT",
  "RESOLVED_CONTEXTUAL",
  "RESOLVED_INFERRED",
]);

function hasPhaseOneReadCeiling(
  context: TrustedAppRuntimeContext | null,
  tenantId: string,
): context is TrustedAppRuntimeContext {
  return Boolean(
    context &&
    context.version === "spec304-trusted-host-app-context.v1" &&
    context.tenantId === tenantId &&
    context.routeProvenance === "verified_custom_domain_alias" &&
    context.policyVersion === SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION &&
    context.permissionCeiling.projectMemoryRead === "authorized_bound_project_only" &&
    context.permissionCeiling.durableProjectMemoryWrite === false
  );
}

/** Resolve only a verified App route alias under the server-established tenant. */
export async function resolveTrustedHostAppContext(input: {
  tenantId: string | null | undefined;
  host: string | null | undefined;
}): Promise<TrustedAppRuntimeContext | null> {
  if (!input.tenantId || !input.host) return null;
  const host = input.host.trim().toLowerCase().replace(/:\d+$/, "");
  if (!host) return null;
  try {
    const app = await resolveAppRouteForTenant({
      tenantId: input.tenantId,
      kind: "custom-domain",
      value: host,
    });
    if (!app || app.tenantId !== input.tenantId) return null;
    return Object.freeze({
      version: "spec304-trusted-host-app-context.v1",
      tenantId: app.tenantId,
      hostAppId: app.appId,
      publicAppId: app.publicAppId,
      routeProvenance: "verified_custom_domain_alias",
      permissionCeiling: Object.freeze({
        projectMemoryRead: "authorized_bound_project_only",
        durableProjectMemoryWrite: false,
      }),
      policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
    });
  } catch {
    return null;
  }
}

export interface IssueProjectResolutionReceiptInput {
  tenantId: string;
  userId: number;
  appContext: TrustedAppRuntimeContext | null;
  correlationId?: string;
  sessionId?: string | null;
  conversationId?: number | string | null;
  /** For an explicit selection, this is a candidate only and is never authority. */
  selectedProjectId?: string | null;
}

async function readConversationProject(input: Pick<IssueProjectResolutionReceiptInput, "tenantId" | "userId" | "conversationId">): Promise<{ found: boolean; projectId: string | null }> {
  if (input.conversationId === undefined || input.conversationId === null) return { found: false, projectId: null };
  const conversationId = Number(input.conversationId);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) return { found: false, projectId: null };
  const db = await getDb();
  if (!db) return { found: false, projectId: null };
  const [row] = await db
    .select({ projectId: conversations.projectId })
    .from(conversations)
    .where(and(
      eq(conversations.id, conversationId),
      eq(conversations.userId, input.userId),
      eq(conversations.tenantId, input.tenantId),
    ))
    .limit(1);
  return row ? { found: true, projectId: row.projectId ?? null } : { found: false, projectId: null };
}

async function hasCurrentProjectReadAuthority(input: {
  tenantId: string;
  principalId: string;
  userId: number;
  appId: string;
  projectId: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db
    .select({
      projectId: canonicalProjects.projectId,
      projectTenantId: canonicalProjects.tenantId,
      projectLifecycle: canonicalProjects.lifecycle,
      membershipPrincipalId: canonicalProjectMemberships.principalId,
      membershipRole: canonicalProjectMemberships.role,
      membershipLifecycle: canonicalProjectMemberships.lifecycle,
      appTenantId: appIdentities.tenantId,
      appLifecycle: appIdentities.lifecycle,
      bindingLifecycle: canonicalProjectAppBindings.lifecycle,
      userTenantId: users.currentTenantId,
      userDisabled: users.isDisabled,
      tenantActive: tenants.isActive,
    })
    .from(canonicalProjects)
    .innerJoin(tenants, eq(tenants.id, input.tenantId))
    .leftJoin(users, eq(users.id, input.userId))
    .leftJoin(appIdentities, and(
      eq(appIdentities.tenantId, input.tenantId),
      eq(appIdentities.appId, input.appId),
    ))
    .leftJoin(canonicalProjectMemberships, and(
      eq(canonicalProjectMemberships.tenantId, input.tenantId),
      eq(canonicalProjectMemberships.projectId, input.projectId),
      eq(canonicalProjectMemberships.principalId, input.principalId),
    ))
    .leftJoin(canonicalProjectAppBindings, and(
      eq(canonicalProjectAppBindings.tenantId, input.tenantId),
      eq(canonicalProjectAppBindings.projectId, input.projectId),
      eq(canonicalProjectAppBindings.appId, input.appId),
    ))
    .where(eq(canonicalProjects.projectId, input.projectId))
    .limit(1);

  return Boolean(
    row &&
    row.projectId === input.projectId &&
    row.projectTenantId === input.tenantId &&
    row.projectLifecycle === "ACTIVE" &&
    row.membershipPrincipalId === input.principalId &&
    row.membershipLifecycle === "ACTIVE" &&
    (row.membershipRole === "owner" || row.membershipRole === "editor" || row.membershipRole === "viewer") &&
    row.appTenantId === input.tenantId &&
    row.appLifecycle === "active" &&
    row.bindingLifecycle === "ACTIVE" &&
    String(row.userTenantId ?? "") === input.tenantId &&
    row.userDisabled !== true &&
    row.tenantActive === true,
  );
}

/**
 * Issue server-local evidence for one invocation. The advisory resolver chooses
 * state/provenance; only the canonical DB ACL query grants the read ceiling.
 * This object is deliberately not durable and cannot authorize a project write.
 */
export async function issueProjectResolutionReceipt(
  input: IssueProjectResolutionReceiptInput,
): Promise<ProjectResolutionReceipt> {
  const principalId = `user:${input.userId}`;
  const conversationId = input.conversationId == null ? null : String(input.conversationId);
  const appContext = input.appContext;
  const selectedProjectId = input.selectedProjectId?.trim() || null;
  let projectId: string | null = null;
  let provenance = "no_project_binding";
  let resolutionState: CanonicalProjectContextState = "NO_PROJECT";

  try {
    if (conversationId !== null) {
      const conversationBinding = await readConversationProject(input);
      provenance = "server_conversation_segment_binding";
      if (conversationBinding.found) {
        projectId = conversationBinding.projectId;
        if (!projectId) resolutionState = "NO_PROJECT";
      } else {
        provenance = "conversation_binding_unresolved";
        resolutionState = "UNRESOLVED";
      }
    } else if (selectedProjectId) {
      projectId = selectedProjectId;
      provenance = "explicit_user_selection_candidate";
    }

    if (projectId) {
      const context = {
        tenantId: input.tenantId,
        principalId,
        ...(appContext ? { appId: appContext.hostAppId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(conversationId ? { conversationId } : {}),
      };
      const resolution = resolveCanonicalProjectContext({
        context,
        bindings: conversationId
          ? [{
              source: "conversation_segment_binding",
              tenantId: input.tenantId,
              principalId,
              ...(appContext ? { appId: appContext.hostAppId } : {}),
              conversationId,
              canonicalProjectId: projectId,
            }]
          : [{
              source: "explicit_user_selection",
              tenantId: input.tenantId,
              principalId,
              ...(appContext ? { appId: appContext.hostAppId } : {}),
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              canonicalProjectId: projectId,
            }],
      });
      resolutionState = resolution.state;
      if (RESOLVED_STATES.has(resolution.state)) projectId = resolution.canonicalProjectId ?? null;
      else projectId = null;
    }
  } catch {
    projectId = null;
    resolutionState = "UNRESOLVED";
    provenance = "resolution_or_authority_lookup_failed";
  }

  const correlationId = input.correlationId?.trim() || randomUUID();
  let authorizationResult: ProjectResolutionReceipt["authorizationResult"] = "NOT_REQUIRED";
  if (projectId) {
    authorizationResult = "DENY";
    if (
      hasPhaseOneReadCeiling(appContext, input.tenantId)
    ) {
      try {
        if (await hasCurrentProjectReadAuthority({
          tenantId: input.tenantId,
          principalId,
          userId: input.userId,
          appId: appContext.hostAppId,
          projectId,
        })) authorizationResult = "ALLOW_READ";
      } catch {
        authorizationResult = "DENY";
      }
    }
  }

  const receipt = Object.freeze({
    version: PROJECT_RESOLUTION_RECEIPT_VERSION,
    receiptId: randomUUID(),
    tenantId: input.tenantId,
    principalId,
    appId: appContext?.hostAppId ?? null,
    canonicalProjectId: projectId,
    sessionId: input.sessionId ?? null,
    conversationId,
    resolutionState,
    resolutionPolicyVersion: CANONICAL_PROJECT_CONTEXT_POLICY_VERSION,
    policyVersion: SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION,
    provenance,
    authorizationResult,
    authorizationReference: `${correlationId}:current-project-acl-check`,
    correlationId,
    issuedAt: new Date().toISOString(),
  }) satisfies ProjectResolutionReceipt;
  issuedReceipts.add(receipt);
  return receipt;
}

/** Re-read project, App binding, and membership immediately before each read. */
export async function validateProjectResolutionReceipt(input: {
  receipt: ProjectResolutionReceipt;
  operation: "read" | "write";
  tenantId: string;
  userId: number;
  appId: string | null;
  sessionId?: string | null;
  conversationId?: number | string | null;
}): Promise<ProjectReceiptValidation> {
  const { receipt } = input;
  if (!issuedReceipts.has(receipt)) return { authorized: false, reason: "INVALID_RECEIPT" };
  if (input.operation === "write") {
    return { authorized: false, reason: "DURABLE_WRITE_RECEIPT_REQUIRED" };
  }
  if (
    receipt.tenantId !== input.tenantId ||
    receipt.principalId !== `user:${input.userId}` ||
    receipt.appId !== input.appId ||
    receipt.version !== PROJECT_RESOLUTION_RECEIPT_VERSION ||
    receipt.policyVersion !== SMARTAIHUB_RUNTIME_CONTEXT_POLICY_VERSION ||
    (input.sessionId !== undefined && (receipt.sessionId ?? null) !== (input.sessionId ?? null)) ||
    (input.conversationId !== undefined && (receipt.conversationId ?? null) !== (input.conversationId == null ? null : String(input.conversationId)))
  ) return { authorized: false, reason: "SCOPE_MISMATCH" };
  if (
    receipt.authorizationResult !== "ALLOW_READ" ||
    !receipt.canonicalProjectId ||
    !RESOLVED_STATES.has(receipt.resolutionState) ||
    !input.appId
  ) return { authorized: false, reason: "REVOKED_OR_UNBOUND" };

  try {
    if (receipt.conversationId !== null) {
      const currentConversationBinding = await readConversationProject({
        tenantId: input.tenantId,
        userId: input.userId,
        conversationId: receipt.conversationId,
      });
      if (!currentConversationBinding.found || currentConversationBinding.projectId !== receipt.canonicalProjectId) {
        return { authorized: false, reason: "REVOKED_OR_UNBOUND" };
      }
    }
    const authorized = await hasCurrentProjectReadAuthority({
      tenantId: input.tenantId,
      principalId: `user:${input.userId}`,
      userId: input.userId,
      appId: input.appId,
      projectId: receipt.canonicalProjectId,
    });
    return authorized
      ? { authorized: true, canonicalProjectId: receipt.canonicalProjectId }
      : { authorized: false, reason: "REVOKED_OR_UNBOUND" };
  } catch {
    return { authorized: false, reason: "REVOKED_OR_UNBOUND" };
  }
}
