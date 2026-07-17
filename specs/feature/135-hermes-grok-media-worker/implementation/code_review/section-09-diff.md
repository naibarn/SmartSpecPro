diff --git a/apps/web/client/src/lib/storyboardReviewWorkspace.ts b/apps/web/client/src/lib/storyboardReviewWorkspace.ts
index e81545696..d2a881056 100644
--- a/apps/web/client/src/lib/storyboardReviewWorkspace.ts
+++ b/apps/web/client/src/lib/storyboardReviewWorkspace.ts
@@ -571,7 +571,20 @@ export function normalizeStoryboardTransportMetadata(
     };
   }
   const record = value as Record<string, unknown>;
-  const transport = record.transport === "mcp" ? "mcp" : "gateway_api";
+  // Feature 135 — Hermes Grok media worker (section 09 carry-forward from
+  // section-08 review): this normalizer previously narrowed `transport` to
+  // only "mcp" | "gateway_api" and `creditPolicy` to only
+  // "provider_credits_tracked" | "smartspec_credits" — silently corrupting
+  // a genuine "hermes_worker" transport / "provider_account" credit policy
+  // value down to the gateway defaults. Now that media.ts's async
+  // procedures (which storyboard review consumes) have a hermes arm
+  // (section 09), this narrowing must preserve those values explicitly.
+  const transport =
+    record.transport === "mcp"
+      ? "mcp"
+      : record.transport === "hermes_worker"
+        ? "hermes_worker"
+        : "gateway_api";
   return {
     transport,
     originSurface: record.originSurface === "storyboard_review" ? "storyboard_review" : "storyboard_review",
@@ -582,7 +595,12 @@ export function normalizeStoryboardTransportMetadata(
     shareId: typeof record.shareId === "string" ? record.shareId : undefined,
     sharedGroupId: typeof record.sharedGroupId === "number" ? record.sharedGroupId : undefined,
     connectionScope: record.connectionScope === "shared" ? "shared" : record.connectionScope === "personal" ? "personal" : undefined,
-    creditPolicy: record.creditPolicy === "provider_credits_tracked" ? "provider_credits_tracked" : "smartspec_credits",
+    creditPolicy:
+      record.creditPolicy === "provider_credits_tracked"
+        ? "provider_credits_tracked"
+        : record.creditPolicy === "provider_account"
+          ? "provider_account"
+          : "smartspec_credits",
     providerModelId: typeof record.providerModelId === "string" ? record.providerModelId : undefined,
     toolName: typeof record.toolName === "string" ? record.toolName : undefined,
     argumentShape: typeof record.argumentShape === "string" ? record.argumentShape : undefined,
diff --git a/apps/web/server/routers/media.ts b/apps/web/server/routers/media.ts
index c1c5fff40..f7863ded9 100644
--- a/apps/web/server/routers/media.ts
+++ b/apps/web/server/routers/media.ts
@@ -135,10 +135,13 @@ const creditOriginSurfaceSchema = z.enum([
   "marketplace_capture",
   "storyboard_review",
 ]).optional();
-const mediaTransportSchema = z.enum(["gateway_api", "mcp"]).optional();
+// Feature 135 — Hermes Grok media worker (section 09): three-way transport
+// enum. Additive widening — existing "gateway_api"/"mcp" values and every
+// existing test fixture are unaffected.
+const mediaTransportSchema = z.enum(["gateway_api", "mcp", "hermes_worker"]).optional();
 
 function assertMcpFieldsOnlyWithMcpTransport(input: {
-  transport?: "gateway_api" | "mcp";
+  transport?: "gateway_api" | "mcp" | "hermes_worker";
   mcpConnectionId?: string;
   sharedGroupId?: number;
   mcpApprovalId?: string;
@@ -164,6 +167,26 @@ function assertMcpFieldsOnlyWithMcpTransport(input: {
   }
 }
 
+/**
+ * Feature 135 — Hermes Grok media worker (section 09): mirrors
+ * `assertMcpFieldsOnlyWithMcpTransport` for the new `hermesConnectionId`
+ * field — a hermesConnectionId supplied for a non-hermes RESOLVED transport
+ * (the model's own transport, not just the raw `input.transport` value) is
+ * rejected, mirroring `mediaTransportResolver.ts`'s
+ * "hermesConnectionId requires transport=hermes_worker" rule.
+ */
+function assertHermesConnectionIdMatchesResolvedTransport(input: {
+  hermesConnectionId?: string;
+  resolvedIsHermes: boolean;
+}) {
+  if (input.hermesConnectionId && !input.resolvedIsHermes) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "hermesConnectionId requires transport=hermes_worker",
+    });
+  }
+}
+
 function compactText(value: unknown): string {
   return typeof value === "string" ? value.trim() : "";
 }
@@ -2926,6 +2949,10 @@ export const mediaRouter = router({
         mcpProviderModelId: z.string().max(256).optional(),
         mcpToolName: z.string().max(128).optional(),
         mcpArgumentShape: z.string().max(128).optional(),
+        // Feature 135 — Hermes Grok media worker (section 09). Required
+        // only when the resolved transport is `hermes_worker` and the
+        // caller has no default Hermes connection for this asset type.
+        hermesConnectionId: z.string().max(64).optional(),
         idempotencyKey: z.string().max(128).optional(),
       })
     )
@@ -2986,6 +3013,87 @@ export const mediaRouter = router({
         modelId: model,
         configJson: dbModel.configJson,
       });
+      // Feature 135 — Hermes Grok media worker (section 09): three-way
+      // branch, computed BEFORE the MCP block so a hermes-transport model
+      // (or an explicit `transport: "hermes_worker"`) never falls through
+      // to the MCP/gateway paths below.
+      const shouldUseHermesTransport =
+        modelTransport.transport === "hermes_worker" || input.transport === "hermes_worker";
+      assertHermesConnectionIdMatchesResolvedTransport({
+        hermesConnectionId: input.hermesConnectionId,
+        resolvedIsHermes: shouldUseHermesTransport,
+      });
+
+      if (shouldUseHermesTransport) {
+        const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+        if (!tenantId) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for Hermes media generation" });
+        }
+        const { resolveVdCharacterMediaTransportDecision } = await import("./verticalDramaCharacters");
+        const transportDecision = await resolveVdCharacterMediaTransportDecision({
+          tenantId,
+          actorUserId: ctx.user.id,
+          assetType: "image",
+          modelId: model,
+          configJson: (dbModel.configJson as Record<string, unknown> | null) ?? null,
+          hermesConnectionId: input.hermesConnectionId,
+        });
+        if (transportDecision.kind !== "hermes") {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
+        }
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesReferenceAssetIdFromUrl,
+        } = await import("../services/hermesMediaReferences");
+        const resolvedRefIds = await Promise.all(
+          (input.referenceImageUrls ?? []).map(url =>
+            resolveHermesReferenceAssetIdFromUrl({ tenantId, userId: ctx.user.id, url }),
+          ),
+        );
+        const unresolvedIndex = resolvedRefIds.findIndex(assetId => !assetId);
+        if (unresolvedIndex !== -1) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: "Hermes media generation requires library-backed reference images; raw external URLs are not supported.",
+          });
+        }
+        const orderedRefs = resolvedRefIds.map((assetId, idx) => ({
+          assetId: assetId as string,
+          role: "reference",
+          label: `Image-${idx + 1}`,
+        }));
+        const references = await buildHermesMediaReferences({ tenantId, userId: ctx.user.id, orderedRefs });
+        const hermesProviderModelId =
+          modelTransport.transport === "hermes_worker" ? modelTransport.providerModelId ?? model : model;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: input.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+            outputCount: input.numImages ?? 1,
+          },
+          references,
+          traceId: crypto.randomUUID(),
+          tenantId,
+          requestedByUserId: ctx.user.id,
+          idempotencyKey: input.idempotencyKey,
+        });
+        return buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId: ctx.user.id,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: input.prompt,
+          extraParams: input.extraParams,
+        });
+      }
+
       const shouldUseMcpTransport = modelTransport.transport === "mcp" || input.transport === "mcp";
 
       if (shouldUseMcpTransport) {
@@ -3183,6 +3291,10 @@ export const mediaRouter = router({
         mcpProviderModelId: z.string().max(256).optional(),
         mcpToolName: z.string().max(128).optional(),
         mcpArgumentShape: z.string().max(128).optional(),
+        // Feature 135 — Hermes Grok media worker (section 09). Required
+        // only when the resolved transport is `hermes_worker` and the
+        // caller has no default Hermes connection for this asset type.
+        hermesConnectionId: z.string().max(64).optional(),
         idempotencyKey: z.string().max(128).optional(),
       })
     )
@@ -3264,6 +3376,91 @@ export const mediaRouter = router({
         modelId: model,
         configJson: dbModel.configJson,
       });
+      // Feature 135 — Hermes Grok media worker (section 09): three-way
+      // branch — see `generateImageAsync`'s identical block for the full
+      // rationale.
+      const shouldUseHermesTransport =
+        modelTransport.transport === "hermes_worker" || input.transport === "hermes_worker";
+      assertHermesConnectionIdMatchesResolvedTransport({
+        hermesConnectionId: input.hermesConnectionId,
+        resolvedIsHermes: shouldUseHermesTransport,
+      });
+
+      if (shouldUseHermesTransport) {
+        const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
+        if (!tenantId) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for Hermes media generation" });
+        }
+        const { resolveVdCharacterMediaTransportDecision } = await import("./verticalDramaCharacters");
+        const transportDecision = await resolveVdCharacterMediaTransportDecision({
+          tenantId,
+          actorUserId: ctx.user.id,
+          assetType: "video",
+          modelId: model,
+          configJson: (dbModel.configJson as Record<string, unknown> | null) ?? null,
+          hermesConnectionId: input.hermesConnectionId,
+        });
+        if (transportDecision.kind !== "hermes") {
+          throw new TRPCError({ code: "BAD_REQUEST", message: "hermesConnectionId requires transport=hermes_worker" });
+        }
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesReferenceAssetIdFromUrl,
+        } = await import("../services/hermesMediaReferences");
+        const combinedReferenceUrls = [
+          ...(input.referenceImageUrls ?? []),
+          ...(input.referenceVideoUrl ? [input.referenceVideoUrl] : []),
+          ...(input.referenceVideoUrls ?? []),
+        ];
+        const resolvedRefIds = await Promise.all(
+          combinedReferenceUrls.map(url =>
+            resolveHermesReferenceAssetIdFromUrl({ tenantId, userId: ctx.user.id, url }),
+          ),
+        );
+        const unresolvedIndex = resolvedRefIds.findIndex(assetId => !assetId);
+        if (unresolvedIndex !== -1) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: "Hermes media generation requires library-backed reference images; raw external URLs are not supported.",
+          });
+        }
+        const orderedRefs = resolvedRefIds.map((assetId, idx) => ({
+          assetId: assetId as string,
+          role: idx === 0 ? "start_frame" : "reference",
+          label: `Image-${idx + 1}`,
+        }));
+        const references = await buildHermesMediaReferences({ tenantId, userId: ctx.user.id, orderedRefs });
+        const hermesProviderModelId =
+          modelTransport.transport === "hermes_worker" ? modelTransport.providerModelId ?? model : model;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "video.image_to_video" : "video.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: input.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+            durationSeconds: duration,
+          },
+          references,
+          traceId: crypto.randomUUID(),
+          tenantId,
+          requestedByUserId: ctx.user.id,
+          idempotencyKey: input.idempotencyKey,
+        });
+        return buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId: ctx.user.id,
+          mediaType: "video",
+          model: hermesProviderModelId,
+          prompt: input.prompt,
+          extraParams: normalizedExtraParams,
+        });
+      }
+
       const shouldUseMcpTransport = modelTransport.transport === "mcp" || input.transport === "mcp";
 
       if (shouldUseMcpTransport) {
diff --git a/apps/web/server/routers/verticalDramaCharacters.ts b/apps/web/server/routers/verticalDramaCharacters.ts
index 72433a18d..7d9a9b396 100644
--- a/apps/web/server/routers/verticalDramaCharacters.ts
+++ b/apps/web/server/routers/verticalDramaCharacters.ts
@@ -39,8 +39,13 @@ import {
 import {
   verticalDramaCharacterStockService,
   VerticalDramaCharacterStockError,
+  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
 } from "../services/verticalDramaCharacterStock";
-import { VERTICAL_DRAMA_CHARACTER_ASSET_STATES } from "@shared/verticalDramaSeries/characterAssets";
+import { isCharacterLockPolicyFailureMessage } from "@shared/verticalDramaSeries/characterLock";
+import {
+  VERTICAL_DRAMA_CHARACTER_ASSET_STATES,
+  type VdCharacterNeedsSetupReason,
+} from "@shared/verticalDramaSeries/characterAssets";
 import { readTargetAudienceRegionFromBible } from "@shared/verticalDramaSeries/targetAudienceRegion";
 import { mediaGenerationService, DEFAULT_MODELS } from "../services/mediaGenerationService";
 import { calculateCreditCost } from "../services/pricingCalculator";
@@ -48,6 +53,7 @@ import { hasEnoughCredits, deductCredits, refundCredits } from "../services/cred
 import { signBearerToken } from "../_core/tokens";
 import {
   generateCharacterVisualPrompts,
+  generateCharacterPortraitCandidates,
   InsufficientCreditsError,
   VdSchemaValidationError,
   readPresetVisualIdentityFromBible,
@@ -60,7 +66,10 @@ import { resolveMediaTransport } from "../services/mediaTransportResolver";
 import { normalizeMcpProviderModelIdForProvider } from "../services/mcpProviderModelAliases";
 import { resolveMcpRouteFromModelId, defaultMcpArgumentShape } from "../services/mcpModelRouteResolver";
 import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
-import { getModelsByTypeAsync } from "../services/modelRegistry";
+// Feature 135 — Hermes Grok media worker (section 09). Pure string helper
+// only (no DB import) — see this file's `resolveVdCharacterMediaTransportDecision`.
+import { formatHermesErrorMessage } from "../../shared/hermesMedia";
+import { getModelsByTypeAsync, isDbModelCatalogLoaded } from "../services/modelRegistry";
 import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
 import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
 import { verticalDramaApprovedCharacterDesignSnapshotSchema } from "@shared/verticalDramaSeries/characterProfile";
@@ -87,6 +96,17 @@ import {
   type VerticalDramaCharacterVoiceConfig,
   type VerticalDramaVoiceCatalogEntry,
 } from "@shared/verticalDramaSeries/voiceCasting";
+import {
+  narrativeRoleSchema,
+  roleProvenanceSchema,
+  roleReviewStatusSchema,
+  roleTierSchema,
+  roleVisualIntentSchema,
+  type NarrativeRole,
+  type RoleTier,
+  type RoleVisualIntent,
+  type RoleReviewStatus,
+} from "@shared/verticalDramaSeries/narrativeRole";
 // F5 manual variant/twin CRUD
 // (`planning/vertical-drama-twin-variant-completeness/plan.md` W2) — TYPE-ONLY
 // imports only (erased at compile time, no runtime module load) so this
@@ -331,6 +351,12 @@ function mapStockError(err: unknown): never {
       case "media_asset_deleted":
         throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
       case "illegal_state_transition":
+      case "candidate_batch_not_found":
+      case "candidate_batch_expired":
+      case "candidate_batch_claimed":
+      case "candidate_not_ready":
+      case "manual_primary_exists":
+      case "candidate_integrity_error":
         throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
       default:
         throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
@@ -418,6 +444,22 @@ function getCharacterPortraitUserToken(ctx: { userToken: string | null; user: {
   return ctx.userToken || createCharacterPortraitMediaToken(ctx.user.id);
 }
 
+function readMediaTaskInternalParameter(
+  parameters: Record<string, unknown> | undefined,
+  key: string,
+): string | undefined {
+  if (!parameters) return undefined;
+  const direct = parameters[key];
+  if (typeof direct === "string") return direct;
+  for (const containerKey of ["extraParams", "extra_params"] as const) {
+    const container = parameters[containerKey];
+    if (!container || typeof container !== "object" || Array.isArray(container)) continue;
+    const value = (container as Record<string, unknown>)[key];
+    if (typeof value === "string") return value;
+  }
+  return undefined;
+}
+
 /**
  * Resolve MCP transport metadata for a character-portrait/turnaround/sheet
  * generation call when the caller-selected image model is MCP-transport
@@ -438,6 +480,7 @@ export async function resolveVdCharacterMcpTransportMetadata(params: {
   modelId: string;
   configJson: Record<string, unknown> | null;
   mcpConnectionId?: string;
+  sharedGroupId?: number;
   idempotencyKey?: string;
 }): Promise<MediaTaskTransportMetadata | null> {
   const modelTransport = resolveMediaModelTransportConfig({
@@ -464,13 +507,10 @@ export async function resolveVdCharacterMcpTransportMetadata(params: {
     argumentShape,
   }) ?? rawProviderModelId;
 
-  if (!params.mcpConnectionId) {
-    throw new TRPCError({
-      code: "BAD_REQUEST",
-      message: `"${params.modelId}" requires a connected MCP provider account. Connect a ${providerKey} MCP account first, then re-select this model.`,
-    });
-  }
-
+  // NOTE: deliberately no "mcpConnectionId is required" pre-check — see the
+  // matching comment in `verticalDramaEpisodes.ts`. `resolveMediaTransport`
+  // auto-resolves the caller's own eligible connection and raises a precise
+  // error itself when there genuinely is none / the choice is ambiguous.
   return resolveMediaTransport({
     tenantId: params.tenantId,
     actorUserId: params.actorUserId,
@@ -478,6 +518,7 @@ export async function resolveVdCharacterMcpTransportMetadata(params: {
     assetType: params.assetType,
     requestedTransport: "mcp",
     mcpConnectionId: params.mcpConnectionId,
+    sharedGroupId: params.sharedGroupId,
     providerKey,
     providerModelId,
     model: providerModelId ?? params.modelId,
@@ -487,18 +528,143 @@ export async function resolveVdCharacterMcpTransportMetadata(params: {
   });
 }
 
+/**
+ * Feature 135 — Hermes Grok media worker (section 09): transport-neutral
+ * generalization of `resolveVdCharacterMcpTransportMetadata` above. Returns
+ * a discriminated union instead of the old `MediaTaskTransportMetadata |
+ * null` shape so a caller can route into `queueHermesMediaJob` (hermes),
+ * the existing MCP submit path (mcp), or the existing gateway_api/Python
+ * backend path (gateway) — all from ONE call.
+ *
+ * Design point (do NOT rewrite the MCP logic): this function only detects
+ * `resolveMediaModelTransportConfig(...).transport === "hermes_worker"`
+ * FIRST; for every other model it delegates to
+ * `resolveVdCharacterMcpTransportMetadata` UNCHANGED — non-null becomes
+ * `{kind:"mcp"}`, null becomes `{kind:"gateway"}`. That makes the MCP/
+ * gateway arms byte-identical to today by construction; the existing
+ * exported symbol (and its tests, and `verticalDramaLocations.ts`'s import)
+ * are untouched.
+ *
+ * The episodes twin is `resolveVdMediaTransportDecision` (private) in
+ * `verticalDramaEpisodes.ts`, delegating to that file's private
+ * `resolveVdMcpTransportMetadata` the same way — keep the two copies
+ * byte-equivalent apart from the export keyword and name prefix.
+ */
+export type VdTransportDecision =
+  | { kind: "gateway" }
+  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
+  | { kind: "hermes"; connectionId: string };
+
+export interface ResolveVdCharacterMediaTransportDecisionDeps {
+  /** Injectable for tests; default lazily reads section-03's connection
+   *  service so this file's module graph never statically pulls in that
+   *  service's own dependencies (mirrors this file's other lazy-import
+   *  conventions — see the top-of-file `listVoiceCatalog` doc comment). */
+  resolveDefaultHermesConnectionId?: (params: {
+    tenantId: string;
+    userId: number;
+    assetType: "image" | "video";
+  }) => Promise<string | null>;
+}
+
+async function defaultResolveDefaultHermesConnectionId(params: {
+  tenantId: string;
+  userId: number;
+  assetType: "image" | "video";
+}): Promise<string | null> {
+  const { listHermesConnections } = await import("../services/hermesConnectionService");
+  const connections = await listHermesConnections({
+    tenantId: params.tenantId,
+    userId: params.userId,
+    assetType: params.assetType,
+  });
+  const defaultConnection = connections.find(connection =>
+    params.assetType === "image" ? connection.defaultForImage : connection.defaultForVideo,
+  );
+  return defaultConnection?.id ?? null;
+}
+
+export async function resolveVdCharacterMediaTransportDecision(
+  params: {
+    tenantId: string;
+    actorUserId: number;
+    assetType: "image" | "video";
+    modelId: string;
+    configJson: Record<string, unknown> | null;
+    mcpConnectionId?: string;
+    sharedGroupId?: number;
+    hermesConnectionId?: string;
+    idempotencyKey?: string;
+  },
+  deps: ResolveVdCharacterMediaTransportDecisionDeps = {},
+): Promise<VdTransportDecision> {
+  const modelTransport = resolveMediaModelTransportConfig({
+    modelId: params.modelId,
+    configJson: params.configJson,
+  });
+
+  if (modelTransport.transport === "hermes_worker") {
+    const explicitConnectionId = params.hermesConnectionId?.trim();
+    if (explicitConnectionId) {
+      return { kind: "hermes", connectionId: explicitConnectionId };
+    }
+    const resolveDefault = deps.resolveDefaultHermesConnectionId ?? defaultResolveDefaultHermesConnectionId;
+    const defaultConnectionId = await resolveDefault({
+      tenantId: params.tenantId,
+      userId: params.actorUserId,
+      assetType: params.assetType,
+    });
+    if (defaultConnectionId) {
+      return { kind: "hermes", connectionId: defaultConnectionId };
+    }
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED"),
+    });
+  }
+
+  // Cross-transport rejection (mirrors `mediaTransportResolver.ts`'s
+  // "hermesConnectionId requires transport=hermes_worker" rule) — a
+  // hermesConnectionId supplied for a non-hermes model must never be
+  // silently ignored.
+  if (params.hermesConnectionId?.trim()) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "hermesConnectionId requires transport=hermes_worker",
+    });
+  }
+
+  const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
+    tenantId: params.tenantId,
+    actorUserId: params.actorUserId,
+    assetType: params.assetType,
+    modelId: params.modelId,
+    configJson: params.configJson,
+    mcpConnectionId: params.mcpConnectionId,
+    sharedGroupId: params.sharedGroupId,
+    idempotencyKey: params.idempotencyKey,
+  });
+  return transportMetadata ? { kind: "mcp", transportMetadata } : { kind: "gateway" };
+}
+
 /**
  * Resolve the effective image model id for a character generation call:
- * caller-supplied `selectedImageModelId` (validated + must be enabled),
- * falling back to `DEFAULT_MODELS.image` when absent — same fail-open-to-
- * known-good-default convention as `verticalDramaEpisodes.ts`'s
- * `resolveEpisodeImageModelId`. Unlike the episode router (which resolves
- * from a persisted plan field), the character tab passes the model
- * per-request, so this only needs to validate + default, not read a plan.
+ * caller-supplied `selectedImageModelId` (validated + must be enabled).
+ * FAIL CLOSED: the caller must explicitly select a model — no silent
+ * fallback to `DEFAULT_MODELS.image`. (Previously fell back silently; that
+ * let generation run on a model the user never chose. See
+ * `resolveEpisodeImageModelId` in verticalDramaEpisodes.ts for the same
+ * fail-closed convention.) The character tab passes the model per-request,
+ * so this only needs to validate, not read a persisted plan.
  */
 export async function resolveCharacterImageModelId(selectedImageModelId?: string): Promise<string> {
   const requested = selectedImageModelId?.trim();
-  if (!requested) return DEFAULT_MODELS.image;
+  if (!requested) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "กรุณาเลือกโมเดลภาพก่อนสร้าง / Select an image model before generating.",
+    });
+  }
   // Validate the caller-supplied model: must exist, must be an image model,
   // and must be enabled (same validation `verticalDramaEpisodes.ts`'s
   // `assertModelSelectable` performs — inlined here, rather than imported
@@ -507,6 +673,14 @@ export async function resolveCharacterImageModelId(selectedImageModelId?: string
   const models = await getModelsByTypeAsync("image");
   const model = models.find(m => m.id === requested);
   if (!model) {
+    // Cold-start / transient-DB guard: when the DB-backed model catalog is not
+    // loaded, `getModelsByType` serves only the small static fallback subset
+    // (no DB-only models like the higgsfield catalog). Do NOT reject a model we
+    // cannot verify yet — trust the caller's selection and let the downstream
+    // generation validate it, rather than falsely erroring or swapping a default.
+    if (!isDbModelCatalogLoaded()) {
+      return requested;
+    }
     throw new TRPCError({
       code: "BAD_REQUEST",
       message: `Unknown image model "${requested}"`,
@@ -631,6 +805,37 @@ export function extractCharacterDescription(data: Record<string, unknown> | null
   return parts.length > 0 ? parts.join(" | ") : undefined;
 }
 
+/**
+ * Character-roster completeness signal (`vd-stuck-generation-and-lost-characters`
+ * plan, Set B) — pure, unit-testable without a DB. See
+ * `VdCharacterNeedsSetupReason`'s own doc comment (`@shared/verticalDramaSeries/characterAssets`)
+ * for what each reason means.
+ *
+ * `hasApprovedOrGeneratedPortrait` is `undefined` for any caller that hasn't
+ * batched a portrait lookup (see `characterRowToDto`'s own doc comment) — in
+ * that case `"missing_portrait"` is deliberately NOT added, since asserting
+ * "missing" without checking would be a false positive for a character that
+ * actually has one. Only `listCharacters` (which already loads the full
+ * asset manifest for the series) passes a real `true`/`false`.
+ */
+export function computeCharacterNeedsSetupReasons(params: {
+  data: Record<string, unknown> | null | undefined;
+  hasApprovedOrGeneratedPortrait: boolean | undefined;
+}): VdCharacterNeedsSetupReason[] {
+  const reasons: VdCharacterNeedsSetupReason[] = [];
+  if (params.data?.source === "auto_registered_from_story") {
+    reasons.push("auto_registered_from_story");
+  }
+  if (params.hasApprovedOrGeneratedPortrait === false) {
+    reasons.push("missing_portrait");
+  }
+  const description = params.data?.description;
+  if (typeof description !== "string" || description.trim().length === 0) {
+    reasons.push("missing_dna");
+  }
+  return reasons;
+}
+
 /** Browser-safe projection of a character roster row (never leaks internal ids as numbers). */
 /**
  * `includeVoiceConfig` (W12-A, default `false`) — only set `true` by callers
@@ -639,15 +844,37 @@ export function extractCharacterDescription(data: Record<string, unknown> | null
  * the DB column being null, keeps read payloads flags-off byte-identical even
  * in the edge case where a tenant had the flag on, cast a character, then had
  * it turned back off — the field simply stops being surfaced.
+ *
+ * `hasApprovedOrGeneratedPortrait` (Set B, added 2026-07-16) — optional,
+ * batched-by-the-caller signal feeding `needsSetup`/`needsSetupReasons` (see
+ * `computeCharacterNeedsSetupReasons`). Only `listCharacters` currently
+ * passes it (a single manifest query already loaded for the whole series —
+ * no N+1); every other call site (single-row create/update mutations) omits
+ * it, which safely skips the `"missing_portrait"` reason for that response
+ * rather than guessing.
  */
-function characterRowToDto(row: VerticalDramaCharacterRow, options: { includeVoiceConfig?: boolean } = {}) {
+function characterRowToDto(
+  row: VerticalDramaCharacterRow,
+  options: { includeVoiceConfig?: boolean; hasApprovedOrGeneratedPortrait?: boolean } = {},
+) {
+  const data = (row.data as Record<string, unknown> | null) ?? undefined;
+  const needsSetupReasons = computeCharacterNeedsSetupReasons({
+    data,
+    hasApprovedOrGeneratedPortrait: options.hasApprovedOrGeneratedPortrait,
+  });
   return {
     characterId: String(row.id),
     seriesId: String(row.seriesId),
     characterKey: row.characterKey,
     name: row.name,
     role: row.role ?? undefined,
-    data: (row.data as Record<string, unknown> | null) ?? undefined,
+    narrativeRole: row.narrativeRole ?? undefined,
+    roleTier: row.roleTier ?? undefined,
+    occupation: row.occupation ?? row.role ?? undefined,
+    roleVisualIntent: (row.roleVisualIntent as Record<string, unknown> | null) ?? undefined,
+    roleProvenance: row.roleProvenance ?? undefined,
+    roleReviewStatus: row.roleReviewStatus ?? undefined,
+    data,
     // planning/vertical-drama-character-variants/plan.md Phase E — expose the
     // Phase A schema columns so the Characters tab can group variant rows
     // under their parent and badge twin (shares-face) rows.
@@ -658,6 +885,12 @@ function characterRowToDto(row: VerticalDramaCharacterRow, options: { includeVoi
       row.sharesFaceWithCharacterId != null ? String(row.sharesFaceWithCharacterId) : undefined,
     createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
     updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
+    // vd-stuck-generation-and-lost-characters plan, Set B — completeness
+    // signal so the client can badge/filter story-introduced characters that
+    // still need DNA/portrait work, independent of `roleReviewStatus` (which
+    // only tracks role-tier assignment and can clear while still fully bare).
+    needsSetup: needsSetupReasons.length > 0,
+    needsSetupReasons,
     ...(options.includeVoiceConfig
       ? { voiceConfig: (row.voiceConfig as VerticalDramaCharacterVoiceConfig | null) ?? undefined }
       : {}),
@@ -841,14 +1074,517 @@ export const verticalDramaCharactersRouter = router({
       // W12-A — additive `voiceConfig` field, flag-gated (see
       // `characterRowToDto`'s own doc comment for the byte-identical rationale).
       const voiceChainEnabled = await resolveVerticalDramaVoiceChainFlag(tenantId);
+
+      // Set B (vd-stuck-generation-and-lost-characters plan) — batched
+      // "has a usable portrait" signal for `needsSetup`/`needsSetupReasons`,
+      // derived from the manifest ALREADY loaded above (no extra query, no
+      // N+1). Same selection rule the roster card thumbnail uses
+      // (`resolveCharacterCardPortraitAsset` in
+      // `VerticalDramaCharacterStockPanel.tsx`): a `primary_portrait` asset
+      // in `approved`/`generated`/`imported` state counts; `draft`/`rejected`/
+      // `stale` do not.
+      const portraitCharacterIds = new Set(
+        manifest.assets
+          .filter(
+            (asset) =>
+              asset.role === "primary_portrait" &&
+              (asset.state === "approved" || asset.state === "generated" || asset.state === "imported"),
+          )
+          .map((asset) => asset.characterId),
+      );
+
       return {
         characters: rows.map((row: VerticalDramaCharacterRow) =>
-          characterRowToDto(row, { includeVoiceConfig: voiceChainEnabled }),
+          characterRowToDto(row, {
+            includeVoiceConfig: voiceChainEnabled,
+            hasApprovedOrGeneratedPortrait: portraitCharacterIds.has(String(row.id)),
+          }),
         ),
         manifest,
       };
     }),
 
+  /** Submit every server-authored first-portrait candidate as an independent image task. */
+  generatePortraitCandidateBatch: verticalDramaProcedure
+    .input(
+      seriesScope.extend({
+        characterId: z.string().min(1),
+        batchId: z.string().uuid(),
+        // Required — no server-side fallback; caller must explicitly select
+        // an image model (fail-closed, see `resolveCharacterImageModelId`).
+        selectedImageModelId: z.string().trim().min(1).max(128),
+        mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 3).
+        // Required only when the resolved model is Hermes-transport and
+        // the caller has no default Hermes connection for images.
+        hermesConnectionId: z.string().max(64).optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const rateLimitKey = `user:${ctx.user.id}`;
+      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
+        throw new TRPCError({
+          code: "TOO_MANY_REQUESTS",
+          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
+        });
+      }
+
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const characterId = parseId(input.characterId, "character id");
+      await loadOwnedSeries(tenantId, userId, seriesId);
+      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
+      const owner = { tenantId, userId, seriesId };
+      const primaryPortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
+        owner,
+        characterId,
+      );
+      const isFaceLinkedVariant =
+        character.parentCharacterId != null || character.sharesFaceWithCharacterId != null;
+      if (primaryPortraitUrl || isFaceLinkedVariant) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message:
+            "This character already has a canonical portrait or a parent/twin face source.",
+        });
+      }
+
+      let candidateCount: number;
+      try {
+        candidateCount = await verticalDramaCharacterStockService.getPortraitCandidateBatchCount(
+          owner,
+          characterId,
+          input.batchId,
+        );
+      } catch (err) {
+        mapStockError(err);
+      }
+
+      const resolvedImageModelId = await resolveCharacterImageModelId(
+        input.selectedImageModelId,
+      );
+      const [pricingRow] = await db
+        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
+        .from(mediaModels)
+        .where(eq(mediaModels.modelId, resolvedImageModelId))
+        .limit(1);
+      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
+      const creditCostPerImage = calculateCreditCost(pricingModel, { numImages: 1 });
+      const totalReservedCredits = creditCostPerImage * candidateCount;
+
+      // Feature 135 — Hermes Grok media worker (section 09, row 3): resolve
+      // the transport ONCE (not per-candidate) so every candidate in this
+      // batch shares one Hermes connection. MCP/gateway models are
+      // untouched below — the existing per-candidate
+      // `resolveVdCharacterMcpTransportMetadata` call keeps running exactly
+      // as before for those (byte-equivalent regression baseline).
+      const transportDecision = await resolveVdCharacterMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+      });
+      if (transportDecision.kind === "hermes" && candidateCount > 4) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "Hermes portrait candidate batches are capped at 4 candidates per submit.",
+        });
+      }
+      const hermesProviderModelId =
+        transportDecision.kind === "hermes"
+          ? resolveMediaModelTransportConfig({
+              modelId: resolvedImageModelId,
+              configJson: pricingModel.configJson,
+            }).providerModelId ?? resolvedImageModelId
+          : undefined;
+
+      if (transportDecision.kind !== "hermes" && totalReservedCredits > 0) {
+        const hasCredits = await hasEnoughCredits(userId, totalReservedCredits);
+        if (!hasCredits) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: `Insufficient credits for ${candidateCount} portrait candidates. Required: ${totalReservedCredits}`,
+          });
+        }
+      }
+
+      let candidates;
+      try {
+        candidates = await verticalDramaCharacterStockService.claimPortraitCandidateBatch(
+          owner,
+          characterId,
+          input.batchId,
+        );
+      } catch (err) {
+        mapStockError(err);
+      }
+
+      if (transportDecision.kind !== "hermes" && totalReservedCredits > 0) {
+        await deductCredits({
+          userId,
+          tenantId,
+          amount: totalReservedCredits,
+          description:
+            `Vertical Drama — reserve ${candidateCount} character portrait candidates ` +
+            `(character #${characterId})`,
+          sourceType: "media_image",
+          metadata: {
+            feature: "vertical_drama_character_portrait_candidate_batch",
+            seriesId,
+            characterId,
+            batchId: input.batchId,
+            candidateCount,
+            creditCostPerImage,
+            type: "reservation",
+            modelId: resolvedImageModelId,
+          },
+        });
+      }
+
+      const userToken = getCharacterPortraitUserToken(ctx);
+      const submitted: Array<{
+        assetLinkId: string;
+        candidateId: string;
+        index: number;
+        status: "queued" | "failed";
+        taskId?: string;
+        errorMessage?: string;
+      }> = [];
+      for (const candidate of candidates) {
+        try {
+          let taskId: string;
+          if (transportDecision.kind === "hermes") {
+            // Feature 135 — Hermes Grok media worker (section 09, row 3):
+            // one independent `queueHermesMediaJob` call per candidate,
+            // sharing `transportDecision.connectionId`, each with its own
+            // `${batchId}:${candidateId}` idempotency key. No reference
+            // images for a portrait candidate — `image.generate`.
+            const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+            const result = await queueHermesMediaJob({
+              contractVersion: 1,
+              operation: "image.generate",
+              connectionId: transportDecision.connectionId,
+              prompt: candidate.portraitPrompt,
+              settings: {
+                model: hermesProviderModelId ?? resolvedImageModelId,
+                aspectRatio: "9:16",
+                outputCount: 1,
+              },
+              references: [],
+              entity: {
+                type: "vertical_drama_character_portrait_candidate",
+                id: String(candidate.assetLinkId),
+              },
+              traceId: crypto.randomUUID(),
+              tenantId,
+              requestedByUserId: userId,
+              idempotencyKey: `${input.batchId}:${candidate.candidateId}`,
+            });
+            taskId = result.taskId;
+          } else {
+            const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
+              tenantId,
+              actorUserId: userId,
+              assetType: "image",
+              modelId: resolvedImageModelId,
+              configJson: pricingModel.configJson,
+              mcpConnectionId: input.mcpConnectionId,
+              sharedGroupId: input.sharedGroupId,
+              idempotencyKey: `${input.batchId}:${candidate.candidateId}`,
+            });
+            const task = await mediaGenerationService.generateImageAsync(
+              {
+                prompt: candidate.portraitPrompt,
+                negativePrompt: candidate.negativePrompt,
+                model: resolvedImageModelId,
+                numImages: 1,
+                aspectRatio: "9:16",
+                extraParams: {
+                  __origin_surface: "vertical_drama_character_portrait_candidates",
+                  __reserved_credits: creditCostPerImage,
+                  __vd_series_id: String(seriesId),
+                  __vd_character_id: String(characterId),
+                  __vd_portrait_candidate_batch_id: input.batchId,
+                  __vd_portrait_candidate_id: candidate.candidateId,
+                  __vd_portrait_candidate_asset_link_id: String(candidate.assetLinkId),
+                },
+                publicUrl: ctx.publicUrl ?? undefined,
+                ...(transportMetadata ? { transportMetadata } : {}),
+                auditContext: {
+                  userId,
+                  traceId: crypto.randomUUID(),
+                  source: "trpc.verticalDramaCharacters.generatePortraitCandidateBatch",
+                  stage: "submission",
+                },
+              },
+              userToken,
+            );
+            taskId = task.id;
+          }
+          try {
+            await verticalDramaCharacterStockService.recordPortraitCandidateTask({
+              ...owner,
+              assetLinkId: candidate.assetLinkId,
+              taskId,
+              imageModel: resolvedImageModelId,
+            });
+          } catch (recordError) {
+            debugError(
+              "verticalDramaCharacters.generatePortraitCandidateBatch",
+              `Task ${taskId} submitted but candidate task metadata could not be recorded`,
+              recordError,
+            );
+          }
+          submitted.push({
+            assetLinkId: String(candidate.assetLinkId),
+            candidateId: candidate.candidateId,
+            index: candidate.index,
+            status: "queued",
+            taskId,
+          });
+        } catch (error) {
+          const errorMessage =
+            error instanceof Error ? error.message : "Portrait candidate failed to submit";
+          await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed({
+            ...owner,
+            assetLinkId: candidate.assetLinkId,
+            errorMessage,
+          });
+          if (transportDecision.kind !== "hermes" && creditCostPerImage > 0) {
+            await refundCredits({
+              userId,
+              amount: creditCostPerImage,
+              description:
+                `Refund: portrait candidate failed to submit (character #${characterId}, ` +
+                `${candidate.candidateId})`,
+              sourceType: "media_image",
+              metadata: {
+                feature: "vertical_drama_character_portrait_candidate_batch",
+                seriesId,
+                characterId,
+                batchId: input.batchId,
+                candidateId: candidate.candidateId,
+              },
+            });
+          }
+          submitted.push({
+            assetLinkId: String(candidate.assetLinkId),
+            candidateId: candidate.candidateId,
+            index: candidate.index,
+            status: "failed",
+            errorMessage,
+          });
+        }
+      }
+
+      return {
+        batchId: input.batchId,
+        model: resolvedImageModelId,
+        creditsReserved: totalReservedCredits,
+        candidates: submitted.sort((left, right) => left.index - right.index),
+      };
+    }),
+
+  /** Poll and durably settle one candidate without round-tripping private DNA through the browser. */
+  settlePortraitCandidate: verticalDramaProcedure
+    .input(
+      seriesScope.extend({
+        assetLinkId: z.string().min(1),
+        taskId: z.string().min(1).optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const assetLinkId = parseId(input.assetLinkId, "asset link id");
+      await loadOwnedSeries(tenantId, userId, seriesId);
+      const owner = { tenantId, userId, seriesId };
+      let info;
+      try {
+        info = await verticalDramaCharacterStockService.getPortraitCandidateTaskInfo(
+          owner,
+          assetLinkId,
+        );
+      } catch (err) {
+        mapStockError(err);
+      }
+      if (info.taskId && input.taskId && info.taskId !== input.taskId) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "Task id does not match this portrait candidate.",
+        });
+      }
+      const taskId = info.taskId ?? input.taskId;
+      if (
+        taskId &&
+        info.mediaAssetId != null &&
+        info.imageUrl &&
+        ["completed", "selected", "superseded"].includes(info.status)
+      ) {
+        return {
+          assetLinkId: input.assetLinkId,
+          taskId,
+          status: "completed" as const,
+          imageUrl: info.imageUrl,
+        };
+      }
+      if (taskId && info.status === "failed") {
+        return {
+          assetLinkId: input.assetLinkId,
+          taskId,
+          status: "failed" as const,
+        };
+      }
+      if (!taskId) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: "Portrait candidate has no submitted media task.",
+        });
+      }
+      const task = await mediaGenerationService.getTask(
+        taskId,
+        getCharacterPortraitUserToken(ctx),
+        {
+          userId,
+          source: "trpc.verticalDramaCharacters.settlePortraitCandidate",
+          stage: "poll",
+        },
+      );
+
+      if (!info.taskId && info.status === "submitting") {
+        const provenanceMatches =
+          task.mediaType === "image" &&
+          readMediaTaskInternalParameter(
+            task.parameters,
+            "__vd_portrait_candidate_asset_link_id",
+          ) === input.assetLinkId &&
+          readMediaTaskInternalParameter(
+            task.parameters,
+            "__vd_portrait_candidate_batch_id",
+          ) === info.batchId &&
+          readMediaTaskInternalParameter(
+            task.parameters,
+            "__vd_portrait_candidate_id",
+          ) === info.candidateId &&
+          readMediaTaskInternalParameter(task.parameters, "__vd_character_id") ===
+            String(info.characterId);
+        if (!provenanceMatches) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: "Task provenance does not match this portrait candidate.",
+          });
+        }
+        await verticalDramaCharacterStockService.recordPortraitCandidateTask({
+          ...owner,
+          assetLinkId,
+          taskId,
+          imageModel: task.model,
+        });
+      }
+
+      if (task.status === "completed" || task.status === "failed") {
+        const { reconcileTaskCredits } = await import("./media");
+        void reconcileTaskCredits({ task: task as any, userId }).catch(() => {});
+      }
+      if (task.status === "failed") {
+        await verticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed({
+          ...owner,
+          assetLinkId,
+          errorMessage: task.errorMessage ?? "Portrait candidate render failed",
+        });
+        // Set A gap 7 (server half): classify the immediate synchronous
+        // response the same way `markPortraitCandidateSubmissionFailed`
+        // classifies the durable row, so the client can show a clear
+        // manual-retry message on THIS poll response without waiting for a
+        // manifest refetch. No soften-authoring path exists for character
+        // portrait-candidate prompts (unlike shot/start-frame's
+        // `vertical-drama-shot-image-action` skill) — auto-soften retry for
+        // candidates is deliberately deferred, see plan.md Set A.
+        const policyRejected = isCharacterLockPolicyFailureMessage(task.errorMessage);
+        return {
+          assetLinkId: input.assetLinkId,
+          taskId,
+          status: "failed" as const,
+          errorMessage: policyRejected
+            ? VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE
+            : (task.errorMessage ?? undefined),
+          policyRejected,
+        };
+      }
+      if (task.status !== "completed") {
+        return { assetLinkId: input.assetLinkId, taskId, status: task.status };
+      }
+      if (!task.resultUrl) {
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: "Portrait candidate completed without a result URL.",
+        });
+      }
+
+      const { assetId } = await createAssetFromAttachment(
+        {
+          type: "image",
+          url: task.resultUrl,
+          mimeType: "image/jpeg",
+        } as any,
+        { tenantId, userId } as any,
+      );
+      let asset;
+      try {
+        asset = await verticalDramaCharacterStockService.attachGeneratedPortraitCandidate({
+          ...owner,
+          assetLinkId,
+          mediaAssetId: assetId,
+        });
+      } catch (err) {
+        mapStockError(err);
+      }
+      return {
+        assetLinkId: input.assetLinkId,
+        taskId,
+        status: "completed" as const,
+        imageUrl: task.resultUrl,
+        asset,
+      };
+    }),
+
+  /** Select one completed candidate as the canonical portrait and Character DNA. */
+  selectPortraitCandidate: verticalDramaProcedure
+    .input(
+      seriesScope.extend({
+        characterId: z.string().min(1),
+        assetLinkId: z.string().min(1),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const characterId = parseId(input.characterId, "character id");
+      const assetLinkId = parseId(input.assetLinkId, "asset link id");
+      await loadOwnedSeries(tenantId, userId, seriesId);
+      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
+      try {
+        const asset = await verticalDramaCharacterStockService.selectPortraitCandidate({
+          tenantId,
+          userId,
+          seriesId,
+          characterId,
+          assetLinkId,
+        });
+        return { asset };
+      } catch (err) {
+        mapStockError(err);
+      }
+    }),
+
   /**
    * Build the browser-safe per-series character-asset manifest (approved /
    * pending / stale reference stock). Read-only.
@@ -870,6 +1606,12 @@ export const verticalDramaCharactersRouter = router({
         characterKey: z.string().trim().min(1).max(64),
         name: z.string().trim().min(1).max(255),
         role: z.string().trim().max(100).optional(),
+        narrativeRole: narrativeRoleSchema.optional(),
+        roleTier: roleTierSchema.optional(),
+        occupation: z.string().trim().max(160).optional(),
+        roleVisualIntent: roleVisualIntentSchema.optional(),
+        roleProvenance: roleProvenanceSchema.optional(),
+        roleReviewStatus: roleReviewStatusSchema.optional(),
         data: z.record(z.string(), z.unknown()).optional(),
       }),
     )
@@ -888,6 +1630,12 @@ export const verticalDramaCharactersRouter = router({
           characterKey: input.characterKey,
           name: input.name,
           role: input.role ?? null,
+          narrativeRole: input.narrativeRole ?? null,
+          roleTier: input.roleTier ?? null,
+          occupation: input.occupation ?? input.role ?? null,
+          roleVisualIntent: input.roleVisualIntent ?? null,
+          roleProvenance: input.roleProvenance ?? (input.narrativeRole && input.roleTier ? "user_confirmed" : "ai_assigned"),
+          roleReviewStatus: input.roleReviewStatus ?? (input.narrativeRole && input.roleTier ? "ready" : "needs_role_review"),
           data: input.data ?? null,
         } as typeof verticalDramaCharacters.$inferInsert)
         .returning();
@@ -902,6 +1650,12 @@ export const verticalDramaCharactersRouter = router({
         characterId: z.string().min(1),
         name: z.string().trim().min(1).max(255).optional(),
         role: z.string().trim().max(100).nullable().optional(),
+        narrativeRole: narrativeRoleSchema.nullable().optional(),
+        roleTier: roleTierSchema.nullable().optional(),
+        occupation: z.string().trim().max(160).nullable().optional(),
+        roleVisualIntent: roleVisualIntentSchema.nullable().optional(),
+        roleProvenance: roleProvenanceSchema.nullable().optional(),
+        roleReviewStatus: roleReviewStatusSchema.nullable().optional(),
         data: z.record(z.string(), z.unknown()).nullable().optional(),
       }),
     )
@@ -916,6 +1670,16 @@ export const verticalDramaCharactersRouter = router({
       const patch: Record<string, unknown> = { updatedAt: new Date() };
       if (input.name !== undefined) patch.name = input.name;
       if (input.role !== undefined) patch.role = input.role;
+      if (input.narrativeRole !== undefined) patch.narrativeRole = input.narrativeRole;
+      if (input.roleTier !== undefined) patch.roleTier = input.roleTier;
+      if (input.occupation !== undefined) patch.occupation = input.occupation;
+      if (input.roleVisualIntent !== undefined) patch.roleVisualIntent = input.roleVisualIntent;
+      if (input.roleProvenance !== undefined) patch.roleProvenance = input.roleProvenance;
+      if (input.roleReviewStatus !== undefined) patch.roleReviewStatus = input.roleReviewStatus;
+      if ((input.narrativeRole !== undefined || input.roleTier !== undefined) && input.roleProvenance === undefined) {
+        patch.roleProvenance = input.narrativeRole && input.roleTier ? "user_confirmed" : "migrated";
+        patch.roleReviewStatus = input.narrativeRole && input.roleTier ? "ready" : "needs_role_review";
+      }
       if (input.data !== undefined) patch.data = input.data;
 
       const [row] = await db
@@ -1016,6 +1780,15 @@ export const verticalDramaCharactersRouter = router({
           characterKey,
           name: parent.name,
           role: parent.role,
+          narrativeRole: parent.narrativeRole,
+          // Keep the person's canonical story role on variants so an
+          // outfit/age-stage render cannot silently lose heroine/hero/villain
+          // visual intent. `variantType` remains the identity-lock fact.
+          roleTier: parent.roleTier,
+          occupation: parent.occupation ?? parent.role,
+          roleVisualIntent: parent.roleVisualIntent,
+          roleProvenance: parent.roleProvenance,
+          roleReviewStatus: parent.roleReviewStatus,
           parentCharacterId: parent.id,
           variantLabel: input.variantLabel,
           variantType: input.variantType,
@@ -1063,6 +1836,9 @@ export const verticalDramaCharactersRouter = router({
         sharesFaceWithCharacterId: z.string().min(1),
         name: z.string().trim().min(1).max(255),
         role: z.string().trim().max(100).optional(),
+        narrativeRole: narrativeRoleSchema.optional(),
+        roleTier: roleTierSchema.optional(),
+        occupation: z.string().trim().max(160).optional(),
         customDescription: z.string().trim().max(2000).optional(),
         referenceMediaAssetId: z.string().min(1).optional(),
       }),
@@ -1089,6 +1865,11 @@ export const verticalDramaCharactersRouter = router({
           characterKey,
           name: input.name,
           role: input.role ?? source.role,
+          narrativeRole: input.narrativeRole ?? source.narrativeRole,
+          roleTier: input.roleTier ?? source.roleTier,
+          occupation: input.occupation ?? source.occupation ?? source.role,
+          roleProvenance: input.narrativeRole || input.roleTier ? "user_confirmed" : source.roleProvenance,
+          roleReviewStatus: input.roleTier ? "ready" : source.roleReviewStatus,
           sharesFaceWithCharacterId: source.id,
           data: description ? { description } : null,
         } as typeof verticalDramaCharacters.$inferInsert)
@@ -1650,13 +2431,14 @@ export const verticalDramaCharactersRouter = router({
     .input(
       seriesScope.extend({
         characterId: z.string().min(1),
+        portraitCandidateCount: z.number().int().min(1).max(5).optional(),
         // Free-text visual brief (framing/pose/crop/mood/outfit/setting/etc.)
-        // for THIS generation only
-        // (vertical-drama-character-custom-instruction plan) — threaded
-        // straight through to `generateCharacterVisualPrompts` as a raw fact;
-        // see that function's `customInstruction` doc comment. This is the
-        // PRIMARY path this field works through, since the UI always calls
-        // preview before confirm (see this procedure's own doc comment).
+        // for THIS generation only. It is passed through to
+        // `generateCharacterVisualPrompts` as a raw fact, then
+        // enforced in the previewed render prompt by
+        // `customInstruction` is passed to the active Visual Bible Skill as
+        // data; the skill owns precedence and wording for the generated
+        // prompt. This is the PRIMARY path because the UI previews first.
         customInstruction: z.string().trim().max(500).optional(),
       }),
     )
@@ -1707,6 +2489,110 @@ export const verticalDramaCharactersRouter = router({
         ? await loadCharacterDesignContext({ tenantId, userId }, seriesRow, character)
         : undefined;
 
+      if (input.portraitCandidateCount) {
+        const primaryPortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
+          { tenantId, userId, seriesId },
+          characterId,
+        );
+        const isFaceLinkedVariant =
+          character.parentCharacterId != null || character.sharesFaceWithCharacterId != null;
+        if (primaryPortraitUrl || isFaceLinkedVariant) {
+          throw new TRPCError({
+            code: "PRECONDITION_FAILED",
+            message:
+              "Multiple casting candidates are only available before this standalone character has a primary portrait.",
+          });
+        }
+
+        let candidateResult;
+        try {
+          candidateResult = await generateCharacterPortraitCandidates({
+            userId,
+            tenantId,
+            seriesId,
+            characterId,
+            characterKey: character.characterKey,
+            name: character.name,
+            role: character.role,
+            narrativeRole: character.narrativeRole as NarrativeRole | null | undefined,
+            roleTier: character.roleTier as RoleTier | null | undefined,
+            occupation: character.occupation,
+            roleVisualIntent: character.roleVisualIntent as RoleVisualIntent | null | undefined,
+            roleReviewStatus: character.roleReviewStatus as RoleReviewStatus | null | undefined,
+            description,
+            storyContext: seriesRow
+              ? {
+                  title: seriesRow.title,
+                  genre: seriesRow.genre ?? undefined,
+                  tone: seriesRow.tone ?? undefined,
+                }
+              : undefined,
+            targetAudienceRegion,
+            presetVisualIdentity,
+            customInstruction: input.customInstruction,
+            characterDesignContext,
+            portraitCandidateCount: input.portraitCandidateCount as 1 | 2 | 3 | 4 | 5,
+            allowLegacyApprovedDesignDnaReplacement: Boolean(
+              characterDesignContext?.approvedDesignDna,
+            ),
+          });
+        } catch (err) {
+          if (err instanceof InsufficientCreditsError) {
+            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
+          }
+          if (err instanceof VdSchemaValidationError) {
+            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
+          }
+          throw new TRPCError({
+            code: "INTERNAL_SERVER_ERROR",
+            message:
+              err instanceof Error
+                ? err.message
+                : "Character portrait candidate generation failed",
+          });
+        }
+
+        let draftBatch;
+        try {
+          draftBatch = await verticalDramaCharacterStockService.createPortraitCandidateDraftBatch({
+            tenantId,
+            userId,
+            seriesId,
+            characterId,
+            characterKey: character.characterKey,
+            sharedVisualLanguage: candidateResult.sharedVisualLanguage,
+            promptModel: candidateResult.model,
+            candidates: candidateResult.candidates.map((candidate) => ({
+              candidateId: candidate.candidateId,
+              portraitPrompt: candidate.portraitPrompt,
+              negativePrompt: candidate.negativePrompt,
+              visualIdentitySummary: candidate.visualIdentitySummary,
+              visualBibleSnapshot: candidate.visualBibleSnapshot,
+            })),
+          });
+        } catch (err) {
+          mapStockError(err);
+        }
+        const draftsByCandidateId = new Map(
+          draftBatch.candidates.map((candidate) => [candidate.candidateId, candidate]),
+        );
+        return {
+          mode: "candidate_batch" as const,
+          batchId: draftBatch.batchId,
+          candidateCount: candidateResult.candidates.length,
+          sharedVisualLanguage: candidateResult.sharedVisualLanguage,
+          model: candidateResult.model,
+          candidates: candidateResult.candidates.map((candidate) => ({
+            assetLinkId: String(draftsByCandidateId.get(candidate.candidateId)!.assetLinkId),
+            candidateId: candidate.candidateId,
+            index: draftsByCandidateId.get(candidate.candidateId)!.index,
+            portraitPrompt: candidate.portraitPrompt,
+            negativePrompt: candidate.negativePrompt,
+            visualIdentitySummary: candidate.visualIdentitySummary,
+          })),
+        };
+      }
+
       let promptResult;
       try {
         promptResult = await generateCharacterVisualPrompts({
@@ -1717,6 +2603,11 @@ export const verticalDramaCharactersRouter = router({
           characterKey: character.characterKey,
           name: character.name,
           role: character.role,
+          narrativeRole: character.narrativeRole as NarrativeRole | null | undefined,
+          roleTier: character.roleTier as RoleTier | null | undefined,
+          occupation: character.occupation,
+          roleVisualIntent: character.roleVisualIntent as RoleVisualIntent | null | undefined,
+          roleReviewStatus: character.roleReviewStatus as RoleReviewStatus | null | undefined,
           description,
           storyContext: seriesRow
             ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
@@ -1740,14 +2631,17 @@ export const verticalDramaCharactersRouter = router({
         });
       }
 
+      const renderPrompt = promptResult.portraitPrompt;
+
       return {
-        portraitPrompt: promptResult.portraitPrompt,
+        mode: "single" as const,
+        portraitPrompt: renderPrompt,
         turnaroundPrompt: promptResult.turnaroundPrompt,
         negativePrompt: promptResult.negativePrompt,
         model: promptResult.model,
         approvedDesignSnapshot: {
           characterKey: character.characterKey,
-          portraitPrompt: promptResult.portraitPrompt,
+          portraitPrompt: renderPrompt,
           ...(promptResult.negativePrompt
             ? { negativePrompt: promptResult.negativePrompt }
             : {}),
@@ -1761,11 +2655,9 @@ export const verticalDramaCharactersRouter = router({
    * `vertical-drama-character-visual-bible` skill as a direct, credit-gated
    * LLM call to produce a portrait prompt + negative prompt (see
    * `verticalDramaCharacterImageGeneration.ts`), then (2) render that prompt
-   * into an actual image via `mediaGenerationService.generateImage` (the
-   * SYNCHRONOUS single-prompt-in/single-image-out method — the same one
-   * `media.ts`'s `generateImage` mutation calls; chosen over
-   * `generateImageAsync` because this is a plain text-prompt portrait with
-   * no user-uploaded reference image and no need for job polling). The
+   * into an actual image via `mediaGenerationService.generateImageAsync`.
+   * The caller polls the returned media task, matching the rest of the
+   * character-tab generation workflow. The
    * rendered image is registered as a canonical `media_assets` row (never a
    * bare provider URL, matching this table's own doc comment) and linked
    * into the durable character-asset stock via the existing
@@ -1777,8 +2669,8 @@ export const verticalDramaCharactersRouter = router({
    * spend): the prompt-generation LLM call is credited inside
    * `generateCharacterVisualPrompts` itself; the image render is credited
    * here, mirroring `media.ts`'s own check-credits -> call -> deduct-credits
-   * convention (`mediaGenerationService.generateImage` does not deduct
-   * credits itself — the caller always does, using the backend-reported
+   * convention (the media-generation service does not deduct credits itself
+   * — the caller always does, using the backend-reported
    * `creditsUsed` when available).
    *
    * `approvedPrompt` / `approvedNegativePrompt` (optional): when the caller
@@ -1796,13 +2688,19 @@ export const verticalDramaCharactersRouter = router({
         approvedNegativePrompt: z.string().optional(),
         approvedDesignSnapshot: verticalDramaApprovedCharacterDesignSnapshotSchema.optional(),
         // Caller-selected image model (character tab's own model picker) —
-        // validated + must be enabled; falls back to `DEFAULT_MODELS.image`
-        // when absent. See `resolveCharacterImageModelId`.
-        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
+        // validated + must be enabled. REQUIRED — no server-side fallback;
+        // throws BAD_REQUEST when absent. See `resolveCharacterImageModelId`.
+        selectedImageModelId: z.string().trim().min(1).max(128),
         // Required only when the selected model is MCP-transport (e.g.
         // `higgsfield/*`, `magnific-mcp/*`) — see
         // `resolveVdCharacterMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row —
+        // `generateCharacterImage`). Required only when the resolved model
+        // is Hermes-transport and the caller has no default Hermes
+        // connection for images.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional explicit reference-image-picker override (Phase D1,
         // `planning/vertical-drama-reference-picker-outfit-lock/plan.md`) —
         // when present, pins the identity-lock reference image to this exact
@@ -1810,13 +2708,9 @@ export const verticalDramaCharactersRouter = router({
         // `primary_portrait` via `getPrimaryPortraitUrl`. Absent: behavior is
         // byte-identical to today's auto-resolution.
         referenceAssetLinkId: z.string().min(1).optional(),
-        // Free-text framing/pose/crop/mood hint for THIS generation only
-        // (vertical-drama-character-custom-instruction plan) — only consumed
-        // on the no-`approvedPrompt` fallback path below, since the normal UI
-        // flow always calls `previewCharacterPrompt` first (which already
-        // ran the LLM leg with this hint applied) and supplies its output as
-        // `approvedPrompt` here. Kept here too so a future caller that skips
-        // preview still gets the hint applied.
+        // Free-text visual brief for THIS generation only. It reaches the
+        // planner on the fallback path and is enforced on the exact provider
+        // prompt on BOTH fallback and approved-preview paths.
         customInstruction: z.string().trim().max(500).optional(),
       }),
     )
@@ -1939,6 +2833,11 @@ export const verticalDramaCharactersRouter = router({
             characterKey: character.characterKey,
             name: character.name,
             role: character.role,
+            narrativeRole: character.narrativeRole as NarrativeRole | null | undefined,
+            roleTier: character.roleTier as RoleTier | null | undefined,
+            occupation: character.occupation,
+            roleVisualIntent: character.roleVisualIntent as RoleVisualIntent | null | undefined,
+            roleReviewStatus: character.roleReviewStatus as RoleReviewStatus | null | undefined,
             description,
             storyContext: seriesRow
               ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
@@ -1969,13 +2868,12 @@ export const verticalDramaCharactersRouter = router({
         promptCreditsUsed = promptResult.creditsUsed;
         visualBibleToPersist = promptResult.visualBibleSnapshot;
       }
-
       // 2. Pre-flight credit check for the image render — a SEPARATE charge
       //    from the prompt-generation LLM call above. Prices + generates
       //    against the CALLER-SELECTED model (character tab's own picker),
-      //    falling back to `DEFAULT_MODELS.image` when none was selected —
-      //    previously this always priced + generated with
-      //    `DEFAULT_MODELS.image`, silently ignoring the selected model.
+      //    which is now REQUIRED — `resolveCharacterImageModelId` throws
+      //    BAD_REQUEST when none was selected instead of silently falling
+      //    back to `DEFAULT_MODELS.image`.
       const resolvedImageModelId = await resolveCharacterImageModelId(input.selectedImageModelId);
       const [pricingRow] = await db
         .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
@@ -1991,7 +2889,29 @@ export const verticalDramaCharactersRouter = router({
       // `generateStartFrameImage` (`deductCredits`/`refundCredits` throw on
       // amount <= 0 by design; see creditService.ts).
       const shouldChargeImageCredits = imageCreditCost > 0;
-      if (shouldChargeImageCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09): resolve the
+      // transport-neutral decision BEFORE the credit check below (not
+      // after) — structurally guarantees a Hermes generation is never
+      // gated on the caller's SmartSpec credit balance (hermes bills
+      // `provider_account`, section-05's job). `mcp`/`gateway` fall through
+      // to the pre-existing code below byte-identically (via
+      // `resolveVdCharacterMcpTransportMetadata`, called unchanged just
+      // below); `hermes` takes a completely separate path — no platform
+      // credit reserve, submits straight to `queueHermesMediaJob`, and
+      // returns early with the same response shape.
+      const transportDecision = await resolveVdCharacterMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+      });
+
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
         const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
         if (!hasImageCredits) {
           throw new TRPCError({
@@ -2001,18 +2921,95 @@ export const verticalDramaCharactersRouter = router({
         }
       }
 
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referencePortraitUrl ? [referencePortraitUrl] : [],
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+          roleFor: () => "identity_lock",
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: portraitPrompt,
+          settings: { model: hermesProviderModelId, aspectRatio: "9:16", outputCount: 1 },
+          references,
+          entity: { type: "vertical_drama_character", id: String(characterId) },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: portraitPrompt,
+          extraParams: { __vd_series_id: String(seriesId), __vd_character_id: String(characterId) },
+          droppedReferenceCount,
+        });
+
+        let hermesDnaPersistenceStatus: "persisted" | "skipped" | "failed" = "skipped";
+        let hermesDnaPersistenceWarning: string | null = null;
+        if (visualBibleToPersist) {
+          try {
+            await persistCharacterVisualBible(
+              { tenantId, userId, seriesId },
+              characterId,
+              visualBibleToPersist,
+            );
+            hermesDnaPersistenceStatus = "persisted";
+          } catch (error) {
+            hermesDnaPersistenceStatus = "failed";
+            hermesDnaPersistenceWarning =
+              "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
+            debugError(
+              "verticalDramaCharacters.generateCharacterImage",
+              `Character DNA persistence failed after media task ${hermesTask.id}`,
+              error,
+            );
+          }
+        } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
+          hermesDnaPersistenceWarning =
+            "Character DNA was not saved because the approved prompt was edited after preview.";
+        }
+
+        return {
+          taskId: hermesTask.id,
+          portraitPrompt,
+          negativePrompt,
+          promptModel,
+          visualBibleSummary,
+          creditsUsed: { promptGeneration: promptCreditsUsed },
+          dnaPersistenceStatus: hermesDnaPersistenceStatus,
+          dnaPersistenceWarning: hermesDnaPersistenceWarning,
+          droppedReferenceCount,
+        };
+      }
+
       // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
       // dispatched through the service's MCP branch, not the default
       // gateway_api/Python-backend path — see
-      // `resolveVdCharacterMcpTransportMetadata`.
-      const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "image",
-        modelId: resolvedImageModelId,
-        configJson: pricingModel.configJson,
-        mcpConnectionId: input.mcpConnectionId,
-      });
+      // `resolveVdCharacterMcpTransportMetadata` (delegated to by
+      // `resolveVdCharacterMediaTransportDecision` above, unchanged).
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
 
       // 3. Submit — async (matches `media.generateImageAsync` + `media.getTask`
       //    convention; shows in Media History; avoids a long-blocking
@@ -2182,9 +3179,14 @@ export const verticalDramaCharactersRouter = router({
          *  never wired into a code-authored prompt string (that would be the
          *  exact violation this endpoint used to have). */
         sheetLanguage: z.enum(["en", "th"]).optional().default("en"),
-        // Caller-selected image model — see `generateCharacterImage`'s same field.
-        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
+        // Caller-selected image model — see `generateCharacterImage`'s same
+        // field. REQUIRED — no server-side fallback.
+        selectedImageModelId: z.string().trim().min(1).max(128),
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09). See
+        // `generateCharacterImage`'s identical field.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional explicit reference-image-picker override — see
         // `generateCharacterImage`'s identical field for the full contract.
         referenceAssetLinkId: z.string().min(1).optional(),
@@ -2305,6 +3307,11 @@ export const verticalDramaCharactersRouter = router({
             characterKey: character.characterKey,
             name: character.name,
             role: character.role,
+            narrativeRole: character.narrativeRole as NarrativeRole | null | undefined,
+            roleTier: character.roleTier as RoleTier | null | undefined,
+            occupation: character.occupation,
+            roleVisualIntent: character.roleVisualIntent as RoleVisualIntent | null | undefined,
+            roleReviewStatus: character.roleReviewStatus as RoleReviewStatus | null | undefined,
             description,
             storyContext: seriesRow
               ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
@@ -2375,7 +3382,24 @@ export const verticalDramaCharactersRouter = router({
         numImages: resolvedSheetType === "turnaround" ? 1 : 2,
       });
       const shouldChargeSheetCredits = sheetCreditCost > 0;
-      if (shouldChargeSheetCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09): resolve the
+      // transport-neutral decision BEFORE the credit check below (not
+      // after) — see `generateCharacterImage`'s identical block for the
+      // full rationale (a Hermes generation must never be gated on the
+      // caller's SmartSpec credit balance).
+      const transportDecision = await resolveVdCharacterMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+      });
+
+      if (transportDecision.kind !== "hermes" && shouldChargeSheetCredits) {
         const hasCredits = await hasEnoughCredits(userId, sheetCreditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -2385,14 +3409,94 @@ export const verticalDramaCharactersRouter = router({
         }
       }
 
-      const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "image",
-        modelId: resolvedImageModelId,
-        configJson: pricingModel.configJson,
-        mcpConnectionId: input.mcpConnectionId,
-      });
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referencePortraitUrl ? [referencePortraitUrl] : [],
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+          roleFor: () => "identity_lock",
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: sheetPromptText,
+          settings: { model: hermesProviderModelId, aspectRatio: "9:16", outputCount: 1 },
+          references,
+          entity: { type: "vertical_drama_character", id: String(characterId) },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: sheetPromptText,
+          extraParams: { __vd_series_id: String(seriesId), __vd_character_id: String(characterId) },
+          droppedReferenceCount,
+        });
+        const hermesAssetTag = resolveCharacterSheetAssetTag(resolvedSheetType);
+
+        let hermesDnaPersistenceStatus: "persisted" | "skipped" | "failed" = "skipped";
+        let hermesDnaPersistenceWarning: string | null = null;
+        if (visualBibleToPersist) {
+          try {
+            await persistCharacterVisualBible(
+              { tenantId, userId, seriesId },
+              characterId,
+              visualBibleToPersist,
+            );
+            hermesDnaPersistenceStatus = "persisted";
+          } catch (error) {
+            hermesDnaPersistenceStatus = "failed";
+            hermesDnaPersistenceWarning =
+              "Image task submitted, but Character DNA could not be saved. The image task was not resubmitted.";
+            debugError(
+              "verticalDramaCharacters.generateCharacterSheet",
+              `Character DNA persistence failed after media task ${hermesTask.id}`,
+              error,
+            );
+          }
+        } else if (input.approvedDesignSnapshot && input.approvedPrompt) {
+          hermesDnaPersistenceWarning =
+            "Character DNA was not saved because the approved prompt was edited after preview.";
+        }
+
+        return {
+          taskId: hermesTask.id,
+          sheetType: resolvedSheetType,
+          sheetPrompt: sheetPromptText,
+          negativePrompt,
+          promptModel,
+          visualBibleSummary,
+          creditsUsed: { promptGeneration: promptCreditsUsed },
+          assetRole: hermesAssetTag.role,
+          assetMetadata: hermesAssetTag.metadata,
+          dnaPersistenceStatus: hermesDnaPersistenceStatus,
+          dnaPersistenceWarning: hermesDnaPersistenceWarning,
+          droppedReferenceCount,
+        };
+      }
+
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
 
       if (shouldChargeSheetCredits) {
         await deductCredits({
diff --git a/apps/web/server/routers/verticalDramaEpisodes.ts b/apps/web/server/routers/verticalDramaEpisodes.ts
index d582914d0..466034549 100644
--- a/apps/web/server/routers/verticalDramaEpisodes.ts
+++ b/apps/web/server/routers/verticalDramaEpisodes.ts
@@ -36,9 +36,16 @@ import {
 import { calculateCreditCost } from "../services/pricingCalculator";
 import {
   getModelsByTypeAsync,
+  isDbModelCatalogLoaded,
   resolveVerticalDramaCapabilities,
   deriveModelResolutionOptions,
 } from "../services/modelRegistry";
+import {
+  markArtifactStale,
+  stampArtifactForStoryboard,
+  stampStoryboardRevision,
+  storyboardArtifactStatus,
+} from "../services/verticalDramaStoryboardRevision";
 import {
   hasEnoughCredits,
   deductCredits,
@@ -52,6 +59,9 @@ import {
   defaultMcpArgumentShape,
 } from "../services/mcpModelRouteResolver";
 import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
+// Feature 135 — Hermes Grok media worker (section 09). Pure string helper
+// only (no DB import) — see this file's private `resolveVdMediaTransportDecision`.
+import { formatHermesErrorMessage } from "../../shared/hermesMedia";
 import { signBearerToken } from "../_core/tokens";
 import { mediaGenerationLimiter } from "../services/rateLimiter";
 import { verticalDramaCharacterStockService } from "../services/verticalDramaCharacterStock";
@@ -154,7 +164,9 @@ import {
 import {
   VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL,
 } from "@shared/verticalDramaSeries/characterLock";
-import { ensurePromptWithinLimit } from "../services/verticalDramaPromptQc";
+import {
+  ensurePromptWithinLimit,
+} from "../services/verticalDramaPromptQc";
 // Preset visual identity flow-through (spec §8.2.2 flow-through rule,
 // section-15 change D, Wave-4A/section-14 completing the "start
 // frames/motion prompts" leg of the rule — character refs were already
@@ -178,6 +190,7 @@ import {
 } from "@shared/verticalDramaSeries/presetVisualIdentity";
 import {
   buildCharacterIdentityMapBlock,
+  findCharacterImageIndexMappingMismatches,
   stripExistingIdentityLockSuffix,
   type VerticalDramaCharacterDescriptorSource,
 } from "@shared/verticalDramaSeries/characterIdentityMap";
@@ -188,6 +201,17 @@ import {
   VERTICAL_DRAMA_THAI_ACCENTS,
   VERTICAL_DRAMA_TARGET_DURATION_SECONDS,
   analyzeVerticalDramaClipDialogueQuality,
+  // Phase 6 (`planning/vd-start-frame-reference-mapping/plan.md`) —
+  // `generateShotReferenceFrameImage`'s `prompt` input zod-caps at the same
+  // limit `ensurePromptWithinLimit` itself enforces (so a user who edits the
+  // confirmed prompt can never submit something the render call would have
+  // silently truncated anyway). Imported from the shared barrel directly
+  // (NOT from `verticalDramaPromptQc.ts`'s re-export) — that service module
+  // is wholesale-mocked by every existing VD router test file, and none of
+  // those mocks export this constant; `@shared/verticalDramaSeries` is a
+  // pure/shared module every one of those same test files already imports
+  // unmocked.
+  VD_IMAGE_PROMPT_MAX,
 } from "@shared/verticalDramaSeries";
 import {
   targetVerticalDramaSpeechSeconds,
@@ -1259,6 +1283,15 @@ async function resolveEpisodePlanAssetUrls(
   for (const frame of frames) {
     if (frame?.approvedMediaAssetId)
       ids.add(String(frame.approvedMediaAssetId));
+    // Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
+    // plan.md`) — additive: folds each frame's persisted alternate-angle
+    // "backup still" ids into the SAME batch query/flat id->url map this
+    // function already builds (no new query). `?? []` contributes nothing
+    // for every frame created before this field existed, so every
+    // pre-existing caller/test stays byte-identical.
+    for (const angleGridAssetId of frame?.angleGridAssetIds ?? []) {
+      ids.add(String(angleGridAssetId));
+    }
   }
   const clips =
     (motionPromptPack as VerticalDramaMotionPromptPack | null)?.clips ?? [];
@@ -1299,6 +1332,43 @@ async function resolveEpisodePlanAssetUrls(
   return result;
 }
 
+/**
+ * Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
+ * plan.md`) — group each frame's persisted `angleGridAssetIds` into resolved
+ * `{ mediaAssetId, url }[]`, keyed by `shotNumber`, for `getEpisodeDetail`'s
+ * response. Deliberately NOT a new query: `assetUrls` is the SAME flat map
+ * `resolveEpisodePlanAssetUrls` already returned (its `ids` set now also
+ * includes every frame's `angleGridAssetIds`, see that function's own doc
+ * comment) — this is a pure in-memory re-grouping of already-fetched data,
+ * following the existing "resolve every referenced id in one batch query,
+ * client joins by id/shot number" pattern this router already uses for
+ * `assetUrls` itself, rather than inventing a second per-frame query. A
+ * frame with no `angleGridAssetIds` (every frame created before this field
+ * existed) is simply absent from the returned record — never an empty-array
+ * placeholder — so this stays a strictly additive, opt-in-by-presence key.
+ */
+function buildAngleGridAssetsByShotNumber(
+  startFramePlan: VerticalDramaStartFramePlan | null,
+  assetUrls: Record<string, { url: string; thumbnailUrl: string | null }>
+): Record<number, Array<{ mediaAssetId: number; url: string }>> {
+  const result: Record<number, Array<{ mediaAssetId: number; url: string }>> =
+    {};
+  for (const frame of startFramePlan?.frames ?? []) {
+    const angleGridAssetIds = frame?.angleGridAssetIds;
+    if (!angleGridAssetIds?.length) continue;
+    const resolved = angleGridAssetIds
+      .map(mediaAssetId => {
+        const entry = assetUrls[String(mediaAssetId)];
+        return entry ? { mediaAssetId, url: entry.url } : null;
+      })
+      .filter((entry): entry is { mediaAssetId: number; url: string } =>
+        Boolean(entry)
+      );
+    if (resolved.length > 0) result[frame.shotNumber] = resolved;
+  }
+  return result;
+}
+
 /**
  * Batch-resolve arbitrary `media_assets` numeric ids to their display URL,
  * tenant + user scoped (never discloses another owner's asset URL). Used by
@@ -1336,6 +1406,102 @@ async function resolveMediaAssetUrlsByIds(
   return map;
 }
 
+/**
+ * Reference-mapping fix Phase 5c (`planning/vd-start-frame-reference-mapping/
+ * plan.md`) — resolve a video clip's REQUIRED characters (unioned across
+ * every source shot in `clip.sourceShotNumbers`, deduped, first-appearance
+ * order — a consolidated/speaker-switch clip can span more than one shot) to
+ * their current approved primary-portrait `media_assets` ids, for
+ * `generateVideoClip` to auto-attach as extra video-generation references on
+ * multi-image-reference models. "Required characters" comes from
+ * `startFramePlan.frames[shotNumber].requiredCharacterRefs` — the SAME
+ * ordering-truth source Phase 1 of this plan established for start-frame
+ * image generation — never from the storyboard's own `characterIds` (that
+ * field is DB-order, not authoritative; see this plan's RC1).
+ *
+ * Same portrait-resolution primitive
+ * (`verticalDramaCharacterStockService.getPrimaryPortraitAssetId`) the
+ * 2026-07-11 speaker-switch redesign already uses for
+ * `clip.extraReferenceAssetIds` (~line 6345 of this file), so results stay
+ * consistent with that existing path. Tolerant by design — a character key
+ * with no matching roster row, or no approved portrait yet, is silently
+ * skipped (same convention as `resolveShotVideoPromptCharacterReferenceImages`)
+ * rather than throwing; the caller additionally wraps this whole call in a
+ * try/catch since portrait enrichment must never block a paid render.
+ */
+async function resolveClipRequiredCharacterPortraitAssetIds(
+  tenantId: string,
+  userId: number,
+  seriesId: number,
+  startFramePlan: VerticalDramaStartFramePlan | null,
+  sourceShotNumbers: number[]
+): Promise<number[]> {
+  const frameByShotNumber = new Map(
+    (startFramePlan?.frames ?? []).map(frame => [frame.shotNumber, frame])
+  );
+  const orderedCharacterKeys: string[] = [];
+  const seenCharacterKeys = new Set<string>();
+  for (const shotNumber of sourceShotNumbers) {
+    const requiredCharacterRefs =
+      frameByShotNumber.get(shotNumber)?.requiredCharacterRefs ?? [];
+    for (const characterKey of requiredCharacterRefs) {
+      if (!characterKey || seenCharacterKeys.has(characterKey)) continue;
+      seenCharacterKeys.add(characterKey);
+      orderedCharacterKeys.push(characterKey);
+    }
+  }
+  if (orderedCharacterKeys.length === 0) return [];
+
+  const characterRows = await db
+    .select({
+      id: verticalDramaCharacters.id,
+      characterKey: verticalDramaCharacters.characterKey,
+    })
+    .from(verticalDramaCharacters)
+    .where(
+      and(
+        eq(verticalDramaCharacters.tenantId, tenantId),
+        eq(verticalDramaCharacters.seriesId, seriesId),
+        inArray(verticalDramaCharacters.characterKey, orderedCharacterKeys)
+      )
+    );
+  // Explicit annotations on both the callback param and its tuple return
+  // (rather than the terser `rows.map(row => [row.characterKey, row])` this
+  // file's OTHER `verticalDramaCharacters` queries use) — without them, this
+  // particular `db.select(...).from(verticalDramaCharacters)...` query's
+  // return type does not propagate through `.map()` into `new Map(...)`
+  // (falls back to `{}`/`unknown`), a pre-existing `db`/drizzle
+  // type-inference gap this table already exhibits elsewhere in this file
+  // (see `resolveRequiredShotCharacterAttachmentManifest`'s identical
+  // un-annotated pattern, which has the same gap — untouched here, out of
+  // scope). Annotating both sides here keeps THIS new query's row/map types
+  // sound without touching that pre-existing code.
+  const characterRowByKey: Map<string, { id: number; characterKey: string }> =
+    new Map(
+      characterRows.map(
+        (
+          row: { id: number; characterKey: string }
+        ): [string, { id: number; characterKey: string }] => [
+          row.characterKey,
+          row,
+        ]
+      )
+    );
+
+  const owner = { tenantId, userId, seriesId };
+  const portraitAssetIds: number[] = [];
+  for (const characterKey of orderedCharacterKeys) {
+    const characterRow = characterRowByKey.get(characterKey);
+    if (!characterRow) continue;
+    const assetId = await verticalDramaCharacterStockService.getPrimaryPortraitAssetId(
+      owner,
+      characterRow.id
+    );
+    if (assetId != null) portraitAssetIds.push(assetId);
+  }
+  return portraitAssetIds;
+}
+
 /**
  * Resolve every character in the series to its current approved primary
  * portrait (if any), keyed by `characterKey` — the same key storyboard shots
@@ -1497,17 +1663,147 @@ interface ShotCharacterRefEntry {
   characterKey: string;
 }
 
-// `formatIdentityLockedImagePrompt` (formerly defined here, a near-duplicate
-// of `@shared/verticalDramaSeries/characterIdentityMap.ts`'s canonical copy)
-// was removed (vertical-drama-skill-first-architecture plan, Phase 3, item
-// 2) — its only caller (`generateStartFrameImage`'s `effectiveSoftenLevel
-// === 0` branch) now uses the planning skill's own prompt text unmodified,
-// since `vertical-drama-shot-start-frame-render/skill.md` now authors the
-// full identity-lock constraint itself. `stripExistingIdentityLockSuffix`
-// (imported from the shared module) is UNRELATED and still used below — it
-// is a back-compat safety net that strips a stale bracket-style suffix a
-// PRE-migration stored prompt may still carry, so it is never echoed back as
-// if it were story content.
+interface RequiredShotCharacterAttachmentManifest {
+  primaryEntries: ShotCharacterRefEntry[];
+  supplementaryEntries: ShotCharacterRefEntry[];
+}
+
+/**
+ * Fail-closed character attachment resolver for paid start-frame renders.
+ * Unlike the tolerant prompt-vision resolver below, this restores the exact
+ * requiredCharacterRefs order and rejects missing/duplicate portraits before
+ * credits can be reserved or a provider task can be submitted.
+ */
+async function resolveRequiredShotCharacterAttachmentManifest(
+  tenantId: string,
+  userId: number,
+  seriesId: number,
+  shotNumber: number,
+  characterKeys: string[] | undefined,
+): Promise<RequiredShotCharacterAttachmentManifest> {
+  const orderedKeys = Array.from(
+    new Set((characterKeys ?? []).map(key => key.trim()).filter(Boolean)),
+  );
+  if (orderedKeys.length === 0) {
+    return { primaryEntries: [], supplementaryEntries: [] };
+  }
+
+  const rows = await db
+    .select({
+      id: verticalDramaCharacters.id,
+      name: verticalDramaCharacters.name,
+      characterKey: verticalDramaCharacters.characterKey,
+    })
+    .from(verticalDramaCharacters)
+    .where(
+      and(
+        eq(verticalDramaCharacters.tenantId, tenantId),
+        eq(verticalDramaCharacters.seriesId, seriesId),
+        inArray(verticalDramaCharacters.characterKey, orderedKeys),
+      ),
+    );
+  const rowByKey = new Map(rows.map(row => [row.characterKey, row]));
+  const unknownKeys = orderedKeys.filter(key => !rowByKey.has(key));
+  if (unknownKeys.length > 0) {
+    throw new TRPCError({
+      code: "PRECONDITION_FAILED",
+      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ไม่พบตัวละครในรายการสำหรับ ${unknownKeys.join(", ")}`,
+    });
+  }
+
+  const includeSheets = await resolveVerticalDramaCharacterRefV2Flag(tenantId);
+  const owner = { tenantId, userId, seriesId };
+  const resolved = await Promise.all(
+    orderedKeys.map(async characterKey => {
+      const row = rowByKey.get(characterKey)!;
+      const primaryPortraitUrl =
+        await verticalDramaCharacterStockService.getPrimaryPortraitUrl(owner, row.id);
+      const allReferenceUrls = includeSheets
+        ? await verticalDramaCharacterStockService.getCharacterReferenceUrls(
+            owner,
+            row.id,
+            { includeSheet: true },
+          )
+        : [];
+      const supplementaryUrls = allReferenceUrls.filter(
+        url => Boolean(url) && url !== primaryPortraitUrl,
+      );
+      return { row, primaryPortraitUrl, supplementaryUrls };
+    }),
+  );
+
+  const missingNames = resolved
+    .filter(item => !item.primaryPortraitUrl)
+    .map(item => item.row.name || item.row.characterKey);
+  if (missingNames.length > 0) {
+    throw new TRPCError({
+      code: "PRECONDITION_FAILED",
+      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ไม่พบภาพตัวละครที่อนุมัติแล้วสำหรับ ${missingNames.join(", ")}`,
+    });
+  }
+
+  const primaryEntries = resolved.map(({ row, primaryPortraitUrl }) => ({
+    name: row.name,
+    url: primaryPortraitUrl!,
+    characterKey: row.characterKey,
+  }));
+  if (new Set(primaryEntries.map(entry => entry.url)).size !== primaryEntries.length) {
+    throw new TRPCError({
+      code: "PRECONDITION_FAILED",
+      message: `ยังสร้างภาพช็อต ${shotNumber} ไม่ได้: ตัวละครหลายคนใช้ภาพอ้างอิงเดียวกัน กรุณาตรวจสอบภาพตัวละครก่อน`,
+    });
+  }
+
+  const supplementaryEntries = resolved.flatMap(({ row, supplementaryUrls }) =>
+    supplementaryUrls.map(url => ({
+      name: row.name,
+      url,
+      characterKey: row.characterKey,
+    })),
+  );
+  return { primaryEntries, supplementaryEntries };
+}
+
+function assertRequiredCharacterReferenceCapacity(
+  shotNumber: number,
+  requiredCount: number,
+  maxReferenceImages: number | undefined,
+): void {
+  if (maxReferenceImages === undefined || requiredCount <= maxReferenceImages) return;
+  throw new TRPCError({
+    code: "PRECONDITION_FAILED",
+    message: `โมเดลนี้รองรับภาพอ้างอิงสูงสุด ${maxReferenceImages} ภาพ แต่ช็อต ${shotNumber} ต้องใช้ตัวละคร ${requiredCount} คน กรุณาเลือกโมเดลที่รองรับอย่างน้อย ${requiredCount} ภาพ`,
+  });
+}
+
+/**
+ * `formatIdentityLockedImagePrompt` (formerly defined here, a near-duplicate
+ * of `@shared/verticalDramaSeries/characterIdentityMap.ts`'s canonical copy)
+ * and its `assertRequiredIdentityBlockFits` length-cap guard were removed
+ * again (`planning/vd-start-frame-reference-mapping/plan.md` Phase 3,
+ * 2026-07-16) — a 2026-07-13 uncommitted change had re-added the code-side
+ * bracket append after HEAD's 2026-07-11 skill-first-architecture removal,
+ * which reintroduced RC2: the append's own attachment-order mapping could
+ * silently CONTRADICT the mapping the skill already wrote in its own prose
+ * (observed live, series 16 episode 66 shot 9 — prose said
+ * `"ภาคิน (Image 1)"` / `"ไอริณ (Image 2)"` while the appended tail said
+ * `"Image 1 = ไอริณ; Image 2 = ภาคิน"`). Every call site
+ * (`generateStartFrameImage`, `generateStartFrameAngleVariations`) now uses
+ * the planning/authoring skill's own prompt text UNMODIFIED — since
+ * `vertical-drama-shot-start-frame-render/skill.md` /
+ * `vertical-drama-shot-start-frame-prompt/skill.md` already author the full
+ * identity-lock constraint (including the "Image N ↔ name" mapping) in their
+ * own prose — and instead runs
+ * `findCharacterImageIndexMappingMismatches` (the shared validator) as a
+ * render-time fail-closed guard against the REAL attachment order right
+ * before credits are reserved; see each mutation's own
+ * `referenceMappingMismatches` block below. `stripExistingIdentityLockSuffix`
+ * (imported from the shared module) is UNRELATED and still used below — it
+ * is a back-compat safety net that strips a stale bracket-style suffix a
+ * PRE-migration stored prompt may still carry, so it is never echoed back as
+ * if it were story content (and so it never confuses the new validator with
+ * a legacy code-authored claim).
+ */
 
 async function resolveShotCharacterReferenceEntries(
   tenantId: string,
@@ -1598,6 +1894,48 @@ async function resolveShotCharacterReferenceUrls(
  */
 const VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS = 3;
 
+/**
+ * Re-sort `resolveShotCharacterReferenceEntries`' arbitrary (no-`ORDER BY`)
+ * return value into a caller-supplied `keysInOrder` order, keeping only the
+ * FIRST entry per `characterKey` (always that character's portrait, never a
+ * character-sheet supplementary image — per `resolveShotCharacterReferenceEntries`'s
+ * own "all portraits before any sheets" ordering guarantee). Extracted
+ * (`planning/vd-start-frame-reference-mapping/plan.md` Phase 1, RC1 fix,
+ * 2026-07-16) from `resolveShotVideoPromptCharacterReferenceImages`'s own
+ * inline re-sort so both that function AND `generateShotStartFramePrompt`'s
+ * `character_reference_manifest` builder share exactly one ordering
+ * implementation — the bug this fixes (RC1) was that the start-frame-prompt
+ * path built its manifest straight from the DB's own arbitrary row order
+ * instead of re-sorting like this, so the skill was sometimes told the WRONG
+ * "Image N" index for a character relative to what the paid render actually
+ * attaches later (`resolveRequiredShotCharacterAttachmentManifest`, which
+ * always restores `requiredCharacterRefs` order).
+ *
+ * Defensively de-dupes `keysInOrder` itself too (in case a caller ever
+ * passes the same key twice), so a caller-side cap can never be partly
+ * consumed by the same character appearing more than once. Pure — no I/O.
+ */
+function reorderShotCharacterRefEntriesByKeyOrder(
+  entries: readonly ShotCharacterRefEntry[],
+  keysInOrder: readonly string[],
+): ShotCharacterRefEntry[] {
+  const firstEntryByCharacterKey = new Map<string, ShotCharacterRefEntry>();
+  for (const entry of entries) {
+    if (!firstEntryByCharacterKey.has(entry.characterKey)) {
+      firstEntryByCharacterKey.set(entry.characterKey, entry);
+    }
+  }
+  const ordered: ShotCharacterRefEntry[] = [];
+  const seenCharacterKeys = new Set<string>();
+  for (const characterKey of keysInOrder) {
+    if (seenCharacterKeys.has(characterKey)) continue;
+    seenCharacterKeys.add(characterKey);
+    const entry = firstEntryByCharacterKey.get(characterKey);
+    if (entry) ordered.push(entry);
+  }
+  return ordered;
+}
+
 /**
  * Resolve up to `VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS`
  * character reference portraits for a shot-video-prompt vision call
@@ -1612,17 +1950,12 @@ const VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS = 3;
  *
  * Reuses `resolveShotCharacterReferenceEntries` (no new resolution path) —
  * that function's own return order is NOT reliably `characterKeysInOrder`
- * (the underlying query has no `ORDER BY`), so this re-sorts to match, and
- * keeps only the FIRST entry per `characterKey` (always that character's
- * portrait, never a character-sheet supplementary image, per that
- * function's own "all portraits before any sheets" ordering guarantee).
+ * (the underlying query has no `ORDER BY`), so this re-sorts to match via
+ * `reorderShotCharacterRefEntriesByKeyOrder` above.
  *
  * Never throws for a character with no approved portrait yet — that
  * character is silently omitted from the result, same tolerant convention
- * as `resolveShotLocationReferenceEntry` below. Defensively de-dupes
- * `characterKeysInOrder` itself too (in case a caller ever passes the same
- * key twice), so the 3-slot cap can never be partly consumed by the same
- * character appearing more than once.
+ * as `resolveShotLocationReferenceEntry` below.
  */
 async function resolveShotVideoPromptCharacterReferenceImages(
   tenantId: string,
@@ -1638,27 +1971,14 @@ async function resolveShotVideoPromptCharacterReferenceImages(
     seriesId,
     characterKeysInOrder
   );
-  const firstEntryByCharacterKey = new Map<string, ShotCharacterRefEntry>();
-  for (const entry of entries) {
-    if (!firstEntryByCharacterKey.has(entry.characterKey)) {
-      firstEntryByCharacterKey.set(entry.characterKey, entry);
-    }
-  }
-  const ordered: ShotVideoPromptCharacterReferenceImage[] = [];
-  const seenCharacterKeys = new Set<string>();
-  for (const characterKey of characterKeysInOrder) {
-    if (seenCharacterKeys.has(characterKey)) continue;
-    seenCharacterKeys.add(characterKey);
-    const entry = firstEntryByCharacterKey.get(characterKey);
-    if (!entry) continue;
-    ordered.push({
-      characterKey,
+  const ordered = reorderShotCharacterRefEntriesByKeyOrder(entries, characterKeysInOrder);
+  return ordered
+    .slice(0, VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS)
+    .map((entry) => ({
+      characterKey: entry.characterKey,
       name: entry.name,
       url: resolveReferenceUrl(entry.url, publicUrl),
-    });
-    if (ordered.length >= VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS) break;
-  }
-  return ordered;
+    }));
 }
 
 /**
@@ -2507,34 +2827,68 @@ function shouldRegenerateDialogueForVideoPrompt(input: {
 
 /**
  * Resolve the effective image model for a start-frame generation call:
- * episode-level `startFramePlan.selectedImageModelId` (Phase 1.2 resolution
- * order: episode selection → `DEFAULT_MODELS`), falling back to
- * `DEFAULT_MODELS.image` when the plan has no selection yet OR the selected
- * model is no longer enabled (fails closed to a known-good default rather
- * than submitting a generation call with a dead model id). Shared by
- * `generateStartFrameImage` and `generateStartFrameAngleVariations` so both
- * call sites — and their credit pricing — stay in sync with the same
- * resolution.
+ * episode-level `startFramePlan.selectedImageModelId`. FAIL CLOSED: throws
+ * `TRPCError BAD_REQUEST` when the plan has no selection yet OR the
+ * selected model is unknown/no longer enabled — no silent fallback to
+ * `DEFAULT_MODELS.image`. (Previously fell back silently, letting
+ * generation run on a model the user never chose.) Shared by
+ * `generateStartFrameImage`, `generateStartFrameAngleVariations`, and
+ * `repairShotImage` — all user-clicked paid actions — so both the throw and
+ * the credit pricing stay in sync with the same resolution.
  */
 export async function resolveEpisodeImageModelId(
   plan: VerticalDramaStartFramePlan | null
 ): Promise<string> {
   const requested = plan?.selectedImageModelId?.trim();
-  if (!requested) return DEFAULT_MODELS.image;
+  if (!requested) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "กรุณาเลือกโมเดลภาพก่อนสร้าง / Select an image model before generating.",
+    });
+  }
   const models = await getModelsByTypeAsync("image");
   const model = models.find(m => m.id === requested);
-  if (!model || model.isEnabled === false) return DEFAULT_MODELS.image;
+  if (!model) {
+    // Cold-start / transient-DB guard: when the DB-backed model catalog is not
+    // loaded, `getModelsByType` serves only the small static fallback subset
+    // (no DB-only models like the higgsfield catalog). Do NOT reject a model we
+    // simply cannot verify yet — trust the user's persisted selection and let
+    // the downstream generation validate it, rather than either falsely erroring
+    // ("pick another") or silently swapping to DEFAULT_MODELS.
+    if (!isDbModelCatalogLoaded()) {
+      return requested;
+    }
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message:
+        "โมเดลภาพที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected image model is unavailable; pick another.",
+    });
+  }
+  if (model.isEnabled === false) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message:
+        "โมเดลภาพที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected image model is unavailable; pick another.",
+    });
+  }
   return model.id;
 }
 
 /**
  * Resolve the effective video model DEFINITION (not just the id) for a video
- * clip generation call: episode-level `motionPromptPack.selectedVideoModelId`
- * (Phase 1.2 resolution order: episode selection → `DEFAULT_MODELS`), falling
- * back to `DEFAULT_MODELS.video` when the pack has no selection yet OR the
- * selected model is no longer enabled — same fail-closed convention as
- * `resolveEpisodeImageModelId`. Returns the full `ModelDefinition` (not just
- * the id) because `formatVideoClipRequest` needs the capability metadata
+ * clip generation call: episode-level `motionPromptPack.selectedVideoModelId`.
+ *
+ * Feature 135 — Hermes Grok media worker (section 09, remediation row 9):
+ * FAIL CLOSED, same convention as `resolveEpisodeImageModelId` above — this
+ * doc comment previously CLAIMED that fail-closed symmetry while the
+ * function body actually did the opposite (silently substituted
+ * `DEFAULT_MODELS.video`, and even manufactured a synthetic last-resort
+ * `ModelDefinition` when that lookup failed too) — that mismatch was the
+ * bug's camouflage. There is now no fallback of any kind: an empty/absent
+ * selection, an unknown model id, or a disabled model all throw
+ * `TRPCError({code:"BAD_REQUEST"})`. `DEFAULT_MODELS.video` is never
+ * consulted. Returns the full `ModelDefinition` (not just the id) because
+ * `formatVideoClipRequest` needs the capability metadata
  * (`configJson`/`aspectRatios`/`provider`/`aliases`) to resolve
  * `nativeAudioDialogue`/`maxReferenceImages` for the requested model — a
  * second lookup by id would risk resolving a DIFFERENT model if the catalog
@@ -2543,25 +2897,45 @@ export async function resolveEpisodeImageModelId(
 export async function resolveEpisodeVideoModel(
   pack: VerticalDramaMotionPromptPack | null
 ): Promise<import("../services/modelRegistry").ModelDefinition> {
-  const models = await getModelsByTypeAsync("video");
   const requested = pack?.selectedVideoModelId?.trim();
-  if (requested) {
-    const model = models.find(m => m.id === requested);
-    if (model && model.isEnabled !== false) return model;
+  if (!requested) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง / Select a video model before generating.",
+    });
   }
-  const fallback = models.find(m => m.id === DEFAULT_MODELS.video);
-  if (fallback) return fallback;
-  // Extremely defensive last resort — the catalog should always contain
-  // `DEFAULT_MODELS.video`, but never throw out of a resolution helper.
-  return {
-    id: DEFAULT_MODELS.video,
-    type: "video",
-    name: DEFAULT_MODELS.video,
-    provider: "unknown",
-    description: "",
-    aliases: [],
-    creditCost: 10,
-  };
+  const models = await getModelsByTypeAsync("video");
+  const model = models.find(m => m.id === requested);
+  if (!model) {
+    // Cold-start / transient-DB guard — same convention as
+    // `resolveEpisodeImageModelId`/`resolveCharacterImageModelId`: when the
+    // DB-backed model catalog is not loaded yet, trust the caller's
+    // persisted selection rather than falsely rejecting it as "unknown".
+    if (!isDbModelCatalogLoaded()) {
+      return {
+        id: requested,
+        type: "video",
+        name: requested,
+        provider: "unknown",
+        description: "",
+        aliases: [],
+        creditCost: 10,
+      };
+    }
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message:
+        "โมเดลวิดีโอที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected video model is unavailable; pick another.",
+    });
+  }
+  if (model.isEnabled === false) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message:
+        "โมเดลวิดีโอที่เลือกใช้ไม่ได้ กรุณาเลือกใหม่ / Selected video model is unavailable; pick another.",
+    });
+  }
+  return model;
 }
 
 /**
@@ -2605,6 +2979,7 @@ async function resolveVdMcpTransportMetadata(params: {
   modelId: string;
   configJson: Record<string, unknown> | null;
   mcpConnectionId?: string;
+  sharedGroupId?: number;
   idempotencyKey?: string;
 }): Promise<MediaTaskTransportMetadata | null> {
   const modelTransport = resolveMediaModelTransportConfig({
@@ -2636,13 +3011,12 @@ async function resolveVdMcpTransportMetadata(params: {
       argumentShape,
     }) ?? rawProviderModelId;
 
-  if (!params.mcpConnectionId) {
-    throw new TRPCError({
-      code: "BAD_REQUEST",
-      message: `"${params.modelId}" requires a connected MCP provider account. Connect a ${providerKey} MCP account first, then re-select this model.`,
-    });
-  }
-
+  // NOTE: deliberately no "mcpConnectionId is required" pre-check here.
+  // `resolveMediaTransport` auto-resolves the caller's own eligible connection
+  // when the client doesn't pin one (the picker fills it in asynchronously and
+  // its localStorage cache silently no-ops on full storage, so a null id here
+  // does NOT mean the user lacks an account), and raises a precise error itself
+  // when there genuinely is none / the choice is ambiguous.
   return resolveMediaTransport({
     tenantId: params.tenantId,
     actorUserId: params.actorUserId,
@@ -2650,6 +3024,7 @@ async function resolveVdMcpTransportMetadata(params: {
     assetType: params.assetType,
     requestedTransport: "mcp",
     mcpConnectionId: params.mcpConnectionId,
+    sharedGroupId: params.sharedGroupId,
     providerKey,
     providerModelId,
     model: providerModelId ?? params.modelId,
@@ -2659,6 +3034,105 @@ async function resolveVdMcpTransportMetadata(params: {
   });
 }
 
+/**
+ * Feature 135 — Hermes Grok media worker (section 09): private twin of
+ * `verticalDramaCharacters.ts`'s exported `resolveVdCharacterMediaTransportDecision`
+ * — byte-equivalent apart from the export keyword and the delegate call
+ * (this file's own private `resolveVdMcpTransportMetadata` above, instead of
+ * that file's exported one). See that function's doc comment for the full
+ * design rationale (detect hermes_worker FIRST, delegate everything else to
+ * the existing MCP helper unchanged).
+ */
+type VdTransportDecision =
+  | { kind: "gateway" }
+  | { kind: "mcp"; transportMetadata: MediaTaskTransportMetadata }
+  | { kind: "hermes"; connectionId: string };
+
+interface ResolveVdMediaTransportDecisionDeps {
+  resolveDefaultHermesConnectionId?: (params: {
+    tenantId: string;
+    userId: number;
+    assetType: "image" | "video";
+  }) => Promise<string | null>;
+}
+
+async function defaultResolveDefaultHermesConnectionIdForEpisodes(params: {
+  tenantId: string;
+  userId: number;
+  assetType: "image" | "video";
+}): Promise<string | null> {
+  const { listHermesConnections } = await import("../services/hermesConnectionService");
+  const connections = await listHermesConnections({
+    tenantId: params.tenantId,
+    userId: params.userId,
+    assetType: params.assetType,
+  });
+  const defaultConnection = connections.find(connection =>
+    params.assetType === "image" ? connection.defaultForImage : connection.defaultForVideo,
+  );
+  return defaultConnection?.id ?? null;
+}
+
+async function resolveVdMediaTransportDecision(
+  params: {
+    tenantId: string;
+    actorUserId: number;
+    assetType: "image" | "video";
+    modelId: string;
+    configJson: Record<string, unknown> | null;
+    mcpConnectionId?: string;
+    sharedGroupId?: number;
+    hermesConnectionId?: string;
+    idempotencyKey?: string;
+  },
+  deps: ResolveVdMediaTransportDecisionDeps = {},
+): Promise<VdTransportDecision> {
+  const modelTransport = resolveMediaModelTransportConfig({
+    modelId: params.modelId,
+    configJson: params.configJson,
+  });
+
+  if (modelTransport.transport === "hermes_worker") {
+    const explicitConnectionId = params.hermesConnectionId?.trim();
+    if (explicitConnectionId) {
+      return { kind: "hermes", connectionId: explicitConnectionId };
+    }
+    const resolveDefault =
+      deps.resolveDefaultHermesConnectionId ?? defaultResolveDefaultHermesConnectionIdForEpisodes;
+    const defaultConnectionId = await resolveDefault({
+      tenantId: params.tenantId,
+      userId: params.actorUserId,
+      assetType: params.assetType,
+    });
+    if (defaultConnectionId) {
+      return { kind: "hermes", connectionId: defaultConnectionId };
+    }
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED"),
+    });
+  }
+
+  if (params.hermesConnectionId?.trim()) {
+    throw new TRPCError({
+      code: "BAD_REQUEST",
+      message: "hermesConnectionId requires transport=hermes_worker",
+    });
+  }
+
+  const transportMetadata = await resolveVdMcpTransportMetadata({
+    tenantId: params.tenantId,
+    actorUserId: params.actorUserId,
+    assetType: params.assetType,
+    modelId: params.modelId,
+    configJson: params.configJson,
+    mcpConnectionId: params.mcpConnectionId,
+    sharedGroupId: params.sharedGroupId,
+    idempotencyKey: params.idempotencyKey,
+  });
+  return transportMetadata ? { kind: "mcp", transportMetadata } : { kind: "gateway" };
+}
+
 /**
  * Insert one new episode row, safely assigning the next episode number.
  * Extracted from `createEpisode` (spec Tests) so every episode-creating
@@ -4074,7 +4548,14 @@ export interface VerticalDramaEpisodePlanSummary {
   keyBeats: string[];
   cliffhangerLine: string | null;
   /** Latest Overview shot summaries; omitted when the active item has no deep draft. */
-  shotDrafts?: Array<{ shotNumber: number; summary: string }>;
+  shotDrafts?: Array<{
+    shotNumber: number;
+    summary: string;
+    /** Canonical per-shot dialogue (speaker/line only); [] when the shot has none. */
+    dialogueLines: Array<{ speaker: string; line: string }>;
+    /** Present only for wordless shots (e.g. "action_visual", "establishing"). */
+    silenceIntent?: string;
+  }>;
 }
 
 /**
@@ -4128,6 +4609,11 @@ async function resolveEpisodePlanForEpisode(
             shotDrafts: shotDrafts.map(shot => ({
               shotNumber: shot.shot_number,
               summary: shot.summary,
+              dialogueLines: (shot.dialogue_lines ?? []).map(line => ({
+                speaker: line.speaker,
+                line: line.line,
+              })),
+              ...(shot.silence_intent ? { silenceIntent: shot.silence_intent } : {}),
             })),
           }
         : {}),
@@ -5892,6 +6378,35 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
   storyboardShot: VerticalDramaShotgrid["shots"][number] | undefined;
   shotVideoCharacterIdentityMapBlock: string | undefined;
   dialogueLines: ShotDialogueLine[];
+  /**
+   * Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
+   * Phase 1a) — the CALLER's already-resolved
+   * `deepDraftShotForDialogue?.summary`, mirrored straight into
+   * `GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams.shotContext
+   * .canonicalShotSummary`. Optional/omitted preserves today's byte-
+   * identical prompt (every caller before this fix).
+   */
+  canonicalShotSummary?: string;
+  /**
+   * Persistence/pin root-cause fix (`planning/vd-video-prompt-skill-first/
+   * plan.md` Phase 2) — the CALLER's already-resolved
+   * `deepDraftShotForDialogue?.silence_intent` truthiness, mirrored into
+   * `shotContext.beatIsSilent`. In practice this split path only runs when
+   * `dialogueLines` requires cutting between 2-3 speakers, so a genuinely
+   * silent shot never reaches this branch — kept purely for shape symmetry
+   * with the non-split path. Optional/omitted (`false`) preserves today's
+   * byte-identical prompt.
+   */
+  beatIsSilent?: boolean;
+  /**
+   * Lip-sync discipline fix — `characterKey -> roster display name`,
+   * pre-resolved by the CALLER from the identity sources it already fetched
+   * for `shotVideoCharacterIdentityMapBlock` above (no new DB query here).
+   * Used to attribute each dialogue line to its speaker by name in the
+   * native-audio lip-sync block (`@shared/verticalDramaSeries/nativeDialogue.ts`).
+   * Optional/omitted falls back to bare `characterKey` attribution.
+   */
+  characterNameByKey?: Map<string, string>;
   tieInPlacement: VerticalDramaShotProductPlacement | undefined;
   tieInProductName: string | undefined;
   tieInProductCategory: string | undefined;
@@ -5946,6 +6461,9 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
     storyboardShot,
     shotVideoCharacterIdentityMapBlock,
     dialogueLines,
+    canonicalShotSummary,
+    beatIsSilent,
+    characterNameByKey,
     tieInPlacement,
     tieInProductName,
     tieInProductCategory,
@@ -5962,6 +6480,13 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
     repairInstruction,
   } = args;
 
+  // Lip-sync discipline fix — same speaker-attribution mirror convention as
+  // the non-split path in `generateShotVideoPrompt` above.
+  const dialogueLinesWithSpeakerNames = dialogueLines.map(l => ({
+    ...l,
+    speakerName: l.characterKey ? characterNameByKey?.get(l.characterKey) : undefined,
+  }));
+
   const speakerSwitchGeneration = await generateVerticalDramaShotVideoPromptSpeakerSwitch({
     userId,
     tenantId,
@@ -5973,10 +6498,12 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
     characterReferenceImages,
     locationReferenceImage,
     shotContext: {
+      canonicalShotSummary,
+      beatIsSilent,
       description: storyboardShot?.description,
       camera: storyboardShot?.cameraSetup,
       emotion: undefined,
-      dialogueLines: dialogueLines.length ? dialogueLines : undefined,
+      dialogueLines: dialogueLines.length ? dialogueLinesWithSpeakerNames : undefined,
       characterIdentityMap: shotVideoCharacterIdentityMapBlock,
       productContext: tieInPlacement
         ? {
@@ -6020,9 +6547,42 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
       );
     }
   }
+  const { presetMixV2Enabled } = await resolveVerticalDramaQualityLoopFlags(tenantId);
+  if (presetMixV2Enabled) {
+    const presetVisualIdentity = await loadSeriesPresetVisualIdentity(tenantId, userId, seriesId);
+    if (presetVisualIdentity) {
+      prompt = appendPresetVisualIdentityStyleTokensToMotionPrompt(prompt, presetVisualIdentity);
+    }
+  }
+  const speakerSwitchCapabilities = resolveVerticalDramaCapabilities(selectedVideoModel.id, {
+    type: selectedVideoModel.type,
+    aspectRatios: selectedVideoModel.aspectRatios,
+    configJson: selectedVideoModel.configJson,
+  });
   const qc = await ensurePromptWithinLimit({
     kind: "video",
     prompt,
+    // Dialogue-duplication fix (2026-07-15) — protect each individual
+    // spoken line (not the `buildNativeDialogueVerbatimBlock` boilerplate
+    // block). The refiner already keeps dialogue inline/verbatim while
+    // compressing, so protecting the block caused it to be re-appended a
+    // SECOND time on top of the refiner's inline lines whenever the prompt
+    // was over the length cap. Protecting the bare quoted line lets
+    // `finalizeProtectedFragments` recognize the refiner's inline dialogue
+    // as already-present (no duplicate) and only re-append a genuinely
+    // dropped line, as a single bare quoted line — never the block.
+    protectedFragments:
+      speakerSwitchCapabilities.nativeAudioDialogue === true
+        ? speakerSwitchGeneration.dialogue
+            .map(l => l.lineTh.trim())
+            // BARE, UNQUOTED line text — do NOT wrap in `"..."`.
+            // finalizeProtectedFragments matches via a raw `indexOf`, and the
+            // skill/refiner writes inline dialogue in CURLY quotes; a
+            // straight-quoted fragment never matches inline, so it gets wrongly
+            // re-appended (dialogue-duplication regression, 2026-07-15). The
+            // unquoted line is found inside the curly-quoted inline text.
+            .filter(Boolean)
+        : undefined,
     userId,
     tenantId,
     seriesId,
@@ -6031,14 +6591,6 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
   });
   prompt = qc.prompt;
 
-  const { presetMixV2Enabled } = await resolveVerticalDramaQualityLoopFlags(tenantId);
-  if (presetMixV2Enabled) {
-    const presetVisualIdentity = await loadSeriesPresetVisualIdentity(tenantId, userId, seriesId);
-    if (presetVisualIdentity) {
-      prompt = appendPresetVisualIdentityStyleTokensToMotionPrompt(prompt, presetVisualIdentity);
-    }
-  }
-
   // Resolve every distinct speaker's own approved primary-portrait media
   // asset id, in `distinctSpeakerCharacterKeys` order (anchor speaker
   // first) — anchor becomes `startFrameAssetId`, the rest become
@@ -6158,8 +6710,14 @@ async function generateAndPersistSplitShotVideoPrompt(args: {
 
     await tx
       .update(verticalDramaEpisodes)
-      .set({ motionPromptPack: updatedPack, updatedAt: new Date() })
-      .where(
+      .set({
+        motionPromptPack: stampArtifactForStoryboard(
+          updatedPack as unknown as Record<string, unknown>,
+          row.storyboard,
+        ),
+        updatedAt: new Date(),
+      })
+      .where(
         and(
           eq(verticalDramaEpisodes.id, episodeId),
           eq(verticalDramaEpisodes.tenantId, tenantId),
@@ -6265,7 +6823,7 @@ export const verticalDramaEpisodesRouter = router({
     .input(
       z.object({
         seriesId: z.string().min(1),
-        count: z.number().int().min(1).max(5).default(1),
+        count: z.number().int().min(1).max(1000).default(1),
       })
     )
     .mutation(async ({ ctx, input }) => {
@@ -6656,22 +7214,55 @@ export const verticalDramaEpisodesRouter = router({
         episodeId: parseId(input.episodeId, "episode id"),
       };
       // Confirm ownership (throws NOT_FOUND otherwise).
-      await loadOwnedEpisode(owner);
+      const existingEpisode = await loadOwnedEpisode(owner);
 
       const updates: Partial<typeof verticalDramaEpisodes.$inferInsert> = {
         updatedAt: new Date(),
       };
       if (input.title !== undefined) updates.title = input.title;
       if (input.script !== undefined) updates.script = input.script;
-      if (input.storyboard !== undefined) updates.storyboard = input.storyboard;
+      const effectiveStoryboard =
+        input.storyboard && typeof input.storyboard === "object"
+          ? stampStoryboardRevision(input.storyboard)
+          : input.storyboard !== undefined
+            ? input.storyboard
+            : existingEpisode.storyboard;
+      if (input.storyboard !== undefined) updates.storyboard = effectiveStoryboard;
       if (input.startFramePlan !== undefined)
-        updates.startFramePlan = input.startFramePlan;
+        updates.startFramePlan = input.startFramePlan && effectiveStoryboard
+          ? stampArtifactForStoryboard(input.startFramePlan, effectiveStoryboard)
+          : input.startFramePlan;
       if (input.dialogueAudioPlan !== undefined)
         updates.dialogueAudioPlan = input.dialogueAudioPlan;
       if (input.motionPromptPack !== undefined)
-        updates.motionPromptPack = input.motionPromptPack;
+        updates.motionPromptPack = input.motionPromptPack && effectiveStoryboard
+          ? stampArtifactForStoryboard(input.motionPromptPack, effectiveStoryboard)
+          : input.motionPromptPack;
       if (input.assemblyManifest !== undefined)
-        updates.assemblyManifest = input.assemblyManifest;
+        updates.assemblyManifest = input.assemblyManifest && effectiveStoryboard
+          ? stampArtifactForStoryboard(input.assemblyManifest, effectiveStoryboard)
+          : input.assemblyManifest;
+
+      if (input.storyboard !== undefined) {
+        if (input.startFramePlan === undefined) {
+          updates.startFramePlan = markArtifactStale(
+            existingEpisode.startFramePlan,
+            existingEpisode.storyboard,
+          );
+        }
+        if (input.motionPromptPack === undefined) {
+          updates.motionPromptPack = markArtifactStale(
+            existingEpisode.motionPromptPack,
+            existingEpisode.storyboard,
+          );
+        }
+        if (input.assemblyManifest === undefined) {
+          updates.assemblyManifest = markArtifactStale(
+            existingEpisode.assemblyManifest,
+            existingEpisode.storyboard,
+          );
+        }
+      }
 
       const [row] = await db
         .update(verticalDramaEpisodes)
@@ -6730,8 +7321,10 @@ export const verticalDramaEpisodesRouter = router({
       };
 
       // Ownership check happens before the transaction so a cross-tenant or
-      // cross-user request cannot use the row lock as an existence oracle.
-      await loadOwnedEpisode(owner);
+      // cross-user request cannot use the row lock as an existence oracle. The
+      // returned row also supplies the storyboard used to stamp artifact
+      // provenance below (same convention as the sibling motion-pack writers).
+      const ownedEpisode = await loadOwnedEpisode(owner);
 
       const persisted = await db.transaction(async tx => {
         const [freshRow] = await tx
@@ -6766,7 +7359,13 @@ export const verticalDramaEpisodesRouter = router({
 
         await tx
           .update(verticalDramaEpisodes)
-          .set({ motionPromptPack: updatedPack, updatedAt: new Date() })
+          .set({
+            motionPromptPack: stampArtifactForStoryboard(
+              updatedPack as unknown as Record<string, unknown>,
+              ownedEpisode.storyboard,
+            ),
+            updatedAt: new Date(),
+          })
           .where(
             and(
               eq(verticalDramaEpisodes.id, owner.episodeId),
@@ -7864,8 +8463,26 @@ export const verticalDramaEpisodesRouter = router({
           string,
           unknown
         > | null,
+        artifactProvenance: {
+          startFramePlan: storyboardArtifactStatus(row.startFramePlan, row.storyboard),
+          motionPromptPack: storyboardArtifactStatus(row.motionPromptPack, row.storyboard),
+          assemblyManifest: storyboardArtifactStatus(row.assemblyManifest, row.storyboard),
+        },
         qualityReview,
         assetUrls,
+        // Reference-mapping fix Phase 5d (`vd-start-frame-reference-mapping/
+        // plan.md`) — resolved `{ mediaAssetId, url }[]` per shot number for
+        // each frame's persisted `angleGridAssetIds` (backup alternate-angle
+        // stills recorded via `recordShotAngleGridAsset`). `{}` for an
+        // episode with no shot carrying any recorded angle-grid assets yet
+        // (grandfathered — every frame predating this field is simply
+        // absent as a key). See `buildAngleGridAssetsByShotNumber`'s doc
+        // comment for why this reuses `assetUrls`'s existing batch query
+        // instead of a new one.
+        angleGridAssetsByShotNumber: buildAngleGridAssetsByShotNumber(
+          row.startFramePlan as VerticalDramaStartFramePlan | null,
+          assetUrls
+        ),
         characterPortraits,
         // Part A1 (planning/`polished-toasting-gadget.md`) — read-only
         // episode plan for the new plan panel; `null` when the series bible
@@ -8237,6 +8854,148 @@ export const verticalDramaEpisodesRouter = router({
       return { startFramePlan: updatedPlan, assetUrls };
     }),
 
+  /**
+   * Reference-mapping fix Phase 5d (`planning/vd-start-frame-reference-
+   * mapping/plan.md`) — persist a durable "backup alternate-angle still" for
+   * one shot, sourced from an already-completed media task (typically one
+   * tile of the existing `generateStartFrameAngleVariations` 3x3 grid, or any
+   * other approved Media History/Library image the user picks). This is the
+   * asset SOURCE the reshoot/repair research finding (c) in this plan's
+   * Phase 5 identified: a drifted shot's start frame can be regenerated from
+   * a stored alternate angle instead of a brand-new render. A pure,
+   * no-cost, no-LLM data patch — same "verify ownership, find-or-reject the
+   * matching frame, patch one field, write the whole jsonb column back"
+   * convention as `setApprovedStartFrameAsset` immediately above (id
+   * parsing, `mediaAssets` ownership check, and "no plan yet" /
+   * "no frame entry" error handling are all reused verbatim from that
+   * mutation).
+   *
+   * Additive-only append: `frame.angleGridAssetIds` grows by one call at a
+   * time (never a full-array replacement, unlike `setShotCharacterReference`/
+   * `setShotLocation`), deduplicated (re-recording an asset already present
+   * moves it to the MOST-RECENT position instead of creating a duplicate
+   * entry) and capped at the 5 most recent entries — the OLDEST is dropped
+   * once a 6th is recorded, so this can be called an unbounded number of
+   * times across a shot's lifetime (e.g. once per multi-angle grid render)
+   * without the jsonb column growing unbounded.
+   */
+  recordShotAngleGridAsset: verticalDramaProcedure
+    .input(
+      z.object({
+        seriesId: z.string().min(1),
+        episodeId: z.string().min(1),
+        shotNumber: z.number().int().positive(),
+        mediaAssetId: z.string().min(1),
+        // Accepted for API-shape consistency with this router's other
+        // client-mutation calls; this is a free, no-credit, purely additive
+        // data patch (idempotent by construction via the dedupe-then-append
+        // logic below), so — unlike the paid `generateVideoClip`/
+        // `generateStartFrameImage` mutations — nothing here actually reads
+        // it.
+        idempotencyKey,
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const episodeId = parseId(input.episodeId, "episode id");
+      const row = await loadOwnedEpisode({
+        tenantId,
+        userId,
+        seriesId,
+        episodeId,
+      });
+
+      const numericAssetId = Number(input.mediaAssetId);
+      if (!Number.isInteger(numericAssetId) || numericAssetId <= 0) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "Invalid media asset id",
+        });
+      }
+      const [asset] = await db
+        .select({ id: mediaAssets.id })
+        .from(mediaAssets)
+        .where(
+          and(
+            eq(mediaAssets.id, numericAssetId),
+            eq(mediaAssets.tenantId, tenantId),
+            eq(mediaAssets.userId, userId)
+          )
+        )
+        .limit(1);
+      if (!asset) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Media asset not found",
+        });
+      }
+
+      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
+      if (!plan || !Array.isArray(plan.frames)) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: "No start-frame plan exists yet for this episode",
+        });
+      }
+      const frameIndex = plan.frames.findIndex(
+        f => f.shotNumber === input.shotNumber
+      );
+      if (frameIndex === -1) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: `No start-frame plan entry for shot ${input.shotNumber}`,
+        });
+      }
+
+      // Dedupe (re-recording an already-present id promotes it to
+      // most-recent instead of duplicating), append, then cap at the 5 MOST
+      // RECENT entries — `.slice(-5)` keeps the tail (newest) and drops the
+      // oldest once the list would exceed 5.
+      const existingAngleGridAssetIds =
+        plan.frames[frameIndex]?.angleGridAssetIds ?? [];
+      const updatedAngleGridAssetIds = [
+        ...existingAngleGridAssetIds.filter(id => id !== numericAssetId),
+        numericAssetId,
+      ].slice(-5);
+
+      const updatedFrames = plan.frames.slice();
+      updatedFrames[frameIndex] = {
+        ...updatedFrames[frameIndex],
+        angleGridAssetIds: updatedAngleGridAssetIds,
+      };
+      const updatedPlan: VerticalDramaStartFramePlan = {
+        ...plan,
+        frames: updatedFrames,
+      };
+
+      await db
+        .update(verticalDramaEpisodes)
+        .set({ startFramePlan: updatedPlan, updatedAt: new Date() })
+        .where(eq(verticalDramaEpisodes.id, episodeId));
+
+      const urlsByAssetId = await resolveMediaAssetUrlsByIds(
+        tenantId,
+        userId,
+        updatedAngleGridAssetIds
+      );
+      const angleGridAssets = updatedAngleGridAssetIds
+        .map(mediaAssetId => {
+          const url = urlsByAssetId.get(mediaAssetId);
+          return url ? { mediaAssetId, url } : null;
+        })
+        .filter((entry): entry is { mediaAssetId: number; url: string } =>
+          Boolean(entry)
+        );
+
+      return {
+        startFramePlan: updatedPlan,
+        angleGridAssetIds: updatedAngleGridAssetIds,
+        angleGridAssets,
+      };
+    }),
+
   /**
    * Manually override which character(s) — or which specific
    * variant/age-stage/twin `characterKey` of a character — are used as the
@@ -8277,22 +9036,18 @@ export const verticalDramaEpisodesRouter = router({
         episodeId,
       });
 
-      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
-      if (!plan || !Array.isArray(plan.frames)) {
-        throw new TRPCError({
-          code: "PRECONDITION_FAILED",
-          message: "No start-frame plan exists yet for this episode",
-        });
-      }
-      const frameIndex = plan.frames.findIndex(
-        f => f.shotNumber === input.shotNumber
-      );
-      if (frameIndex === -1) {
-        throw new TRPCError({
-          code: "NOT_FOUND",
-          message: `No start-frame plan entry for shot ${input.shotNumber}`,
-        });
-      }
+      // The per-shot character-reference override must be settable BEFORE the
+      // start-frame plan/prompt is generated — e.g. to add a manually-created
+      // character (like a freshly added roster member) to a shot that has no
+      // image prompt yet. This used to throw "No start-frame plan entry for
+      // shot N". Instead, create a minimal plan/frame when missing; the empty
+      // `imagePrompt` is authored later by the normal per-shot generation,
+      // which reads this `requiredCharacterRefs`.
+      const existingPlan = row.startFramePlan as VerticalDramaStartFramePlan | null;
+      const basePlan: VerticalDramaStartFramePlan =
+        existingPlan && Array.isArray(existingPlan.frames)
+          ? existingPlan
+          : { mode: "single_frame_per_shot", selectedImageModelId: "", frames: [] };
 
       // Every requested characterKey must exist in this series' roster —
       // reject unknown keys instead of silently persisting garbage that
@@ -8321,13 +9076,41 @@ export const verticalDramaEpisodesRouter = router({
         }
       }
 
-      const updatedFrames = plan.frames.slice();
-      updatedFrames[frameIndex] = {
-        ...updatedFrames[frameIndex],
-        requiredCharacterRefs: input.characterRefs,
-      };
+      const frameIndex = basePlan.frames.findIndex(
+        f => f.shotNumber === input.shotNumber
+      );
+      const updatedFrames = basePlan.frames.slice();
+      if (frameIndex === -1) {
+        updatedFrames.push({
+          shotNumber: input.shotNumber,
+          imagePrompt: "",
+          negativePrompt: "",
+          requiredCharacterRefs: input.characterRefs,
+          productReferenceAssetIds: [],
+        });
+        updatedFrames.sort((a, b) => a.shotNumber - b.shotNumber);
+      } else {
+        // If the character set actually changed (membership OR order), any
+        // explicit "Image N = character" mapping baked into the stored prompt
+        // is now stale — the start-frame image generator fail-closes on it
+        // (see `findCharacterImageIndexMappingMismatches`). Clear the stale
+        // prompt so the shot reads as "needs a fresh prompt" rather than a
+        // broken one that only fails at image-generation time.
+        const priorRefs = updatedFrames[frameIndex].requiredCharacterRefs ?? [];
+        const refsChanged =
+          priorRefs.length !== input.characterRefs.length ||
+          priorRefs.some((k, i) => k !== input.characterRefs[i]);
+        const clearStalePrompt =
+          refsChanged &&
+          (updatedFrames[frameIndex].imagePrompt ?? "").trim().length > 0;
+        updatedFrames[frameIndex] = {
+          ...updatedFrames[frameIndex],
+          requiredCharacterRefs: input.characterRefs,
+          ...(clearStalePrompt ? { imagePrompt: "", negativePrompt: "" } : {}),
+        };
+      }
       const updatedPlan: VerticalDramaStartFramePlan = {
-        ...plan,
+        ...basePlan,
         frames: updatedFrames,
       };
 
@@ -8444,6 +9227,48 @@ export const verticalDramaEpisodesRouter = router({
       return { startFramePlan: updatedPlan };
     }),
 
+  /**
+   * Repair missing per-shot character reference slots — scans every shot's
+   * resolved dialogue speakers (`resolveShotDialogueLines`, the same
+   * fallback chain the per-shot start-frame/video prompt generators use)
+   * and UNION-merges any roster `characterKey` a speaker resolves to into
+   * that shot's `requiredCharacterRefs`, creating a minimal frame when a
+   * shot has none yet. Never removes an existing ref/character. All real
+   * logic lives in `verticalDramaShotCharacterRepair.ts` (this file is huge
+   * and concurrently edited) — this is a thin auth/ownership wrapper only.
+   */
+  repairEpisodeShotCharacterReferences: verticalDramaProcedure
+    .input(
+      z.object({
+        seriesId: z.string().min(1),
+        episodeId: z.string().min(1),
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const episodeId = parseId(input.episodeId, "episode id");
+
+      const { repairEpisodeShotCharacterReferences: runRepair } = await import(
+        "../services/verticalDramaShotCharacterRepair"
+      );
+      try {
+        return await runRepair({ tenantId, userId, seriesId, episodeId });
+      } catch (err) {
+        if (err instanceof Error && err.message.includes("not found")) {
+          throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
+        }
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message:
+            err instanceof Error
+              ? err.message
+              : "Failed to repair missing shot characters",
+        });
+      }
+    }),
+
   /**
    * Set the episode-level image/video model selection (Vertical Drama
    * Storyboard Completion Plan, Phase 1.1). Deliberately EPISODE-level only —
@@ -8668,7 +9493,11 @@ export const verticalDramaEpisodesRouter = router({
             ...(input.thaiAccent ? { thaiAccent: input.thaiAccent } : {}),
           }
         : {
-            selectedVideoModelId: DEFAULT_MODELS.video,
+            // Empty, NOT `DEFAULT_MODELS.video` — "selected" must reflect a
+            // REAL user choice, not an auto-default (fail-closed guard in
+            // `generateVideoClip`/the video-prompt-pack procedure requires a
+            // non-empty value before generating).
+            selectedVideoModelId: "",
             durationProfileId:
               row.durationProfileId ?? "vertical_drama_60s_9_frames_8_clips",
             motionMode: "first_frame_to_video",
@@ -8736,6 +9565,11 @@ export const verticalDramaEpisodesRouter = router({
         // MCP-transport (e.g. `higgsfield/*`, `magnific-mcp/*`) — see
         // `resolveVdMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 5).
+        // Required only when the resolved model is Hermes-transport and the
+        // caller has no default Hermes connection for images.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional output resolution/size (storyboard-complete plan Phase
         // 6.2b) — e.g. "1K"/"2K"/"4K" or "720p"/"1080p"/"4K" depending on the
         // resolved model's `resolutionOptions` (`mediaModels.list`). Ignored
@@ -8869,13 +9703,55 @@ export const verticalDramaEpisodesRouter = router({
 
       // Identity-lock references — resolve each required character's
       // approved portrait, same lookup `generateRealStoryboard` uses.
-      const characterRefEntries = await resolveShotCharacterReferenceEntries(
+      const characterAttachmentManifest =
+        await resolveRequiredShotCharacterAttachmentManifest(
         tenantId,
         userId,
         seriesId,
-        frame.requiredCharacterRefs
+        input.shotNumber,
+        frame.requiredCharacterRefs,
       );
+      const characterRefEntries = [
+        ...characterAttachmentManifest.primaryEntries,
+        ...characterAttachmentManifest.supplementaryEntries,
+      ];
       const characterRefUrls = characterRefEntries.map(e => e.url);
+
+      // Render-time reference-mapping fail-closed guard (RC2/RC3 fix,
+      // `planning/vd-start-frame-reference-mapping/plan.md` Phase 3,
+      // 2026-07-16) — REPLACES the removed `formatIdentityLockedImagePrompt`
+      // code-authored append (see this file's doc comment at that former
+      // helper's old definition site for the full RC2 writeup). The skill
+      // authors the identity-lock "Image N ↔ name" mapping itself, in its
+      // own prose, at planning time; code no longer appends a second,
+      // independently-authored mapping on top of it (that dual-authorship is
+      // exactly what produced the observed contradiction — prose said
+      // "ภาคิน (Image 1)" / "ไอริณ (Image 2)" while the removed append said
+      // "Image 1 = ไอริณ; Image 2 = ภาคิน"). Instead, validate the STORED
+      // prompt (after `stripExistingIdentityLockSuffix`, so a legacy
+      // code-authored bracket from before this migration is never
+      // mis-validated) against the REAL attachment order
+      // (`characterAttachmentManifest.primaryEntries`, 1-based `imageIndex`
+      // = attachment position) and fail closed on an EXPLICIT contradiction,
+      // BEFORE credits are reserved. Legacy prompts that never make an
+      // explicit "Image N" claim (i.e. authored before the skill wrote this
+      // mapping into its own prose) proceed unchanged — the validator is
+      // lenient by design (see `findCharacterImageIndexMappingMismatches`'s
+      // doc comment).
+      const referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
+        softenedImagePrompt,
+        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
+          imageIndex: index + 1,
+          characterName: entry.name,
+        })),
+      );
+      if (referenceMappingMismatches.length > 0) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — มีการเพิ่ม/เปลี่ยนตัวละครของช็อตนี้หลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน (ถ้าสร้างภาพตอนนี้ หน้าตัวละครอาจสลับกัน) วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่ก่อน แล้วจึงสร้างภาพ`,
+        });
+      }
+
       // Location reference (Phase 2 of `planning/polished-toasting-gadget.md`
       // — location visual bible) — this shot's environment-lock reference,
       // resolved from the storyboard's own `distinct_locations[]` groups
@@ -8927,6 +9803,11 @@ export const verticalDramaEpisodesRouter = router({
           configJson: pricingModel.configJson ?? undefined,
         }
       );
+      assertRequiredCharacterReferenceCapacity(
+        input.shotNumber,
+        characterAttachmentManifest.primaryEntries.length,
+        imageCapabilities.maxReferenceImages,
+      );
       const {
         urls: referenceImageUrls,
         trimmedCount: trimmedProductReferenceCount,
@@ -8952,7 +9833,31 @@ export const verticalDramaEpisodesRouter = router({
       // `media.generateImageAsync` MCP-transport branch, which never calls
       // deductCredits at all for these models.
       const shouldChargeImageCredits = imageCreditCost > 0;
-      if (shouldChargeImageCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09): resolve the
+      // transport-neutral decision BEFORE the credit reserve block below
+      // (not after) — structurally guarantees "no platform-credit reserve
+      // for hermes" regardless of a misconfigured catalog row's
+      // `creditCost`. `mcp`/`gateway` fall through to the pre-existing code
+      // below byte-identically (delegates to `resolveVdMcpTransportMetadata`
+      // unchanged); `hermes` is handled at the submit block further down
+      // (see the `transportDecision.kind === "hermes"` branch right before
+      // this mutation's existing `generateImageAsync` submit call).
+      const transportDecision = await resolveVdMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+        idempotencyKey: input.idempotencyKey,
+      });
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
         const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -8983,30 +9888,13 @@ export const verticalDramaEpisodesRouter = router({
         });
       }
 
-      // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
-      // dispatched through the service's MCP branch, not the default
-      // gateway_api/Python-backend path — see `resolveVdMcpTransportMetadata`.
-      const transportMetadata = await resolveVdMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "image",
-        modelId: resolvedImageModelId,
-        configJson: pricingModel.configJson,
-        mcpConnectionId: input.mcpConnectionId,
-        idempotencyKey: input.idempotencyKey,
-      });
-
       // Identity-lock references — which character entries actually have a
       // reference image attached, after `mergeAndTrimReferenceImageUrls`'s
       // `maxReferenceImages` trimming. Still needed below (the soften>0
       // branch's `characterReferenceManifest` input), even though the
       // level-0 branch no longer formats a prompt from it — see that doc
       // comment.
-      const keptCharCount = Math.min(
-        characterRefEntries.length,
-        referenceImageUrls.length
-      );
-      const keptCharEntries = characterRefEntries.slice(0, keptCharCount);
+      const keptCharEntries = characterAttachmentManifest.primaryEntries;
 
       let renderStartFramePrompt: string;
       if (effectiveSoftenLevel === 0) {
@@ -9129,6 +10017,11 @@ export const verticalDramaEpisodesRouter = router({
       // Final-prompt QC (hard length cap) — enforced right before the
       // outgoing image render call. No-op (zero LLM calls / zero credits)
       // when the stored prompt is already within `VD_IMAGE_PROMPT_MAX`.
+      // `renderStartFramePrompt` is used UNMODIFIED (no code-authored
+      // identity-lock append — see the `referenceMappingMismatches` guard
+      // above's doc comment for why) — the skill's own prose already states
+      // the full identity-lock constraint, so there is no separate
+      // "protected fragment" to shield from QC trimming anymore either.
       const imagePromptQc = await ensurePromptWithinLimit({
         kind: "image",
         prompt: renderStartFramePrompt,
@@ -9168,6 +10061,73 @@ export const verticalDramaEpisodesRouter = router({
           );
       }
 
+      // Feature 135 — Hermes Grok media worker (section 09, row 5): a
+      // completely separate submit path — no platform credit reserve (the
+      // block above already skipped it for a zero-cost hermes model), build
+      // the reference set from the same trimmed `referenceImageUrls`, and
+      // submit straight to `queueHermesMediaJob`.
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referenceImageUrls,
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: imagePromptQc.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            aspectRatio: "9:16",
+            outputCount: 1,
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+          },
+          references,
+          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+          idempotencyKey: input.idempotencyKey,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: imagePromptQc.prompt,
+          extraParams: {
+            __vd_series_id: String(seriesId),
+            __vd_episode_id: String(episodeId),
+            __vd_shot_number: String(input.shotNumber),
+            __vd_purpose: "start_frame",
+          },
+          droppedReferenceCount,
+        });
+        return {
+          taskId: hermesTask.id,
+          modelId: resolvedImageModelId,
+          creditCost: 0,
+          trimmedProductReferenceCount,
+          droppedReferenceCount,
+        };
+      }
+
       const userToken = getStartFrameMediaUserToken(ctx);
       try {
         const task = await mediaGenerationService.generateImageAsync(
@@ -9261,6 +10221,10 @@ export const verticalDramaEpisodesRouter = router({
         // Required only when the episode's selected image model is
         // MCP-transport — see `resolveVdMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 6). See
+        // `generateStartFrameImage`'s identical field.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional output resolution/size (storyboard-complete plan Phase
         // 6.2b) — same convention as `generateStartFrameImage`.
         resolution: z.string().trim().max(32).optional(),
@@ -9352,13 +10316,39 @@ export const verticalDramaEpisodesRouter = router({
         }
       }
 
-      const characterRefEntries = await resolveShotCharacterReferenceEntries(
+      const characterAttachmentManifest =
+        await resolveRequiredShotCharacterAttachmentManifest(
         tenantId,
         userId,
         seriesId,
-        frame.requiredCharacterRefs
+        input.shotNumber,
+        frame.requiredCharacterRefs,
       );
+      const characterRefEntries = [
+        ...characterAttachmentManifest.primaryEntries,
+        ...characterAttachmentManifest.supplementaryEntries,
+      ];
       const characterRefUrls = characterRefEntries.map(e => e.url);
+
+      // Render-time reference-mapping fail-closed guard — same rationale and
+      // convention as `generateStartFrameImage`'s identical guard above (see
+      // that block's doc comment for the full RC2/RC3 writeup); validates
+      // the stripped STORED prompt (before the grid-authoring skill call
+      // below rewrites it), before credits are reserved.
+      const angleReferenceMappingMismatches = findCharacterImageIndexMappingMismatches(
+        softenedImagePrompt,
+        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
+          imageIndex: index + 1,
+          characterName: entry.name,
+        })),
+      );
+      if (angleReferenceMappingMismatches.length > 0) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — มีการเพิ่ม/เปลี่ยนตัวละครของช็อตนี้หลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน (ถ้าสร้างภาพตอนนี้ หน้าตัวละครอาจสลับกัน) วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่ก่อน แล้วจึงสร้างภาพ`,
+        });
+      }
+
       // Location reference (Phase 2 of `planning/polished-toasting-gadget.md`
       // — location visual bible) — same resolution + priority-ordering
       // rationale as `generateStartFrameImage`'s identical block above,
@@ -9418,6 +10408,11 @@ export const verticalDramaEpisodesRouter = router({
           configJson: pricingModel.configJson ?? undefined,
         }
       );
+      assertRequiredCharacterReferenceCapacity(
+        input.shotNumber,
+        characterAttachmentManifest.primaryEntries.length,
+        angleImageCapabilities.maxReferenceImages,
+      );
       const {
         urls: referenceImageUrls,
         trimmedCount: trimmedProductReferenceCount,
@@ -9435,7 +10430,26 @@ export const verticalDramaEpisodesRouter = router({
       // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
       // entirely — see the matching comment in `generateStartFrameImage`.
       const shouldChargeGridCredits = gridCreditCost > 0;
-      if (shouldChargeGridCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09, row 6): resolve
+      // the transport-neutral decision BEFORE the credit reserve block below
+      // (not after) — structurally guarantees "no platform-credit reserve
+      // for hermes" — see `generateStartFrameImage`'s matching block.
+      const transportDecision = await resolveVdMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+        idempotencyKey: input.idempotencyKey,
+      });
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
+      if (transportDecision.kind !== "hermes" && shouldChargeGridCredits) {
         const hasCredits = await hasEnoughCredits(userId, gridCreditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -9480,14 +10494,7 @@ export const verticalDramaEpisodesRouter = router({
       // wording so future tuning happens in skill.md, not here) from these
       // ground-truth facts. Code no longer authors any instructional prompt
       // text for this call site.
-      const keptAngleCharCount = Math.min(
-        characterRefEntries.length,
-        referenceImageUrls.length
-      );
-      const keptAngleCharEntries = characterRefEntries.slice(
-        0,
-        keptAngleCharCount
-      );
+      const keptAngleCharEntries = characterAttachmentManifest.primaryEntries;
       const gridProductLockFacts = await loadSeriesProductTieInFacts(
         tenantId,
         userId,
@@ -9591,6 +10598,9 @@ export const verticalDramaEpisodesRouter = router({
       // Final-prompt QC (hard length cap) — enforced on the FINAL grid
       // prompt (skill-authored prompt + the identity-map fact block), since
       // that concatenated string is what actually gets sent to the provider.
+      // No code-authored identity-lock append (no `protectedFragments`
+      // either) — see `generateStartFrameImage`'s matching guard/QC block
+      // above for the full RC2 rationale.
       const gridPromptQc = await ensurePromptWithinLimit({
         kind: "image",
         prompt: gridPromptWithIdentityMap,
@@ -9612,19 +10622,70 @@ export const verticalDramaEpisodesRouter = router({
         productRefUrls.length > 0
       );
 
-      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
-      const transportMetadata = await resolveVdMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "image",
-        modelId: resolvedImageModelId,
-        configJson: pricingModel.configJson,
-        mcpConnectionId: input.mcpConnectionId,
-        idempotencyKey: input.idempotencyKey,
-      });
-
-      const userToken = getStartFrameMediaUserToken(ctx);
-      try {
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referenceImageUrls,
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: gridPromptQc.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            aspectRatio: "9:16",
+            outputCount: 1,
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+          },
+          references,
+          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+          idempotencyKey: input.idempotencyKey,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: gridPromptQc.prompt,
+          extraParams: {
+            __vd_series_id: String(seriesId),
+            __vd_episode_id: String(episodeId),
+            __vd_shot_number: String(input.shotNumber),
+            __vd_purpose: "angle_grid",
+          },
+          droppedReferenceCount,
+        });
+        return {
+          taskId: hermesTask.id,
+          modelId: resolvedImageModelId,
+          creditCost: 0,
+          trimmedProductReferenceCount,
+          droppedReferenceCount,
+        };
+      }
+
+      const userToken = getStartFrameMediaUserToken(ctx);
+      try {
         const task = await mediaGenerationService.generateImageAsync(
           {
             prompt: gridPromptQc.prompt,
@@ -9710,6 +10771,10 @@ export const verticalDramaEpisodesRouter = router({
         // Required only when the episode's selected image model is
         // MCP-transport — see `resolveVdMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 7). See
+        // `generateStartFrameImage`'s identical field.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional output resolution/size (storyboard-complete plan Phase
         // 6.2b) — same convention as `generateStartFrameImage`.
         resolution: z.string().trim().max(32).optional(),
@@ -9827,7 +10892,25 @@ export const verticalDramaEpisodesRouter = router({
       // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
       // entirely — see the matching comment in `generateStartFrameImage`.
       const shouldChargeImageCredits = imageCreditCost > 0;
-      if (shouldChargeImageCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09, row 7): resolve
+      // the transport-neutral decision BEFORE the credit reserve block below
+      // (not after) — see `generateStartFrameImage`'s matching block.
+      const transportDecision = await resolveVdMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+        idempotencyKey: input.idempotencyKey,
+      });
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
         const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -9855,17 +10938,6 @@ export const verticalDramaEpisodesRouter = router({
         });
       }
 
-      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
-      const transportMetadata = await resolveVdMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "image",
-        modelId: resolvedImageModelId,
-        configJson: pricingModel.configJson,
-        mcpConnectionId: input.mcpConnectionId,
-        idempotencyKey: input.idempotencyKey,
-      });
-
       // vertical-drama-skill-first-architecture plan, Phase 1 item 2: the
       // `vertical-drama-shot-image-action` skill authors the ENTIRE repair
       // prompt (applying the user's free-text `repair_instruction` to the
@@ -10044,6 +11116,75 @@ export const verticalDramaEpisodesRouter = router({
         label: `image repair prompt (episode #${episodeId}, shot ${input.shotNumber})`,
       });
 
+      // Feature 135 — Hermes Grok media worker (section 09, row 7): a
+      // separate submit path — the sole reference here is `currentUrl` (the
+      // shot's current approved image), so this is always `image.edit`.
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: [currentUrl],
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+          roleFor: () => "current_image",
+        });
+        // The current-image reference is MANDATORY for a repair edit — a
+        // drop here (see `resolveHermesOrderedRefsFromUrls`'s audit log)
+        // leaves `references` empty, which `queueHermesMediaJob`'s contract
+        // validation then rejects (`image.edit` requires >= 1 reference) —
+        // fails loud, never silently downgrades to `image.generate`.
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: "image.edit",
+          connectionId: transportDecision.connectionId,
+          prompt: repairPromptQc.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            aspectRatio: "9:16",
+            outputCount: 1,
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+          },
+          references,
+          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+          idempotencyKey: input.idempotencyKey,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: repairPromptQc.prompt,
+          extraParams: {
+            __vd_series_id: String(seriesId),
+            __vd_episode_id: String(episodeId),
+            __vd_shot_number: String(input.shotNumber),
+            __vd_purpose: "repair",
+          },
+          droppedReferenceCount,
+        });
+        return {
+          taskId: hermesTask.id,
+          modelId: resolvedImageModelId,
+          creditCost: 0,
+        };
+      }
+
       const userToken = getStartFrameMediaUserToken(ctx);
       try {
         const task = await mediaGenerationService.generateImageAsync(
@@ -10138,6 +11279,11 @@ export const verticalDramaEpisodesRouter = router({
         // Required only when the episode's selected video model is
         // MCP-transport — see `resolveVdMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 9).
+        // Required only when the resolved model is Hermes-transport and the
+        // caller has no default Hermes connection for video.
+        hermesConnectionId: z.string().max(64).optional(),
         // Optional output resolution (storyboard-complete plan Phase
         // 6.2b) — e.g. "720p"/"1080p"/"4K" per Veo's tiers. Same convention
         // as `generateStartFrameImage`.
@@ -10173,6 +11319,14 @@ export const verticalDramaEpisodesRouter = router({
           message: `No motion prompt for clip ${input.clipNumber} yet — generate the video motion prompt pack first`,
         });
       }
+      const artifactStatus = storyboardArtifactStatus(pack, row.storyboard);
+      if (artifactStatus === "stale") {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message:
+            "Storyboard changed after this video prompt was created. Regenerate the prompt before paid video generation.",
+        });
+      }
       if (!clip.prompt?.trim()) {
         throw new TRPCError({
           code: "PRECONDITION_FAILED",
@@ -10209,7 +11363,19 @@ export const verticalDramaEpisodesRouter = router({
         });
       }
 
-      // Resolution order (Phase 1.2): episode-level selection -> DEFAULT_MODELS.
+      // FAIL CLOSED: this is a paid, user-clicked action — require an
+      // explicit episode-level video model selection before generating.
+      // `resolveEpisodeVideoModel` itself stays tolerant (falls back to
+      // `DEFAULT_MODELS.video`) because it's shared with text-only
+      // capability lookups (`generateShotVideoPrompt`,
+      // `regenerateClipDialogue`), so the fail-closed check is enforced
+      // here instead, explicitly, only for the paid render.
+      if (!pack.selectedVideoModelId?.trim()) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง / Select a video model before generating.",
+        });
+      }
       const model = await resolveEpisodeVideoModel(pack);
 
       // Shot references (Phase 2.6): gather the clip's shot(s) linked
@@ -10262,33 +11428,129 @@ export const verticalDramaEpisodesRouter = router({
         configJson: model.configJson,
       });
       const maxReferenceImages = capabilities.maxReferenceImages ?? 0;
+      const startFrameAssetId = clip.startFrameAssetId
+        ? Number(clip.startFrameAssetId)
+        : undefined;
+      // Reference-mapping fix Phase 5b (`vd-start-frame-reference-mapping/
+      // plan.md`) — WHY this budget is `maxReferenceImages - 1` (not
+      // `maxReferenceImages`) whenever a start frame is present: the start
+      // frame is resolved and prepended to `idsToResolve` SEPARATELY, below,
+      // so from THIS point on it reads like it has its own "free" slot. It
+      // does NOT. `mediaGenerationService.generateVideoAsync` ->
+      // `resolveReferenceImageUrlsForModel` ->
+      // `getReferenceImageLimitForModel`/`getReferenceImageLimitFromConfig`
+      // (mediaProviderUtils.ts) slices the FINAL COMBINED
+      // `referenceImageUrls` array — start frame included — down to this
+      // exact same model's `configJson.maxReferenceImages`. Before this fix,
+      // extras were budgeted with the full `maxReferenceImages`, so
+      // `idsToResolve.length` could reach `1 (start frame) + maxReferenceImages`
+      // — one over the service's real cap — and the service would silently
+      // drop the LAST entry (per the priority ordering below, usually the
+      // location reference) at submission time, while `trimmedReferenceCount`
+      // (returned to the client for the UI warning) still reported the
+      // router's smaller, wrong trim count. Budgeting extras to
+      // `maxReferenceImages - (startFrame present ? 1 : 0)` here makes the
+      // router's own count match what the service will actually keep, so
+      // nothing is silently dropped downstream and the reported count is
+      // accurate. Byte-identical to the pre-fix behavior for every clip with
+      // no `startFrameAssetId` (the `- 1` term is 0).
+      const extraReferenceBudget = Math.max(
+        0,
+        maxReferenceImages - (startFrameAssetId ? 1 : 0)
+      );
       // Speaker-switch consolidated clips (2026-07-11 redesign) carry one
       // portrait per additional speaker in `clip.extraReferenceAssetIds`
       // (ordered by priority, anchor speaker already covered by
       // `startFrameAssetId` below) — merged IN FRONT OF the shot-level
       // manual reference list so they're kept first when trimmed to this
-      // model's `maxReferenceImages`. A clip without the field (every clip
+      // model's `extraReferenceBudget`. A clip without the field (every clip
       // predating this task, and every non-speaker-switch clip) behaves
-      // byte-identically: `?? []` contributes nothing. The location reference
-      // (if any) is appended LAST — lower priority than the start frame
-      // (always kept, resolved separately below) and every character/shot
-      // reference above, so it is the FIRST thing trimmed away once a
-      // model's `maxReferenceImages` caps out.
-      const orderedReferenceAssetIds = [
+      // byte-identically: `?? []` contributes nothing.
+      const manualReferenceAssetIds = [
         ...(clip.extraReferenceAssetIds ?? []).map(id => Number(id)),
         ...shotReferences
           .slice()
           .sort((a, b) => a.sortOrder - b.sortOrder)
           .map(r => Number(r.mediaAssetId)),
+      ];
+
+      // Reference-mapping fix Phase 5c (`vd-start-frame-reference-mapping/
+      // plan.md`) — best-effort auto-attach of this clip's REQUIRED
+      // characters' primary-portrait asset ids, so a multi-image-reference
+      // model gets identity-lock coverage for every character the clip's
+      // source shot(s) actually need — not only the anchor speaker riding
+      // `startFrameAssetId`/the switch-portrait `extraReferenceAssetIds`
+      // pair above (that pair only covers characters who SPEAK during a
+      // speaker switch; a silent/non-speaking required character, or a clip
+      // whose motion pack predates the 2026-07-11 speaker-switch redesign,
+      // gets none of that coverage otherwise). Gated on
+      // `maxReferenceImages > 1` — a single-reference-image model (Grok
+      // Imagine's `grok-imagine-video-1.5`, `maxReferenceImages: 1`) has NO
+      // room for anything beyond the start frame; that model's single start
+      // frame already carries 100% of identity (see plan.md Phase 5
+      // research), so this block must stay a complete no-op there —
+      // `remainingPortraitSlots` below is `<= 0` whenever
+      // `extraReferenceBudget <= 1`, but the outer `maxReferenceImages > 1`
+      // guard makes that explicit and byte-identical for Grok regardless of
+      // how many manual/speaker-switch refs are already present. Fills only
+      // whatever slots remain in `extraReferenceBudget` AFTER the
+      // speaker-switch + manual shot references above (never displaces a
+      // user-chosen reference), and is itself placed BEFORE the location
+      // reference below — the image-reference-path convention documented at
+      // `resolveShotCharacterReferenceEntries`'s "identity before
+      // environment" priority applies here too, so a tight budget drops the
+      // location before it ever drops a character portrait. Best-effort: a
+      // DB/lookup failure here must never fail a paid render — caught below
+      // and logged, same "log and continue" convention as this router's
+      // other non-blocking enrichment steps (e.g.
+      // `maybeBuildAndPersistTieInQualityReport`'s call site).
+      let characterPortraitReferenceAssetIds: number[] = [];
+      if (maxReferenceImages > 1) {
+        const remainingPortraitSlots =
+          extraReferenceBudget - manualReferenceAssetIds.length;
+        if (remainingPortraitSlots > 0) {
+          try {
+            const alreadyReferencedAssetIds = new Set([
+              ...(startFrameAssetId ? [startFrameAssetId] : []),
+              ...manualReferenceAssetIds,
+            ]);
+            const requiredPortraitAssetIds =
+              await resolveClipRequiredCharacterPortraitAssetIds(
+                tenantId,
+                userId,
+                seriesId,
+                row.startFramePlan as VerticalDramaStartFramePlan | null,
+                clip.sourceShotNumbers
+              );
+            characterPortraitReferenceAssetIds = requiredPortraitAssetIds
+              .filter(id => !alreadyReferencedAssetIds.has(id))
+              .slice(0, remainingPortraitSlots);
+          } catch (err) {
+            debugError(
+              "verticalDramaEpisodes.generateVideoClip",
+              `resolveClipRequiredCharacterPortraitAssetIds failed (episodeId=${episodeId}, clipNumber=${input.clipNumber}) — continuing without auto-attached portraits`,
+              err
+            );
+          }
+        }
+      }
+
+      // The location reference (if any) is appended LAST — lower priority
+      // than the start frame (always kept, resolved separately below) and
+      // every character/shot/portrait reference above, so it is the FIRST
+      // thing trimmed away once a model's `extraReferenceBudget` caps out.
+      const orderedReferenceAssetIds = [
+        ...manualReferenceAssetIds,
+        ...characterPortraitReferenceAssetIds,
         ...(clipLocationAssetId ? [clipLocationAssetId] : []),
       ];
       const trimmedReferenceCount = Math.max(
         0,
-        orderedReferenceAssetIds.length - maxReferenceImages
+        orderedReferenceAssetIds.length - extraReferenceBudget
       );
       const keptReferenceAssetIds =
-        maxReferenceImages > 0
-          ? orderedReferenceAssetIds.slice(0, maxReferenceImages)
+        extraReferenceBudget > 0
+          ? orderedReferenceAssetIds.slice(0, extraReferenceBudget)
           : [];
 
       // Resolve the approved start frame + kept reference assets to URLs in
@@ -10297,9 +11559,6 @@ export const verticalDramaEpisodesRouter = router({
       // frame (the generic "market" dispatch convention — see
       // `modelRegistry.ts`'s `grok-imagine-video-1-5-preview`/HappyHorse
       // entries) still gets the right image first.
-      const startFrameAssetId = clip.startFrameAssetId
-        ? Number(clip.startFrameAssetId)
-        : undefined;
       const idsToResolve = [
         ...(startFrameAssetId ? [startFrameAssetId] : []),
         ...keptReferenceAssetIds,
@@ -10325,6 +11584,38 @@ export const verticalDramaEpisodesRouter = router({
         delivery: d.delivery,
         subtext: d.subtext,
       }));
+      // Lip-sync discipline fix — resolve each distinct speaker's roster
+      // display name for the native-audio dialogue block (no roster is
+      // otherwise loaded in this mutation, unlike `generateShotVideoPrompt`,
+      // so this is the one targeted/minimal query added for this fix — kept
+      // to just the distinct `characterKey`s this clip's dialogue actually
+      // uses). Falls back to bare `characterKey` for any speaker with no
+      // roster row/name.
+      const videoClipDialogueCharacterKeys = Array.from(
+        new Set(
+          dialogueLines
+            .map(d => d.characterKey)
+            .filter((k): k is string => Boolean(k))
+        )
+      );
+      const videoClipCharacterIdentitySources =
+        await resolveShotCharacterIdentitySources(
+          tenantId,
+          seriesId,
+          videoClipDialogueCharacterKeys
+        );
+      const videoClipCharacterNameByKey = new Map(
+        videoClipCharacterIdentitySources
+          .filter((c): c is typeof c & { name: string } => Boolean(c.name))
+          .map(c => [c.characterKey, c.name])
+      );
+      const dialogueLinesWithSpeakerNames: VerticalDramaClipDialogueLine[] =
+        dialogueLines.map(l => ({
+          ...l,
+          speakerName: l.characterKey
+            ? videoClipCharacterNameByKey.get(l.characterKey)
+            : undefined,
+        }));
       const formatted = formatVideoClipRequest({
         clip: {
           clipNumber: clip.clipNumber,
@@ -10339,7 +11630,7 @@ export const verticalDramaEpisodesRouter = router({
           // opted in, so this stays additive.
           audioDirection: clip.audioDirection,
         },
-        dialogueLines,
+        dialogueLines: dialogueLinesWithSpeakerNames,
         dialogueLanguage: pack.dialogueLanguage,
         thaiAccent: pack.thaiAccent,
         modelId: model.id,
@@ -10347,6 +11638,22 @@ export const verticalDramaEpisodesRouter = router({
         aspectRatio: "9:16",
       });
 
+      // Dialogue-duplication fix (2026-07-15) — protect each individual
+      // spoken line, not the `buildNativeDialogueVerbatimBlock` boilerplate
+      // block. See the sub-shots path's identical fix (near
+      // `speakerSwitchGeneration.dialogue` above) for the full rationale.
+      // Shared by both QC passes below (base formatted prompt + final
+      // provider prompt) since both protect the same dialogue lines.
+      const videoClipDialogueLineFragments =
+        capabilities.nativeAudioDialogue === true
+          ? dialogueLinesWithSpeakerNames
+              .map(l => l.lineTh.trim())
+              // BARE, UNQUOTED line text (see the sub-shots site's comment):
+              // a straight-quoted fragment never matches the refiner's
+              // curly-quoted inline dialogue and gets wrongly re-appended.
+              .filter(Boolean)
+          : undefined;
+
       // Final-prompt QC (hard length cap) — the formatter folds
       // dialogue/delivery/acting direction text INTO `clip.prompt`, so the
       // final string must be re-checked here (the base motion prompt alone
@@ -10356,6 +11663,7 @@ export const verticalDramaEpisodesRouter = router({
       const videoPromptQc = await ensurePromptWithinLimit({
         kind: "video",
         prompt: formatted.prompt,
+        protectedFragments: videoClipDialogueLineFragments,
         userId,
         tenantId,
         seriesId,
@@ -10389,6 +11697,22 @@ export const verticalDramaEpisodesRouter = router({
         }
       }
 
+      // Provider-ready post-condition: re-check after every formatter/style
+      // transform so native dialogue cannot be dropped at the last boundary.
+      const finalProviderPromptQc = await ensurePromptWithinLimit({
+        kind: "video",
+        prompt: formatted.prompt,
+        protectedFragments: videoClipDialogueLineFragments,
+        userId,
+        tenantId,
+        seriesId,
+        idempotencyKey: input.idempotencyKey
+          ? `${input.idempotencyKey}:final-prompt-qc`
+          : undefined,
+        label: `final provider video prompt (episode #${episodeId}, clip ${input.clipNumber})`,
+      });
+      formatted.prompt = finalProviderPromptQc.prompt;
+
       const [pricingRow] = await db
         .select({
           creditCost: mediaModels.creditCost,
@@ -10413,7 +11737,28 @@ export const verticalDramaEpisodesRouter = router({
       // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
       // entirely — see the matching comment in `generateStartFrameImage`.
       const shouldChargeVideoCredits = videoCreditCost > 0;
-      if (shouldChargeVideoCredits) {
+
+      // Feature 135 — Hermes Grok media worker (section 09, row 9): resolve
+      // the transport-neutral decision BEFORE the credit reserve block below
+      // (not after) — structurally guarantees "no platform-credit reserve
+      // for hermes" regardless of what a misconfigured catalog row's
+      // `creditCost` might be, rather than relying solely on the zero-cost
+      // convention holding true.
+      const transportDecision = await resolveVdMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "video",
+        modelId: model.id,
+        configJson: pricingRow?.configJson ?? model.configJson ?? null,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+        idempotencyKey: input.idempotencyKey,
+      });
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
+      if (transportDecision.kind !== "hermes" && shouldChargeVideoCredits) {
         const hasCredits = await hasEnoughCredits(userId, videoCreditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -10444,16 +11789,85 @@ export const verticalDramaEpisodesRouter = router({
         });
       }
 
-      // MCP-transport models — see the matching comment in `generateStartFrameImage`.
-      const transportMetadata = await resolveVdMcpTransportMetadata({
-        tenantId,
-        actorUserId: userId,
-        assetType: "video",
-        modelId: model.id,
-        configJson: pricingRow?.configJson ?? model.configJson ?? null,
-        mcpConnectionId: input.mcpConnectionId,
-        idempotencyKey: input.idempotencyKey,
-      });
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const { buildHermesMediaReferences, buildHermesMediaTaskEnvelope } = await import(
+          "../services/hermesMediaReferences"
+        );
+        const { effectiveHermesCapability } = await import("../../shared/hermesMedia");
+        const { getHermesConnection } = await import("../services/hermesConnectionService");
+
+        // Reference trimming via effective capability (§4.5): intersect the
+        // model row's own `maxReferenceImages` (already reflected in
+        // `idsToResolve`'s length via `extraReferenceBudget` above) with the
+        // CONNECTION's own capability manifest — e.g. Grok i2v's manifest
+        // caps `video.image_to_video` at 1, so only the start frame (index 0
+        // of the "identity before environment" assembly order) survives.
+        const connection = await getHermesConnection({
+          tenantId,
+          userId,
+          connectionId: transportDecision.connectionId,
+        });
+        const effective = effectiveHermesCapability(
+          { maxReferences: maxReferenceImages },
+          connection.capabilities,
+          "video.image_to_video",
+        );
+        const hermesIdsToResolve =
+          typeof effective.maxReferences === "number"
+            ? idsToResolve.slice(0, effective.maxReferences)
+            : idsToResolve;
+        const orderedRefs = hermesIdsToResolve.map((id, idx) => ({
+          assetId: String(id),
+          role: idx === 0 && startFrameAssetId ? "start_frame" : "reference",
+          label: `Image-${idx + 1}`,
+        }));
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: model.id,
+            configJson: pricingRow?.configJson ?? model.configJson ?? null,
+          }).providerModelId ?? model.id;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: "video.image_to_video",
+          connectionId: transportDecision.connectionId,
+          prompt: formatted.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            aspectRatio: "9:16",
+            durationSeconds: clip.durationSeconds ?? null,
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+          },
+          references,
+          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.clipNumber}` },
+          traceId: crypto.randomUUID(),
+          tenantId,
+          requestedByUserId: userId,
+          idempotencyKey: input.idempotencyKey,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "video",
+          model: hermesProviderModelId,
+          prompt: formatted.prompt,
+          extraParams: {
+            __vd_series_id: String(seriesId),
+            __vd_episode_id: String(episodeId),
+            __vd_clip_number: String(input.clipNumber),
+          },
+        });
+        return {
+          taskId: hermesTask.id,
+          modelId: model.id,
+          creditCost: 0,
+          providerFamily: formatted.providerFamily,
+          ttsFallback: formatted.ttsFallback,
+          ttsLines: formatted.ttsLines,
+          trimmedReferenceCount: Math.max(0, idsToResolve.length - hermesIdsToResolve.length) + trimmedReferenceCount,
+        };
+      }
 
       const userToken = getStartFrameMediaUserToken(ctx);
       try {
@@ -10867,19 +12281,31 @@ export const verticalDramaEpisodesRouter = router({
           seriesId,
           frame.requiredCharacterRefs
         );
-      // Same helper (and the SAME "portraits first, then sheets" ordering
-      // guarantee — see its doc comment above)
-      // `generateStartFrameAngleVariations` already uses to build its own
-      // `characterReferenceManifest`: the order this resolves in is the same
-      // order the real paid render will actually attach reference images in
-      // later, so the "Image N" claims the skill writes here stay accurate
-      // for when this shot is eventually rendered.
+      // RC1 fix (`planning/vd-start-frame-reference-mapping/plan.md` Phase 1,
+      // 2026-07-16): `resolveShotCharacterReferenceEntries`'s underlying
+      // query has NO `ORDER BY` — its own return order is Postgres-arbitrary,
+      // NOT reliably `frame.requiredCharacterRefs` order. The comment that
+      // used to sit here claimed the two orders always matched; that claim
+      // was FALSE, and when Postgres happened to return rows in a different
+      // order than `requiredCharacterRefs`, the skill was told the WRONG
+      // "Image N" index for a character relative to what the paid render
+      // (`resolveRequiredShotCharacterAttachmentManifest`, which explicitly
+      // restores `requiredCharacterRefs` order) actually attaches later —
+      // the skill's own authored prose then correctly reflected the WRONG
+      // index it was given, contradicting the real attachment order. Re-sort
+      // via `reorderShotCharacterRefEntriesByKeyOrder` (the same helper
+      // `resolveShotVideoPromptCharacterReferenceImages` uses) so the
+      // manifest below is always in the SAME order the real render attaches
+      // reference images in.
       const shotStartFramePromptCharacterRefEntries =
-        await resolveShotCharacterReferenceEntries(
-          tenantId,
-          userId,
-          seriesId,
-          frame.requiredCharacterRefs
+        reorderShotCharacterRefEntriesByKeyOrder(
+          await resolveShotCharacterReferenceEntries(
+            tenantId,
+            userId,
+            seriesId,
+            frame.requiredCharacterRefs
+          ),
+          frame.requiredCharacterRefs ?? [],
         );
 
       // Location fact (Phase 2 of `planning/polished-toasting-gadget.md` —
@@ -10919,11 +12345,74 @@ export const verticalDramaEpisodesRouter = router({
         frame.imagePrompt
       );
 
+      // Speaker-order composition fix (start-frame character positioning) —
+      // this shot's dialogue speakers, in delivery order, deduped to first
+      // appearance, resolved via the SAME dialogue-resolution chain
+      // `generateShotVideoPrompt` uses (`resolveShotDialogueLines` — see
+      // that function's own doc comment for the full fallback order). This
+      // generator is not authoritative for dialogue and never triggers a
+      // dialogue-refresh itself (unlike `generateShotVideoPrompt`) — a shot
+      // with no resolvable dialogue simply leaves `speaking_order` empty
+      // (silent/solo shot, or dialogue not drafted yet), which
+      // `generateStartFrameShotPrompt` below then omits from the prompt
+      // entirely (byte-identical regression guard).
+      const shotStartFramePromptPack =
+        row.motionPromptPack as VerticalDramaMotionPromptPack | null;
+      const shotStartFramePromptMatchingClip = shotStartFramePromptPack?.clips?.find(
+        c => c.sourceShotNumbers?.includes(input.shotNumber)
+      );
+      const shotStartFramePromptDeepStoryDraftsEnabled =
+        await resolveVerticalDramaDeepStoryDraftsFlag(tenantId);
+      let shotStartFramePromptDeepDraftShot: VdDeepDraftShotDraft | null = null;
+      if (shotStartFramePromptDeepStoryDraftsEnabled) {
+        const [shotStartFramePromptSeriesRow] = await db
+          .select({ bible: verticalDramaSeries.bible })
+          .from(verticalDramaSeries)
+          .where(
+            and(
+              eq(verticalDramaSeries.id, seriesId),
+              eq(verticalDramaSeries.tenantId, tenantId),
+              eq(verticalDramaSeries.userId, userId)
+            )
+          )
+          .limit(1);
+        const { getActiveBreakdown, readItemShotDrafts } = await import(
+          "../services/verticalDramaStoryBible"
+        );
+        const shotStartFramePromptPlanItem = getActiveBreakdown(
+          (shotStartFramePromptSeriesRow?.bible as Record<string, unknown> | null) ?? null
+        ).find(item => item.episodeNumber === Number(row.episodeNumber));
+        shotStartFramePromptDeepDraftShot = shotStartFramePromptPlanItem
+          ? ((readItemShotDrafts(shotStartFramePromptPlanItem) ?? []).find(
+              s => s.shot_number === input.shotNumber
+            ) ?? null)
+          : null;
+      }
+      const shotStartFramePromptDialogueLines = resolveShotDialogueLines({
+        shotNumber: input.shotNumber,
+        matchingClip: shotStartFramePromptMatchingClip,
+        dialogueAudioPlan: row.dialogueAudioPlan as {
+          dialogue_lines?: Array<Record<string, unknown>>;
+        } | null,
+        script: row.script as Record<string, unknown> | null,
+        storyboardShotCount: (row.storyboard as { shots?: unknown[] } | null)
+          ?.shots?.length,
+        deepDraftShot: shotStartFramePromptDeepDraftShot,
+      });
+      const shotStartFramePromptSpeakingOrder = Array.from(
+        new Set(
+          shotStartFramePromptDialogueLines
+            .map(l => l.characterKey?.trim())
+            .filter((k): k is string => Boolean(k))
+        )
+      );
+
       const {
         generateStartFrameShotPrompt,
         InsufficientCreditsError: StartFrameShotPromptInsufficientCreditsError,
         VdSchemaValidationError: StartFrameShotPromptSchemaValidationError,
         RateLimitExceededError: StartFrameShotPromptRateLimitExceededError,
+        VdReferenceMappingError: StartFrameShotPromptReferenceMappingError,
       } = await import("../services/verticalDramaStartFrameGeneration");
 
       let shotStartFramePromptResult: {
@@ -10976,6 +12465,14 @@ export const verticalDramaEpisodesRouter = router({
                 hasReferenceImage: Boolean(shotStartFramePromptLocationEntry.url),
               }
             : undefined,
+          // Speaker-order composition fix — see this procedure's own
+          // `shotStartFramePromptSpeakingOrder` resolution above. Omitted
+          // entirely (not merely `undefined`) when no speakers resolved, so
+          // a silent/solo shot or dialogue-not-yet-drafted shot produces the
+          // same prompt as before this field existed.
+          ...(shotStartFramePromptSpeakingOrder.length
+            ? { speakingOrder: shotStartFramePromptSpeakingOrder }
+            : {}),
           idempotencyKey: input.idempotencyKey,
         });
       } catch (err) {
@@ -10997,6 +12494,19 @@ export const verticalDramaEpisodesRouter = router({
             message: err.message,
           });
         }
+        // RC3 fix (`planning/vd-start-frame-reference-mapping/plan.md` Phase
+        // 2, 2026-07-16) — the skill authored a prompt whose own "Image N ↔
+        // name" text still explicitly contradicted `characterReferenceManifest`
+        // after one corrective retry inside `generateStartFrameShotPrompt`.
+        // Fail closed here (a contradictory prompt is never persisted) with a
+        // clear Thai instruction, same convention as every other user-facing
+        // PRECONDITION_FAILED in this router.
+        if (err instanceof StartFrameShotPromptReferenceMappingError) {
+          throw new TRPCError({
+            code: "PRECONDITION_FAILED",
+            message: `พรอมต์ภาพไม่ตรงกับตัวละครในช็อต ${input.shotNumber} (ระบบลองแก้ให้อัตโนมัติแล้วแต่ยังไม่ตรง) — วิธีแก้: สร้างพรอมต์ของช็อตนี้ใหม่อีกครั้ง แล้วจึงสร้างภาพ`,
+          });
+        }
         throw new TRPCError({
           code: "INTERNAL_SERVER_ERROR",
           message:
@@ -11098,40 +12608,38 @@ export const verticalDramaEpisodesRouter = router({
     }),
 
   /**
-   * Generate ONE shot's image-grounded video-clip prompt (Phase 6, §6.6b) via
-   * `generateVerticalDramaShotVideoPrompt` — analyzes the shot's current
-   * approved start-frame image (or its generating `imagePrompt` as a textual
-   * proxy when no vision-capable model is available) plus the storyboard
-   * shot's description/camera/emotion and any matching dialogue lines, then
-   * persists the resulting prompt + dialogue onto the matching
-   * `motionPromptPack.clips[]` entry (creating a minimal clip/pack when
-   * neither exists yet, mirroring `setEpisodeModelSelection`'s
-   * create-minimal-pack convention).
+   * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6 —
+   * user-controlled supplementary reference frames) — author ONE additional
+   * reference-frame image prompt for a shot. Reuses `generateStartFrameShotPrompt`
+   * (the SAME service `generateShotStartFramePrompt` above calls) in its new
+   * `referenceFrameMode` (see that service's `GenerateStartFrameShotPromptParams
+   * .referenceFrameMode` doc comment) — the user picks WHICH characters
+   * appear (not necessarily `frame.requiredCharacterRefs`) and types a
+   * free-text directive (pose/camera/action, e.g. "ไอริณโอบกอดภาคิน") that
+   * OUTRANKS `canonical_shot_summary` for action under the skill's new
+   * "Supplementary reference frame mode" section; every other identity/
+   * mapping/continuity rule still applies, including the mapping validator +
+   * one corrective retry + fail-closed `VdReferenceMappingError` — identical
+   * to the main flow.
    *
-   * Free-standing from `generateVideoMotionPromptPack` (the whole-pack LLM
-   * planning call) — this targets a single shot and is meant to be re-run
-   * per-shot without regenerating the entire pack.
+   * Deliberately does NOT touch `startFramePlan.frames[].imagePrompt` or any
+   * other persisted episode field (no `db.update` call anywhere in this
+   * mutation) — this is a prompt-authoring-only call the user must CONFIRM
+   * before spending credits on the paid render
+   * (`generateShotReferenceFrameImage`, immediately below). The completed
+   * render is only linked into the episode's reference set
+   * (`vertical_drama_shot_references`, `source: "reference_frame"`) by the
+   * CLIENT calling the pre-existing `linkShotReference` mutation once the
+   * user approves the image.
    */
-  generateShotVideoPrompt: verticalDramaProcedure
+  generateShotReferenceFramePrompt: verticalDramaProcedure
     .input(
       z.object({
         seriesId: z.string().min(1),
         episodeId: z.string().min(1),
         shotNumber: z.number().int().positive(),
-        // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
-        // option) — the caller's current toggle state for this call.
-        // Omitted (undefined) falls back to the pack's previously-persisted
-        // `nativeAudioEnabled` preference below; either way, the rollout
-        // gate (`resolveVerticalDramaNativeAudioPromptsFlag`) + the
-        // resolved model's `supportsNativeAudio` capability both still have
-        // to be true for this to actually take effect.
-        nativeAudioEnabled: z.boolean().optional(),
-        // planning/`polished-toasting-gadget.md` Fix B — the user's free-text
-        // repair/adjustment instruction from the "ให้ AI ปรับ" (AI-adjust)
-        // dialog next to a shot's video prompt. Purely additive: omitted
-        // (undefined) reproduces today's exact prompt/behavior — the plain
-        // "สร้างพรอมต์วิดีโอ (AI)" button never sends this field.
-        instruction: z.string().trim().max(2000).optional(),
+        characterKeys: z.array(z.string().min(1)).min(1).max(10),
+        instruction: z.string().trim().min(1).max(2000),
         idempotencyKey,
       })
     )
@@ -11149,36 +12657,646 @@ export const verticalDramaEpisodesRouter = router({
 
       const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
       const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
-      const approvedMediaAssetId = frame?.approvedMediaAssetId
-        ? Number(frame.approvedMediaAssetId)
-        : undefined;
-      if (
-        !approvedMediaAssetId ||
-        !Number.isInteger(approvedMediaAssetId) ||
-        approvedMediaAssetId <= 0
-      ) {
+      if (!plan || !frame) {
         throw new TRPCError({
           code: "PRECONDITION_FAILED",
-          message: "ต้องมีภาพหลักของช็อตก่อน",
+          message: `No start-frame plan for shot ${input.shotNumber} yet — generate the start-frame plan first`,
         });
       }
-      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [
-        approvedMediaAssetId,
-      ]);
-      const rawImageUrl = urlsByAssetId.get(approvedMediaAssetId);
-      if (!rawImageUrl) {
+
+      // De-dupe the user's own character selection (same tolerant convention
+      // `resolveRequiredShotCharacterAttachmentManifest` uses below in the
+      // sibling image mutation) — the multi-select UI could conceivably
+      // resend the same key twice.
+      const referenceFrameCharacterKeys = Array.from(
+        new Set(input.characterKeys.map(key => key.trim()).filter(Boolean))
+      );
+
+      // Validate every selected key against the series roster BEFORE
+      // spending an LLM call — an unknown key can never resolve to a real
+      // portrait/identity fact at render time either, so failing fast here
+      // is strictly better than discovering it later at the paid image
+      // mutation.
+      const referenceFrameRosterRows = await db
+        .select({ characterKey: verticalDramaCharacters.characterKey })
+        .from(verticalDramaCharacters)
+        .where(
+          and(
+            eq(verticalDramaCharacters.tenantId, tenantId),
+            eq(verticalDramaCharacters.seriesId, seriesId),
+            inArray(verticalDramaCharacters.characterKey, referenceFrameCharacterKeys)
+          )
+        );
+      const referenceFrameKnownKeys = new Set(
+        referenceFrameRosterRows.map((r: { characterKey: string }) => r.characterKey)
+      );
+      const referenceFrameUnknownKeys = referenceFrameCharacterKeys.filter(
+        key => !referenceFrameKnownKeys.has(key)
+      );
+      if (referenceFrameUnknownKeys.length > 0) {
         throw new TRPCError({
           code: "PRECONDITION_FAILED",
-          message: "ต้องมีภาพหลักของช็อตก่อน",
+          message: `ไม่พบตัวละครในรายการสำหรับ ${referenceFrameUnknownKeys.join(", ")}`,
         });
       }
-      // `resolveMediaAssetUrlsByIds` returns `mediaAssets.originalUrl` as
-      // stored — a relative storage path (e.g. `/api/storage/files/...`).
-      // This URL goes straight into a vision-capable LLM's `image_url`
-      // content part below (`buildVisionAwareContent`), which the provider
-      // rejects as an invalid URL format unless it's absolute — same
-      // relative-to-absolute conversion every other reference-image call
-      // site in this router already applies via `mediaGenerationService`'s
+
+      // Manifest order = the USER'S selection order (Phase 6 design) — the
+      // SAME order `generateShotReferenceFrameImage`'s
+      // `resolveRequiredShotCharacterAttachmentManifest` call preserves
+      // (first-occurrence order of its own `characterKeys` input, which the
+      // client sends back unchanged as this mutation's own returned
+      // `characterKeys`). Tolerant of a selected character with no portrait
+      // yet at PROMPT time — same "informational for authoring, fail-closed
+      // only at render" convention `generateShotStartFramePrompt` uses for
+      // `frame.requiredCharacterRefs`; `resolveShotCharacterReferenceEntries`
+      // simply omits a portrait-less character here.
+      const referenceFrameCharacterRefEntries = reorderShotCharacterRefEntriesByKeyOrder(
+        await resolveShotCharacterReferenceEntries(
+          tenantId,
+          userId,
+          seriesId,
+          referenceFrameCharacterKeys
+        ),
+        referenceFrameCharacterKeys
+      );
+
+      const referenceFrameCharacterIdentitySources =
+        await resolveShotCharacterIdentitySources(
+          tenantId,
+          seriesId,
+          referenceFrameCharacterKeys
+        );
+
+      const referenceFrameLocationEntry = await resolveShotLocationReferenceEntry(
+        tenantId,
+        userId,
+        seriesId,
+        row.storyboard,
+        input.shotNumber,
+        frame.locationKey
+      );
+
+      const referenceFramePromptLanguage = (
+        row.motionPromptPack as VerticalDramaMotionPromptPack | null
+      )?.promptLanguage;
+
+      // Scene grounding only — same defensive stripping every other call
+      // site applies to a stored prompt before an LLM call.
+      const referenceFrameBasePrompt = stripExistingIdentityLockSuffix(
+        frame.imagePrompt ?? ""
+      );
+
+      const {
+        generateStartFrameShotPrompt,
+        InsufficientCreditsError: ReferenceFramePromptInsufficientCreditsError,
+        VdSchemaValidationError: ReferenceFramePromptSchemaValidationError,
+        RateLimitExceededError: ReferenceFramePromptRateLimitExceededError,
+        VdReferenceMappingError: ReferenceFramePromptReferenceMappingError,
+      } = await import("../services/verticalDramaStartFrameGeneration");
+
+      let referenceFramePromptResult: {
+        prompt: string;
+        negativePrompt: string;
+        creditsUsed: number;
+        model: string;
+      };
+      try {
+        referenceFramePromptResult = await generateStartFrameShotPrompt({
+          userId,
+          tenantId,
+          seriesId,
+          episodeId,
+          shotNumber: input.shotNumber,
+          instruction: input.instruction,
+          referenceFrameMode: true,
+          currentPrompt: referenceFrameBasePrompt,
+          currentNegativePrompt: frame.negativePrompt ?? "",
+          canonicalShotSummary: frame.canonicalShotSummary,
+          requiredCharacterRefs: referenceFrameCharacterKeys,
+          characters: referenceFrameCharacterIdentitySources,
+          characterReferenceManifest:
+            referenceFrameCharacterRefEntries.map((entry, idx) => ({
+              index: idx + 1,
+              characterId: null,
+              name: entry.name,
+            })),
+          promptLanguage: referenceFramePromptLanguage,
+          // Phase 6 design — no `speakingOrder` fact by design (this is an
+          // arbitrary user-directed pose/action, not necessarily this shot's
+          // dialogue beat).
+          location: referenceFrameLocationEntry
+            ? {
+                name: referenceFrameLocationEntry.name ?? "",
+                description:
+                  referenceFrameLocationEntry.description ??
+                  referenceFrameLocationEntry.name ??
+                  "",
+                hasReferenceImage: Boolean(referenceFrameLocationEntry.url),
+              }
+            : undefined,
+          idempotencyKey: input.idempotencyKey,
+        });
+      } catch (err) {
+        if (err instanceof ReferenceFramePromptInsufficientCreditsError) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: "Insufficient credits to author the reference-frame prompt",
+          });
+        }
+        if (err instanceof ReferenceFramePromptSchemaValidationError) {
+          throw new TRPCError({
+            code: "INTERNAL_SERVER_ERROR",
+            message: "Failed to author the reference-frame prompt — try again",
+          });
+        }
+        if (err instanceof ReferenceFramePromptRateLimitExceededError) {
+          throw new TRPCError({
+            code: "TOO_MANY_REQUESTS",
+            message: err.message,
+          });
+        }
+        // Same fail-closed convention as `generateShotStartFramePrompt`'s
+        // matching catch branch — a contradictory prompt is never returned
+        // for the user to confirm.
+        if (err instanceof ReferenceFramePromptReferenceMappingError) {
+          throw new TRPCError({
+            code: "PRECONDITION_FAILED",
+            message: `พรอมต์เฟรมอ้างอิงไม่ตรงกับตัวละครในช็อต ${input.shotNumber} (ลองแก้ให้อัตโนมัติแล้วยังไม่ตรง) — วิธีแก้: กด "สร้างเฟรมอ้างอิง (AI)" ของช็อตนี้ใหม่อีกครั้ง`,
+          });
+        }
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message:
+            err instanceof Error
+              ? err.message
+              : "Failed to author the reference-frame prompt",
+        });
+      }
+
+      // Final-prompt QC (hard length cap) — keeps this mutation's returned
+      // prompt within `generateShotReferenceFrameImage`'s own `prompt` zod
+      // max (`VD_IMAGE_PROMPT_MAX`), so a user who confirms unmodified never
+      // hits a BAD_REQUEST on the render call.
+      const referenceFramePromptQc = await ensurePromptWithinLimit({
+        kind: "image",
+        prompt: referenceFramePromptResult.prompt,
+        userId,
+        tenantId,
+        seriesId,
+        idempotencyKey: input.idempotencyKey
+          ? `${input.idempotencyKey}:prompt-qc`
+          : undefined,
+        label: `reference-frame prompt (episode #${episodeId}, shot ${input.shotNumber})`,
+      });
+
+      // Deliberately NOT persisted onto `startFramePlan.frames[]` — see this
+      // procedure's own doc comment.
+      return {
+        prompt: referenceFramePromptQc.prompt,
+        negativePrompt: referenceFramePromptResult.negativePrompt,
+        creditsUsed: referenceFramePromptResult.creditsUsed,
+        model: referenceFramePromptResult.model,
+        characterKeys: referenceFrameCharacterKeys,
+      };
+    }),
+
+  /**
+   * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6) —
+   * paid render of ONE user-confirmed reference-frame prompt
+   * (`generateShotReferenceFramePrompt` above). Mirrors
+   * `generateStartFrameImage`'s model-resolution / pricing / capabilities /
+   * render-time mapping guard / credit reserve-refund / MCP-transport /
+   * async-submit structure as closely as possible, with three deliberate
+   * differences: (1) the character set is the caller's OWN `characterKeys`
+   * (not `frame.requiredCharacterRefs`); (2) NO product reference is ever
+   * attached (a supplementary reference still is not the shot's tie-in
+   * carrier); (3) nothing is EVER persisted onto `startFramePlan` — the
+   * completed asset is linked into the episode's reference set only once the
+   * CLIENT calls `linkShotReference({source: "reference_frame"})`.
+   *
+   * Cap-10 guard (Phase 6 user spec: "no fixed count, cap 10 per shot") runs
+   * BEFORE any other resolution/credit work — counts this shot's already-
+   * LINKED `vertical_drama_shot_references` rows with `source:
+   * "reference_frame"` via the existing `listForShot` read path (no new
+   * query shape).
+   */
+  generateShotReferenceFrameImage: verticalDramaProcedure
+    .input(
+      z.object({
+        seriesId: z.string().min(1),
+        episodeId: z.string().min(1),
+        shotNumber: z.number().int().positive(),
+        prompt: z.string().trim().min(1).max(VD_IMAGE_PROMPT_MAX),
+        negativePrompt: z.string().max(2000).optional(),
+        characterKeys: z.array(z.string().min(1)).min(1).max(10),
+        resolution: z.string().trim().max(32).optional(),
+        mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 8). See
+        // `generateStartFrameImage`'s identical field.
+        hermesConnectionId: z.string().max(64).optional(),
+        idempotencyKey,
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const rateLimitKey = `user:${ctx.user.id}`;
+      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
+        throw new TRPCError({
+          code: "TOO_MANY_REQUESTS",
+          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
+        });
+      }
+
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const episodeId = parseId(input.episodeId, "episode id");
+      const row = await loadOwnedEpisode({
+        tenantId,
+        userId,
+        seriesId,
+        episodeId,
+      });
+
+      // (a) ownership + frame existence.
+      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
+      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
+      if (!plan || !frame) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: `No start-frame plan for shot ${input.shotNumber} yet — generate the start-frame plan first`,
+        });
+      }
+
+      // (b) cap-10 guard — reuses the existing shot-reference read path, no
+      // new query shape. Counts only rows this shot has ALREADY LINKED
+      // (`source: "reference_frame"`); the in-flight render being submitted
+      // right now is not yet a linked row.
+      const referenceFrameExistingRefs =
+        await verticalDramaShotReferencesService.listForShot(
+          { tenantId, userId, seriesId },
+          episodeId,
+          input.shotNumber
+        );
+      const referenceFrameExistingCount = referenceFrameExistingRefs.filter(
+        r => r.source === "reference_frame"
+      ).length;
+      if (referenceFrameExistingCount >= 10) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: `เฟรมอ้างอิงของช็อตนี้ครบ 10 ภาพแล้ว — ลบภาพเก่าออกก่อนสร้างใหม่`,
+        });
+      }
+
+      // De-dupe the caller's own selection — same convention as the sibling
+      // prompt mutation above.
+      const referenceFrameCharacterKeys = Array.from(
+        new Set(input.characterKeys.map(key => key.trim()).filter(Boolean))
+      );
+
+      // (c) portraits resolved fail-closed, requiredCharacterRefs-order
+      // resolver with the SELECTED keys — throws PRECONDITION_FAILED
+      // (unknown character / missing approved portrait / duplicate-portrait
+      // collision) with its own Thai messages; identical convention to
+      // `generateStartFrameImage`'s identity-lock resolution.
+      const characterAttachmentManifest =
+        await resolveRequiredShotCharacterAttachmentManifest(
+          tenantId,
+          userId,
+          seriesId,
+          input.shotNumber,
+          referenceFrameCharacterKeys
+        );
+      const characterRefEntries = [
+        ...characterAttachmentManifest.primaryEntries,
+        ...characterAttachmentManifest.supplementaryEntries,
+      ];
+      const characterRefUrls = characterRefEntries.map(e => e.url);
+
+      // (d) render-time reference-mapping fail-closed guard — validates the
+      // USER-CONFIRMED (possibly hand-edited) prompt against the real
+      // attachment order, BEFORE credits are reserved. Same convention/
+      // rationale as `generateStartFrameImage`'s identical guard.
+      const referenceMappingMismatches = findCharacterImageIndexMappingMismatches(
+        input.prompt,
+        characterAttachmentManifest.primaryEntries.map((entry, index) => ({
+          imageIndex: index + 1,
+          characterName: entry.name,
+        })),
+      );
+      if (referenceMappingMismatches.length > 0) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: `พรอมต์เฟรมอ้างอิงไม่ตรงกับตัวละครในช็อต ${input.shotNumber} — ตัวละครของช็อตนี้เปลี่ยนหลังสร้างพรอมต์ ทำให้ลำดับรูปตัวละครที่แนบเลื่อน วิธีแก้: กด "สร้างเฟรมอ้างอิง (AI)" ของช็อตนี้ใหม่ก่อนสร้างภาพ`,
+        });
+      }
+
+      // Location reference — same resolution/priority-ordering rationale as
+      // `generateStartFrameImage`'s identical block, including the Phase D
+      // per-shot override (`frame.locationKey`). NO product reference — see
+      // this procedure's own doc comment, item (2).
+      const locationRefEntry = await resolveShotLocationReferenceEntry(
+        tenantId,
+        userId,
+        seriesId,
+        row.storyboard,
+        input.shotNumber,
+        frame.locationKey
+      );
+      const locationRefUrls = locationRefEntry?.url ? [locationRefEntry.url] : [];
+
+      // (e) capacity assert + reference URL merge + model/pricing/credits/
+      // MCP/task submission — mirrors `generateStartFrameImage` structurally.
+      const resolvedImageModelId = await resolveEpisodeImageModelId(plan);
+
+      const [pricingRow] = await db
+        .select({
+          creditCost: mediaModels.creditCost,
+          configJson: mediaModels.configJson,
+        })
+        .from(mediaModels)
+        .where(eq(mediaModels.modelId, resolvedImageModelId))
+        .limit(1);
+      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
+      const imageCapabilities = resolveVerticalDramaCapabilities(
+        resolvedImageModelId,
+        {
+          type: "image",
+          configJson: pricingModel.configJson ?? undefined,
+        }
+      );
+      assertRequiredCharacterReferenceCapacity(
+        input.shotNumber,
+        characterAttachmentManifest.primaryEntries.length,
+        imageCapabilities.maxReferenceImages,
+      );
+      const {
+        urls: referenceImageUrls,
+        trimmedCount: trimmedReferenceCount,
+      } = mergeAndTrimReferenceImageUrls(
+        characterRefUrls,
+        locationRefUrls,
+        [], // NO product refs — see this procedure's own doc comment.
+        imageCapabilities.maxReferenceImages
+      );
+      assertResolutionOption(pricingModel, input.resolution);
+      const imageCreditCost = calculateCreditCost(pricingModel, {
+        numImages: 1,
+        ...(input.resolution ? { resolution: input.resolution } : {}),
+      });
+      // Zero-cost models (Higgsfield/Magnific MCP) skip reserve/refund
+      // entirely — see the matching comment in `generateStartFrameImage`.
+      const shouldChargeImageCredits = imageCreditCost > 0;
+
+      // Feature 135 — Hermes Grok media worker (section 09, row 8): resolve
+      // the transport-neutral decision BEFORE the credit reserve block below
+      // (not after) — see `generateStartFrameImage`'s matching block.
+      const transportDecision = await resolveVdMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId: resolvedImageModelId,
+        configJson: pricingModel.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+        idempotencyKey: input.idempotencyKey,
+      });
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
+        const hasCredits = await hasEnoughCredits(userId, imageCreditCost);
+        if (!hasCredits) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: `Insufficient credits for reference-frame image render. Required: ${imageCreditCost}`,
+          });
+        }
+
+        await deductCredits({
+          userId,
+          tenantId,
+          amount: imageCreditCost,
+          description: `Vertical Drama — reference-frame render (episode #${episodeId}, shot ${input.shotNumber}, reserved)`,
+          sourceType: "media_image",
+          idempotencyKey: input.idempotencyKey,
+          metadata: {
+            feature: "vertical_drama_series",
+            seriesId,
+            episodeId,
+            shotNumber: input.shotNumber,
+            type: "reservation",
+            creditCost: imageCreditCost,
+            modelId: resolvedImageModelId,
+          },
+        });
+      }
+
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referenceImageUrls,
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: input.prompt,
+          settings: {
+            model: hermesProviderModelId,
+            aspectRatio: "9:16",
+            outputCount: 1,
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+          },
+          references,
+          entity: { type: "vertical_drama_shot", id: `${episodeId}:${input.shotNumber}` },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+          idempotencyKey: input.idempotencyKey,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: input.prompt,
+          extraParams: {
+            __vd_series_id: String(seriesId),
+            __vd_episode_id: String(episodeId),
+            __vd_shot_number: String(input.shotNumber),
+            __vd_purpose: "reference_frame",
+          },
+          droppedReferenceCount,
+        });
+        return {
+          taskId: hermesTask.id,
+          creditCost: 0,
+          modelId: resolvedImageModelId,
+          trimmedReferenceCount,
+          droppedReferenceCount,
+        };
+      }
+
+      const userToken = getStartFrameMediaUserToken(ctx);
+      try {
+        const task = await mediaGenerationService.generateImageAsync(
+          {
+            prompt: input.prompt,
+            negativePrompt: input.negativePrompt,
+            model: resolvedImageModelId,
+            numImages: 1,
+            aspectRatio: "9:16",
+            ...(input.resolution ? { resolution: input.resolution } : {}),
+            ...(referenceImageUrls.length ? { referenceImageUrls } : {}),
+            extraParams: {
+              __vd_series_id: String(seriesId),
+              __vd_episode_id: String(episodeId),
+              __vd_shot_number: String(input.shotNumber),
+              __vd_purpose: "reference_frame",
+            },
+            publicUrl: ctx.publicUrl ?? undefined,
+            ...(transportMetadata ? { transportMetadata } : {}),
+            auditContext: {
+              userId,
+              traceId: crypto.randomUUID(),
+              source: "trpc.verticalDramaEpisodes.generateShotReferenceFrameImage",
+              stage: "submission",
+            },
+          },
+          userToken
+        );
+        return {
+          taskId: task.id,
+          creditCost: imageCreditCost,
+          modelId: resolvedImageModelId,
+          trimmedReferenceCount,
+        };
+      } catch (err) {
+        if (shouldChargeImageCredits) {
+          await refundCredits({
+            userId,
+            amount: imageCreditCost,
+            description: `Refund: reference-frame render failed to submit (episode #${episodeId}, shot ${input.shotNumber})`,
+            sourceType: "media_image",
+            metadata: {
+              feature: "vertical_drama_series",
+              seriesId,
+              episodeId,
+              shotNumber: input.shotNumber,
+              error: err instanceof Error ? err.message : "Unknown error",
+            },
+          });
+        }
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message:
+            err instanceof Error
+              ? err.message
+              : "Reference-frame image generation failed to submit",
+        });
+      }
+    }),
+
+  /**
+   * Generate ONE shot's image-grounded video-clip prompt (Phase 6, §6.6b) via
+   * `generateVerticalDramaShotVideoPrompt` — analyzes the shot's current
+   * approved start-frame image (or its generating `imagePrompt` as a textual
+   * proxy when no vision-capable model is available) plus the storyboard
+   * shot's description/camera/emotion and any matching dialogue lines, then
+   * persists the resulting prompt + dialogue onto the matching
+   * `motionPromptPack.clips[]` entry (creating a minimal clip/pack when
+   * neither exists yet, mirroring `setEpisodeModelSelection`'s
+   * create-minimal-pack convention).
+   *
+   * Free-standing from `generateVideoMotionPromptPack` (the whole-pack LLM
+   * planning call) — this targets a single shot and is meant to be re-run
+   * per-shot without regenerating the entire pack.
+   */
+  generateShotVideoPrompt: verticalDramaProcedure
+    .input(
+      z.object({
+        seriesId: z.string().min(1),
+        episodeId: z.string().min(1),
+        shotNumber: z.number().int().positive(),
+        // Vertical Drama task #36 (optional NATIVE AUDIO DIRECTION prompt
+        // option) — the caller's current toggle state for this call.
+        // Omitted (undefined) falls back to the pack's previously-persisted
+        // `nativeAudioEnabled` preference below; either way, the rollout
+        // gate (`resolveVerticalDramaNativeAudioPromptsFlag`) + the
+        // resolved model's `supportsNativeAudio` capability both still have
+        // to be true for this to actually take effect.
+        nativeAudioEnabled: z.boolean().optional(),
+        // planning/`polished-toasting-gadget.md` Fix B — the user's free-text
+        // repair/adjustment instruction from the "ให้ AI ปรับ" (AI-adjust)
+        // dialog next to a shot's video prompt. Purely additive: omitted
+        // (undefined) reproduces today's exact prompt/behavior — the plain
+        // "สร้างพรอมต์วิดีโอ (AI)" button never sends this field.
+        instruction: z.string().trim().max(2000).optional(),
+        idempotencyKey,
+      })
+    )
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = requireTenantId(ctx.tenantId);
+      const userId = ctx.user.id;
+      const seriesId = parseId(input.seriesId, "series id");
+      const episodeId = parseId(input.episodeId, "episode id");
+      const row = await loadOwnedEpisode({
+        tenantId,
+        userId,
+        seriesId,
+        episodeId,
+      });
+
+      const plan = row.startFramePlan as VerticalDramaStartFramePlan | null;
+      const frame = plan?.frames?.find(f => f.shotNumber === input.shotNumber);
+      const approvedMediaAssetId = frame?.approvedMediaAssetId
+        ? Number(frame.approvedMediaAssetId)
+        : undefined;
+      if (
+        !approvedMediaAssetId ||
+        !Number.isInteger(approvedMediaAssetId) ||
+        approvedMediaAssetId <= 0
+      ) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: "ต้องมีภาพหลักของช็อตก่อน",
+        });
+      }
+      const urlsByAssetId = await resolveMediaAssetUrlsByIds(tenantId, userId, [
+        approvedMediaAssetId,
+      ]);
+      const rawImageUrl = urlsByAssetId.get(approvedMediaAssetId);
+      if (!rawImageUrl) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: "ต้องมีภาพหลักของช็อตก่อน",
+        });
+      }
+      // `resolveMediaAssetUrlsByIds` returns `mediaAssets.originalUrl` as
+      // stored — a relative storage path (e.g. `/api/storage/files/...`).
+      // This URL goes straight into a vision-capable LLM's `image_url`
+      // content part below (`buildVisionAwareContent`), which the provider
+      // rejects as an invalid URL format unless it's absolute — same
+      // relative-to-absolute conversion every other reference-image call
+      // site in this router already applies via `mediaGenerationService`'s
       // internal `resolveReferenceUrl`.
       const imageUrl = resolveReferenceUrl(rawImageUrl, ctx.publicUrl ?? undefined);
 
@@ -11441,7 +13559,29 @@ export const verticalDramaEpisodesRouter = router({
         frame?.requiredCharacterRefs ?? [],
         shotVideoCharacterIdentitySources
       );
-
+      // Lip-sync discipline fix (video-clip prompt speaker/silent-listener
+      // attribution) — resolve each dialogue line's `characterKey` to its
+      // roster DISPLAY name using the identity sources already fetched
+      // above (no new DB query). Falls back to bare `characterKey` for any
+      // speaker with no roster row/name (mirrors the established
+      // `name || characterKey` convention). Used to build a speaker-
+      // attributed mirror of `dialogueLines` for prompt/QC purposes only —
+      // the canonical persisted `dialogueLines`/`clip.dialogue` arrays are
+      // never mutated with this extra field.
+      const shotVideoCharacterNameByKey = new Map(
+        shotVideoCharacterIdentitySources
+          .filter((c): c is typeof c & { name: string } => Boolean(c.name))
+          .map(c => [c.characterKey, c.name])
+      );
+      const withSpeakerNames = <T extends { characterKey?: string }>(
+        lines: readonly T[]
+      ): Array<T & { speakerName?: string }> =>
+        lines.map(l => ({
+          ...l,
+          speakerName: l.characterKey
+            ? shotVideoCharacterNameByKey.get(l.characterKey)
+            : undefined,
+        }));
       // Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)
       // — a shot whose dialogue was actually resolved from the Overview
       // page's canonical source above (`deepDraftShotForDialogue`, either an
@@ -11583,6 +13723,18 @@ export const verticalDramaEpisodesRouter = router({
           storyboardShot,
           shotVideoCharacterIdentityMapBlock,
           dialogueLines,
+          // Synopsis grounding + silence signal (`planning/vd-video-prompt-
+          // skill-first/plan.md` Phase 1a/2) — same resolved deep-draft
+          // entry the non-split path threads into `shotContext` above; see
+          // `generateAndPersistSplitShotVideoPrompt`'s own param doc
+          // comments for how it's applied.
+          canonicalShotSummary: deepDraftShotForDialogue?.summary?.trim() || undefined,
+          beatIsSilent: Boolean(deepDraftShotForDialogue?.silence_intent),
+          // Lip-sync discipline fix — same `characterKey -> name` map the
+          // non-split path uses below (`shotVideoCharacterNameByKey`,
+          // resolved once from `shotVideoCharacterIdentitySources` — no new
+          // DB query for the split path either).
+          characterNameByKey: shotVideoCharacterNameByKey,
           tieInPlacement,
           tieInProductName,
           tieInProductCategory,
@@ -11633,10 +13785,23 @@ export const verticalDramaEpisodesRouter = router({
         characterReferenceImages: shotVideoCharacterReferenceImages,
         locationReferenceImage: shotVideoLocationReferenceImage ?? undefined,
         shotContext: {
+          // Synopsis grounding (`planning/vd-video-prompt-skill-first/
+          // plan.md` Phase 1a) — the canonical Overview-page beat, when this
+          // shot has a deep-drafted entry (`deepDraftShotForDialogue`,
+          // already resolved above for dialogue-source-of-truth purposes —
+          // no extra DB read). `undefined` whenever the deep-story-drafts
+          // flag is off or this shot has no deep-drafted entry yet,
+          // preserving today's byte-identical prompt for every caller that
+          // hasn't adopted deep drafts.
+          canonicalShotSummary: deepDraftShotForDialogue?.summary?.trim() || undefined,
+          // Persistence/pin root-cause fix (`planning/vd-video-prompt-
+          // skill-first/plan.md` Phase 2) — true only when this shot's
+          // deep-drafted entry explicitly marked it silent.
+          beatIsSilent: Boolean(deepDraftShotForDialogue?.silence_intent),
           description: storyboardShot?.description,
           camera: storyboardShot?.cameraSetup,
           emotion: undefined,
-          dialogueLines: dialogueLines.length ? dialogueLines : undefined,
+          dialogueLines: dialogueLines.length ? withSpeakerNames(dialogueLines) : undefined,
           characterIdentityMap: shotVideoCharacterIdentityMapBlock,
           productContext: tieInPlacement
             ? {
@@ -11708,22 +13873,6 @@ export const verticalDramaEpisodesRouter = router({
         }
       }
 
-      // Final-prompt QC (hard length cap) — enforced BEFORE this prompt is
-      // persisted onto `motionPromptPack.clips[]` below. Zero-cost no-op
-      // when the generated prompt is already within `VD_VIDEO_PROMPT_MAX`.
-      const shotVideoPromptQc = await ensurePromptWithinLimit({
-        kind: "video",
-        prompt: result.prompt,
-        userId,
-        tenantId,
-        seriesId,
-        idempotencyKey: input.idempotencyKey
-          ? `${input.idempotencyKey}:prompt-qc`
-          : undefined,
-        label: `shot video prompt (episode #${episodeId}, shot ${input.shotNumber})`,
-      });
-      result.prompt = shotVideoPromptQc.prompt;
-
       // Wave-7D (spec §8.2.2 flow-through rule, `verticalDramaSeriesPresetMixV2`)
       // — same deterministic append `generateVideoClip` already does to the
       // PROVIDER payload, anchored the same way (after the QC cap, same as
@@ -11749,28 +13898,84 @@ export const verticalDramaEpisodesRouter = router({
         }
       }
 
-      // Persist-pin (planning/`polished-toasting-gadget.md`) — the
-      // video-prompt LLM's own `dialogue[]` output field is an ECHO of the
-      // resolved `dialogueLines` sent into it above, not a guaranteed
+      // Final post-transform validation: dialogue is protected after brand
+      // sanitization and preset-token appends, immediately before persist.
+      const finalVideoCapabilities = resolveVerticalDramaCapabilities(selectedVideoModel.id, {
+        type: selectedVideoModel.type,
+        aspectRatios: selectedVideoModel.aspectRatios,
+        configJson: selectedVideoModel.configJson,
+      });
+      const shotVideoPromptQc = await ensurePromptWithinLimit({
+        kind: "video",
+        prompt: result.prompt,
+        // Dialogue-duplication fix (2026-07-15) — protect each individual
+        // spoken line, not the `buildNativeDialogueVerbatimBlock` boilerplate
+        // block. See the sub-shots path's identical fix (near
+        // `speakerSwitchGeneration.dialogue` above) for the full rationale.
+        protectedFragments:
+          finalVideoCapabilities.nativeAudioDialogue === true
+            ? dialogueLines
+                .map(l => l.lineTh.trim())
+                // BARE, UNQUOTED line text (see the sub-shots site's comment):
+                // a straight-quoted fragment never matches the refiner's
+                // curly-quoted inline dialogue and gets wrongly re-appended.
+                .filter(Boolean)
+            : undefined,
+        userId,
+        tenantId,
+        seriesId,
+        idempotencyKey: input.idempotencyKey
+          ? `${input.idempotencyKey}:prompt-qc`
+          : undefined,
+        label: `shot video prompt (episode #${episodeId}, shot ${input.shotNumber})`,
+      });
+      result.prompt = shotVideoPromptQc.prompt;
+
+      // Persist-pin (planning/`polished-toasting-gadget.md`, anti-lock-in fix
+      // hardened by `planning/vd-video-prompt-skill-first/plan.md` Phase 2a)
+      // — the video-prompt LLM's own `dialogue[]` output field is an ECHO of
+      // the resolved `dialogueLines` sent into it above, not a guaranteed
       // pass-through (models occasionally reword/paraphrase a spoken line
       // while writing the surrounding motion prompt). Pin the PERSISTED (and
       // returned) dialogue back to `dialogueLines` verbatim — the exact
       // value that was resolved to feed the LLM, whether that came from the
       // new canonical Overview-page source (source 0) or any pre-existing
       // fallback source — so it can never silently drift from whatever the
-      // user actually sees/edits at the Overview page. The ONE exception:
-      // when a translation is actually required (`dialogueLanguage` set to a
-      // non-Thai locale), the LLM's own translated `dialogue[]` remains
-      // authoritative — there is no source-language line to pin back to in
-      // that case. Also skipped when `dialogueLines` is empty (this shot has
-      // no resolved source dialogue at all, so there is nothing to pin to —
-      // whatever `result.dialogue` the LLM invented, if anything, is kept).
+      // user actually sees/edits at the Overview page. Three cases:
+      //  (a) `dialogueLines` non-empty + Thai/undefined `dialogueLanguage` —
+      //      pin to `dialogueLines` (the case above).
+      //  (b) `dialogueLines` non-empty + translation actually required (a
+      //      non-Thai `dialogueLanguage`) — there is no source-language line
+      //      to pin back to, so the LLM's own translated `result.dialogue`
+      //      remains authoritative.
+      //  (c) `dialogueLines` is EMPTY (this shot has no resolved source
+      //      dialogue at all, including a genuinely SILENT beat) — ANTI-LOCK-
+      //      IN FIX (root cause of "silent beat becomes speaking,
+      //      permanently"): persist `[]`, never `result.dialogue`. Before
+      //      this fix, whatever line the video-prompt LLM happened to invent
+      //      on a single call got written here as `matchingClip.dialogue`,
+      //      which `resolveShotDialogueLines`'s Source 1 ("most
+      //      authoritative") then returns on every LATER call — turning a
+      //      one-time guess into permanent, code-enforced "ground truth"
+      //      that the deterministic dialogue-stitch/render-time formatter
+      //      then force-quotes with lip-sync forever after, even though the
+      //      beat was never actually meant to speak. A guess must never be
+      //      allowed to become durable ground truth just because the
+      //      resolved source happened to be empty on one call — the NEXT
+      //      call keeps resolving from the same (still-empty) source and
+      //      gets a fresh chance, instead of being pinned to the first
+      //      LLM's improvisation. (`result.prompt` — the LLM's own composed
+      //      motion-prompt PROSE for THIS generation — is unaffected by this
+      //      fix; only whether the invented `dialogue[]` line becomes
+      //      persisted authoritative data changes.)
       const shouldPinDialogueToResolvedSource =
         dialogueLines.length > 0 &&
         (pack?.dialogueLanguage === "th" || pack?.dialogueLanguage === undefined);
       const persistedDialogue = shouldPinDialogueToResolvedSource
         ? dialogueLines
-        : result.dialogue;
+        : dialogueLines.length > 0
+          ? result.dialogue
+          : [];
 
       // Persist onto the matching clip — create a minimal clip entry if the
       // pack exists but has no matching clip, or a minimal pack if the pack
@@ -11883,7 +14088,13 @@ export const verticalDramaEpisodesRouter = router({
 
         await tx
           .update(verticalDramaEpisodes)
-          .set({ motionPromptPack: updatedPack, updatedAt: new Date() })
+          .set({
+            motionPromptPack: stampArtifactForStoryboard(
+              updatedPack as unknown as Record<string, unknown>,
+              row.storyboard,
+            ),
+            updatedAt: new Date(),
+          })
           .where(
             and(
               eq(verticalDramaEpisodes.id, episodeId),
@@ -12242,6 +14453,11 @@ export const verticalDramaEpisodesRouter = router({
           "library",
           "upload",
           "previous_main",
+          // Phase 6 (`planning/vd-start-frame-reference-mapping/plan.md`) —
+          // user-controlled supplementary reference frame, linked by the
+          // client after `generateShotReferenceFrameImage` completes.
+          // `varchar(20)` column, no migration needed.
+          "reference_frame",
         ]),
         sortOrder: z.number().int().min(0).optional(),
       })
diff --git a/apps/web/server/routers/verticalDramaLocations.ts b/apps/web/server/routers/verticalDramaLocations.ts
index 79d8692b4..10a536db9 100644
--- a/apps/web/server/routers/verticalDramaLocations.ts
+++ b/apps/web/server/routers/verticalDramaLocations.ts
@@ -91,7 +91,12 @@ import { readPresetVisualIdentityFromBible } from "../services/verticalDramaChar
 import {
   resolveCharacterImageModelId,
   resolveVdCharacterMcpTransportMetadata,
+  // Feature 135 — Hermes Grok media worker (section 09): the transport-
+  // neutral decision function, reused verbatim from `verticalDramaCharacters.ts`
+  // the same way the two MCP helpers above already are.
+  resolveVdCharacterMediaTransportDecision,
 } from "./verticalDramaCharacters";
+import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
 import { mediaGenerationLimiter } from "../services/rateLimiter";
 import { createAssetFromAttachment } from "../services/mediaAssetService";
 import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
@@ -494,18 +499,17 @@ export const verticalDramaLocationsRouter = router({
    * every prompt with "wide establishing shot, environment only, no
    * people:"), not a vertical character portrait or a 9:16 in-episode frame.
    *
-   * `selectedImageModelId`/`mcpConnectionId` (both optional — location
+   * `selectedImageModelId` (REQUIRED)/`mcpConnectionId` (optional — location
    * model-picker parity plan): the location tab's own model picker.
    * `selectedImageModelId` is resolved via `resolveCharacterImageModelId`
-   * (validated + must be enabled, falling back to `DEFAULT_MODELS.image`
-   * when absent — byte-identical resolution order to
-   * `generateCharacterImage`, reused verbatim, not duplicated — see this
-   * file's own top-of-file doc comment). `mcpConnectionId` is required only
-   * when the resolved model is MCP-transport (e.g. `higgsfield/*`,
-   * `magnific-mcp/*`) — see `resolveVdCharacterMcpTransportMetadata`, also
-   * reused verbatim. Absent `selectedImageModelId` is byte-identical to this
-   * procedure's pre-existing behavior (always priced + rendered against
-   * `DEFAULT_MODELS.image`).
+   * (validated + must be enabled). FAIL CLOSED: the caller must explicitly
+   * select a model — `resolveCharacterImageModelId` throws BAD_REQUEST when
+   * absent instead of silently falling back to `DEFAULT_MODELS.image`
+   * (byte-identical resolution behavior to `generateCharacterImage`, reused
+   * verbatim, not duplicated — see this file's own top-of-file doc comment).
+   * `mcpConnectionId` is required only when the resolved model is
+   * MCP-transport (e.g. `higgsfield/*`, `magnific-mcp/*`) — see
+   * `resolveVdCharacterMcpTransportMetadata`, also reused verbatim.
    */
   generateLocationImage: verticalDramaProcedure
     .input(
@@ -514,13 +518,18 @@ export const verticalDramaLocationsRouter = router({
         approvedPrompt: z.string().min(1).optional(),
         approvedNegativePrompt: z.string().optional(),
         // Caller-selected image model (location tab's own model picker) —
-        // validated + must be enabled; falls back to `DEFAULT_MODELS.image`
-        // when absent. See `resolveCharacterImageModelId`.
-        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
+        // validated + must be enabled. REQUIRED — no server-side fallback;
+        // throws BAD_REQUEST when absent. See `resolveCharacterImageModelId`.
+        selectedImageModelId: z.string().trim().min(1).max(128),
         // Required only when the selected model is MCP-transport (e.g.
         // `higgsfield/*`, `magnific-mcp/*`) — see
         // `resolveVdCharacterMcpTransportMetadata`.
         mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        // Feature 135 — Hermes Grok media worker (section 09, row 4).
+        // Required only when the resolved model is Hermes-transport and the
+        // caller has no default Hermes connection for images.
+        hermesConnectionId: z.string().max(64).optional(),
       }),
     )
     .mutation(async ({ ctx, input }) => {
@@ -614,8 +623,8 @@ export const verticalDramaLocationsRouter = router({
       // 2. Pre-flight credit check for the image render — a SEPARATE charge
       //    from the prompt-generation LLM call above. Prices + generates
       //    against the CALLER-SELECTED model (location tab's own picker),
-      //    falling back to `DEFAULT_MODELS.image` when none was selected —
-      //    same "caller selection -> DEFAULT_MODELS" resolution order as
+      //    which is now REQUIRED — `resolveCharacterImageModelId` throws
+      //    BAD_REQUEST when none was selected, same fail-closed behavior as
       //    `generateCharacterImage`.
       const resolvedImageModelId = await resolveCharacterImageModelId(input.selectedImageModelId);
       const [pricingRow] = await db
@@ -630,15 +639,6 @@ export const verticalDramaLocationsRouter = router({
       // convention as `generateCharacterImage`/`generateStartFrameImage`
       // (`deductCredits`/`refundCredits` throw on amount <= 0 by design).
       const shouldChargeImageCredits = imageCreditCost > 0;
-      if (shouldChargeImageCredits) {
-        const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
-        if (!hasImageCredits) {
-          throw new TRPCError({
-            code: "FORBIDDEN",
-            message: `Insufficient credits for location image render. Required: ${imageCreditCost}`,
-          });
-        }
-      }
 
       // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
       // dispatched through the service's MCP branch, not the default
@@ -647,15 +647,91 @@ export const verticalDramaLocationsRouter = router({
       // `verticalDramaCharacters.ts`). Resolved BEFORE the credit reservation
       // below (same ordering as `generateCharacterImage`) so a missing/
       // invalid MCP connection fails fast without having reserved credits.
-      const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
+      // Feature 135 — Hermes Grok media worker (section 09): resolve the
+      // transport-neutral decision FIRST — `mcp`/`gateway` fall through to
+      // the pre-existing code below byte-identically (delegates to
+      // `resolveVdCharacterMcpTransportMetadata` unchanged); `hermes` takes
+      // a completely separate early-return path, mirroring
+      // `generateCharacterImage`'s identical block. Resolved BEFORE the
+      // credit check/reserve below (not after) — structurally guarantees "no
+      // platform-credit reserve for hermes".
+      const transportDecision = await resolveVdCharacterMediaTransportDecision({
         tenantId,
         actorUserId: userId,
         assetType: "image",
         modelId: resolvedImageModelId,
         configJson: pricingModel.configJson,
         mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
       });
 
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
+        const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
+        if (!hasImageCredits) {
+          throw new TRPCError({
+            code: "FORBIDDEN",
+            message: `Insufficient credits for location image render. Required: ${imageCreditCost}`,
+          });
+        }
+      }
+
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
+          userId,
+          urls: referenceUrl ? [referenceUrl] : [],
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+          roleFor: () => "identity_lock",
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId: resolvedImageModelId,
+            configJson: pricingModel.configJson,
+          }).providerModelId ?? resolvedImageModelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: establishingPlatePrompt,
+          settings: { model: hermesProviderModelId, aspectRatio: "16:9", outputCount: 1 },
+          references,
+          entity: { type: "vertical_drama_location", id: String(locationId) },
+          traceId: hermesTraceId,
+          tenantId,
+          requestedByUserId: userId,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: establishingPlatePrompt,
+          extraParams: { __vd_series_id: String(seriesId), __vd_location_id: String(locationId) },
+          droppedReferenceCount,
+        });
+        return {
+          taskId: hermesTask.id,
+          establishingPlatePrompt,
+          negativePrompt,
+          promptModel,
+          creditsUsed: { promptGeneration: promptCreditsUsed, imageRender: 0 },
+          droppedReferenceCount,
+        };
+      }
+
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
+
       if (shouldChargeImageCredits) {
         // Reserve credits BEFORE starting the task — `media.getTask`
         // reconciles the reservation against actual usage once the task
diff --git a/apps/web/server/routers/verticalDramaSeries.ts b/apps/web/server/routers/verticalDramaSeries.ts
index 70ca828d8..5f89634d4 100644
--- a/apps/web/server/routers/verticalDramaSeries.ts
+++ b/apps/web/server/routers/verticalDramaSeries.ts
@@ -56,7 +56,10 @@ import {
   modelProviderMap,
   type VerticalDramaSeriesRow,
   type VerticalDramaGenrePresetRow,
+  type VerticalDramaCharacterRow,
   type VerticalDramaMemoryEventRow,
+  /** Production-grade full-story generation — see `loadSeriesLocationFacts` below. */
+  type VerticalDramaLocationRow,
 } from "../../drizzle/schema";
 import type {
   VerticalDramaStartFramePlan,
@@ -106,6 +109,13 @@ import {
   type VerticalDramaEpisodeBreakdownItem,
 } from "@shared/verticalDramaSeries/contentBudget";
 import type { VerticalDramaQualityLedgers } from "@shared/verticalDramaSeries/qualityLedgers";
+import {
+  normalizeLegacyRole,
+  narrativeRoleSchema,
+  roleTierSchema,
+  type NarrativeRole,
+  type RoleTier,
+} from "@shared/verticalDramaSeries/narrativeRole";
 /**
  * Series-level audience age rating (Phase 1 of a 2-phase feature — later
  * phases thread it into per-episode stages) — single source of truth for
@@ -166,6 +176,23 @@ import {
   readItemWorldRules,
   type DeepDraftRecapEpisode,
   type StoredEpisodeBreakdownItem,
+  /**
+   * Production-grade full-story generation
+   * (`planning/vertical-drama-full-story-production-grade`, added
+   * 2026-07-13) — `newLocations` on `generateStoryBibleDeep`'s result, the
+   * shape persisted into `vertical_drama_locations` after the bible write —
+   * see `runGenerateStoryBibleDeepJob` below.
+   */
+  type VdDeclaredLocation,
+  /**
+   * Resilient resume (added 2026-07-14,
+   * `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — the
+   * shape of a single deep-drafted episode; used to type the
+   * `resumeDraftedItems` a checkpoint's `unknown[]` `draftedItems` gets cast
+   * back to (see `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob`
+   * below), matching `mergeDeepDraftItems`'s own draftedItems shape.
+   */
+  type DeepDraftedEpisodeItem,
 } from "../services/verticalDramaStoryBible";
 /**
  * Async story jobs (#28, added 2026-07-08) — generic submit -> jobId -> poll
@@ -180,6 +207,15 @@ import {
   submitVerticalDramaSystemFeedback,
   type VerticalDramaStoryJobPayload,
   type VerticalDramaStoryJobProgress,
+  /**
+   * Resilient resume (added 2026-07-14) — `VerticalDramaStoryJobResumeContext`
+   * is `runVerticalDramaStoryJobExecutor`'s new 3rd parameter (see
+   * `verticalDramaStoryJobs.ts`'s own doc comment); `VerticalDramaStoryJobCheckpoint`
+   * types the (domain-agnostic, `draftedItems: unknown[]`) checkpoint shape
+   * this router casts back to `DeepDraftedEpisodeItem[]`.
+   */
+  type VerticalDramaStoryJobResumeContext,
+  type VerticalDramaStoryJobCheckpoint,
 } from "../services/verticalDramaStoryJobs";
 /**
  * "ปรับปรุงบทละครให้มีความสมบูรณ์" (added 2026-07-10) — replaces the season
@@ -292,6 +328,24 @@ import {
   VerticalDramaArcReplanGuardViolationError,
 } from "../services/verticalDramaArcReplan";
 import { verticalDramaSeriesMemoryService } from "../services/verticalDramaSeriesMemory";
+/**
+ * Production-grade full-story generation
+ * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
+ * — persists a deep story draft run's `new_locations` declarations into
+ * `vertical_drama_locations`; see `runGenerateStoryBibleDeepJob` below.
+ */
+import { persistDeepDraftDeclaredLocations } from "../services/verticalDramaLocationReconciliation";
+/**
+ * Auto-register story-introduced characters (`planning/vd-auto-register-story-characters/plan.md`)
+ * — INSERT-capable counterpart to this file's own `reconcileCharactersFromStoryBible`
+ * (which is UPDATE-only); persists a deep story draft run's dialogue
+ * speakers / shot `characters[]` names that are new to the roster; see
+ * `runGenerateStoryBibleDeepJob` / `runExtendStoryDraftHorizonJob` below.
+ */
+import {
+  ensureRosterCharactersFromStory,
+  type VdRosterAutoRegisterSummary,
+} from "../services/verticalDramaCharacterRosterAutoRegister";
 import { debugError } from "../_core/logger";
 import {
   resolveSeriesThumbnailUrls,
@@ -484,7 +538,14 @@ type GenrePresetDto = {
   seasonArc: string;
   tone: string;
   cliffhangerStyle: string;
-  characters: Array<{ name: string; role: string; description: string }>;
+  characters: Array<{
+    name: string;
+    role: string;
+    description: string;
+    narrativeRole?: NarrativeRole;
+    roleTier?: RoleTier;
+    occupation?: string;
+  }>;
   visualBible: string;
   /** VerticalDramaPresetVisualIdentity (spec 131 §8.2.2) — null for legacy presets */
   visualIdentityJson?: unknown;
@@ -695,6 +756,8 @@ async function recordDeepStoryDraftAuditEvent(params: {
   mode: VerticalDramaDeepStoryDraftMode;
   /** Live-bug fix (added 2026-07-08) — episode numbers still missing after chunk processing; see `GenerateStoryBibleDeepResult.missingEpisodes`. Always present (may be `[]`), per the LLM/Media debugging protocol's "audit log has the answer" rule. */
   missingEpisodes: number[];
+  /** Production-grade full-story generation, added 2026-07-13 — count of NEW `vertical_drama_locations` rows this run's declarations actually created (never counts a skipped-existing key). Optional — omitted for the `"extend"` action until that path is wired to the same persistence step. */
+  createdLocationCount?: number;
 }): Promise<void> {
   try {
     await db.insert(apiAuditEvents).values({
@@ -714,6 +777,7 @@ async function recordDeepStoryDraftAuditEvent(params: {
         idempotencyKey: params.idempotencyKey ?? null,
         mode: params.mode,
         missingEpisodes: params.missingEpisodes,
+        createdLocationCount: params.createdLocationCount ?? 0,
       },
     });
   } catch (error) {
@@ -725,6 +789,37 @@ async function recordDeepStoryDraftAuditEvent(params: {
   }
 }
 
+/**
+ * Deep-draft generate/extend `createdCharacters` response field
+ * (`planning/vd-stuck-generation-and-lost-characters/plan.md`, Set B) — the
+ * compact shape both `runGenerateStoryBibleDeepJob` and
+ * `runExtendStoryDraftHorizonJob` surface, mirroring the pre-existing
+ * `createdLocationCount` convention (always present, never `undefined`,
+ * zero/empty when the run auto-registered nothing). Unlike
+ * `createdLocationCount` (a bare number — locations don't need a name list
+ * client-side), this carries `names` too since the client's post-run
+ * toast/banner (B-client) names the newly-registered characters.
+ */
+export interface VdDeepDraftCreatedCharactersSummary {
+  count: number;
+  names: string[];
+}
+
+const EMPTY_DEEP_DRAFT_CREATED_CHARACTERS: VdDeepDraftCreatedCharactersSummary = {
+  count: 0,
+  names: [],
+};
+
+/** Projects `ensureRosterCharactersFromStory`'s `VdRosterAutoRegisterSummary` (previously discarded at both call sites) into the compact response shape above. */
+function toDeepDraftCreatedCharactersSummary(
+  summary: VdRosterAutoRegisterSummary
+): VdDeepDraftCreatedCharactersSummary {
+  return {
+    count: summary.createdCharacters.length,
+    names: summary.createdCharacters.map((c) => c.name),
+  };
+}
+
 /**
  * Merge freshly deep-drafted episode data onto the EXISTING active
  * breakdown (owner-approved design point 5): only `shotDrafts` /
@@ -762,6 +857,126 @@ function mergeDeepDraftItems(
   });
 }
 
+/**
+ * Resilient resume (added 2026-07-14,
+ * `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — computes
+ * what `generateStoryBibleDeep`'s new `resumeDraftedItems`/
+ * `alreadyDraftedEpisodeNumbers` params should be for THIS run, shared by
+ * both `runGenerateStoryBibleDeepJob` and `runExtendStoryDraftHorizonJob`
+ * (same "small helper shared by both deep-draft executors" convention as
+ * `mergeDeepDraftItems` above).
+ *
+ * Two independent sources feed the skip set, unioned together:
+ *  1. `resume.checkpoint.completedEpisodeNumbers` — episodes THIS SAME job
+ *     (a same-jobId BullMQ redelivery after a mid-run crash) already
+ *     checkpointed earlier in an interrupted attempt. Applies REGARDLESS of
+ *     `mode` — this is the core crash-resume mechanism, not a plot-scope
+ *     decision.
+ *  2. Episodes already carrying a valid `VD_DEEP_DRAFT_SHOTS_PER_EPISODE`-shot
+ *     `shotDrafts` in the CURRENT active breakdown (`readItemShotDrafts(item)
+ *     !== null`) — but see the note below on why NO `mode`-based gate is
+ *     needed for this source.
+ *
+ * On "keep vs. rewrite plot" and `mode`: the task brief for this feature
+ * described gating source #2 on `VerticalDramaDeepStoryDraftMode` ("standard"
+ * = "keep the current plot", "premium" = "rewrite the plot"), asking that
+ * source #2 apply ONLY for "keep". That mapping does not hold against the
+ * real code — `mode` here is a QUALITY TIER (`generateStoryBibleDeep` single-
+ * pass vs. `generateStoryBibleDeepPremium`'s fan-out/judge/revise pipeline),
+ * orthogonal to plot scope; BOTH modes only ADD shot-level detail onto
+ * already-planned episodes and NEVER touch `workingTitle`/`logline`/
+ * `keyBeats` (see `generateStoryBibleDeep`'s own doc comment, and this
+ * router's `generateStoryBibleDeep` mutation's doc comment: "never invents
+ * new ... it never invents new workingTitle/logline/keyBeats/contentBudget").
+ * The actual "keep the current plot" vs. "rewrite everything" choice is a
+ * CLIENT-ONLY concept (`VerticalDramaDeepStoryDraftsPanel.tsx`'s
+ * `VerticalDramaDeepDraftScope`, never sent to the server): "rewrite"
+ * mechanically means the client calls the separate `generateStoryBible`
+ * mutation FIRST (an entirely different code path — it replaces
+ * `bible.episodeBreakdown` wholesale with brand-new items that have no
+ * `shotDrafts` at all) and only THEN enqueues this job. By the time THIS
+ * executor reads the active breakdown, a "rewrite" run's episodes therefore
+ * never have `shotDrafts` yet — source #2 naturally finds nothing to skip,
+ * with no `mode`-based special-casing required. A "keep" run's episodes may
+ * genuinely already have `shotDrafts` (from an earlier completed run), and
+ * skipping those is exactly the credit-safety behavior this feature exists
+ * for. Applying source #2 unconditionally is therefore BOTH simpler and
+ * strictly more correct than gating it on `mode` (which cannot express plot
+ * scope at all) — see this task's own Result Report for the full conflict
+ * writeup against the original brief.
+ */
+function resolveDeepDraftResumeState(
+  activeBreakdownItems: StoredEpisodeBreakdownItem[],
+  resume: VerticalDramaStoryJobResumeContext
+): {
+  alreadyDraftedEpisodeNumbers: number[];
+  resumeDraftedItems: DeepDraftedEpisodeItem[];
+} {
+  const alreadyDraftedFromBible = new Set(
+    activeBreakdownItems
+      .filter(item => readItemShotDrafts(item) !== null)
+      .map(item => item.episodeNumber)
+  );
+  const alreadyDraftedFromCheckpoint = new Set(
+    resume.checkpoint?.completedEpisodeNumbers ?? []
+  );
+  const alreadyDraftedEpisodeNumbers = [
+    ...new Set([...alreadyDraftedFromBible, ...alreadyDraftedFromCheckpoint]),
+  ];
+  const resumeDraftedItems = (resume.checkpoint?.draftedItems ??
+    []) as DeepDraftedEpisodeItem[];
+  return { alreadyDraftedEpisodeNumbers, resumeDraftedItems };
+}
+
+/**
+ * Resilient resume — wires `generateStoryBibleDeep`'s `onChunkComplete` to
+ * the job's `persistCheckpoint`, maintaining a local running accumulator
+ * (full-replacement, not a delta) across every chunk this run completes so
+ * each checkpoint write is race-free and self-contained (see
+ * `VerticalDramaStoryJobResumeContext.persistCheckpoint`'s own doc comment
+ * on why a full replacement is the simplest race-free shape). Seeded from
+ * the RESUMED checkpoint (if any) so a job that resumes and then completes
+ * ANOTHER chunk before finishing/crashing again still checkpoints the FULL
+ * set, not just this run's own new chunks.
+ */
+function createDeepDraftCheckpointRelay(
+  resume: VerticalDramaStoryJobResumeContext
+): (chunkDraftedItems: DeepDraftedEpisodeItem[]) => void {
+  let draftedItems: DeepDraftedEpisodeItem[] = [
+    ...((resume.checkpoint?.draftedItems ?? []) as DeepDraftedEpisodeItem[]),
+  ];
+  let completedEpisodeNumbers: number[] = [
+    ...(resume.checkpoint?.completedEpisodeNumbers ?? []),
+  ];
+  let chunkSizesDone: number[] = [...(resume.checkpoint?.chunkSizesDone ?? [])];
+
+  return (chunkDraftedItems: DeepDraftedEpisodeItem[]) => {
+    draftedItems = [...draftedItems, ...chunkDraftedItems];
+    completedEpisodeNumbers = [
+      ...completedEpisodeNumbers,
+      ...chunkDraftedItems.map(item => item.episodeNumber),
+    ];
+    chunkSizesDone = [...chunkSizesDone, chunkDraftedItems.length];
+    const checkpoint: VerticalDramaStoryJobCheckpoint = {
+      draftedItems,
+      completedEpisodeNumbers,
+      chunkSizesDone,
+      // Credits bookkeeping only (Redis checkpoint observability, NOT the
+      // real charged amount) — `onChunkComplete` doesn't carry the chunk's
+      // actual spend, so this is the same PER-CALL ESTIMATE
+      // `estimateDeepDraftJobCredits`'s own pre-check math uses, times the
+      // chunk count checkpointed so far. The FINAL response's `creditsUsed`
+      // still comes from `generateStoryBibleDeep`'s own real
+      // `result.creditsUsed` for THIS run's newly-drafted chunks, unaffected
+      // by this estimate.
+      creditsUsed:
+        chunkSizesDone.length * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE,
+      updatedAt: new Date().toISOString(),
+    };
+    resume.persistCheckpoint(checkpoint);
+  };
+}
+
 /* -------------------------------------------------------------------------- */
 /* Async story jobs (#28, added 2026-07-08) — shared helpers                  */
 /* -------------------------------------------------------------------------- */
@@ -1117,14 +1332,81 @@ async function resolveTieInDraftBootstrap(params: {
   };
 }
 
+/**
+ * Production-grade full-story generation
+ * (`planning/vertical-drama-full-story-production-grade`, added 2026-07-13)
+ * — loads THIS series' existing `vertical_drama_locations` roster as
+ * prompt/gate FACTS (`GenerateStoryBibleDeepParams.existingLocations`):
+ * `locationKey`, `name`, and a short description extracted from the `data`
+ * jsonb (`data.description` when present, undefined otherwise — the deep
+ * story draft prompt/gate treat an absent description as "no summary
+ * available", never a hard requirement).
+ *
+ * Best-effort — NEVER throws (a query failure degrades to `[]`, exactly
+ * like every other side-fact read in this file, e.g.
+ * `resolveTieInDraftBootstrap`'s defensive `productTieIn` reads): the deep
+ * story draft run must never be blocked by a location-roster lookup
+ * problem, and an empty roster is a perfectly valid "no known locations yet"
+ * fact for a brand-new series anyway.
+ */
+async function loadSeriesLocationFacts(
+  tenantId: string,
+  userId: number,
+  seriesId: number
+): Promise<
+  Array<{ locationKey: string; name: string; description?: string }>
+> {
+  let rows: VerticalDramaLocationRow[];
+  try {
+    rows = await db
+      .select()
+      .from(verticalDramaLocations)
+      .where(
+        and(
+          eq(verticalDramaLocations.tenantId, tenantId),
+          eq(verticalDramaLocations.userId, userId),
+          eq(verticalDramaLocations.seriesId, seriesId)
+        )
+      );
+  } catch (error) {
+    debugError(
+      "verticalDramaSeries.deepStoryDraft",
+      "Failed to load existing locations for deep story draft generation — continuing with an empty roster",
+      error
+    );
+    return [];
+  }
+  return rows.map(row => {
+    const data = (row.data as Record<string, unknown> | null) ?? null;
+    const description =
+      data &&
+      typeof data.description === "string" &&
+      data.description.trim().length > 0
+        ? data.description
+        : undefined;
+    return { locationKey: row.locationKey, name: row.name, description };
+  });
+}
+
 export async function runGenerateStoryBibleDeepJob(
   params: StoryJobExecutorOwner & {
     horizonEpisodes?: number;
     mode?: VerticalDramaDeepStoryDraftMode;
     idempotencyKey?: string;
   },
-  onProgress: (progress: VerticalDramaStoryJobProgress) => void
+  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
+  /**
+   * Resilient resume (added 2026-07-14) — optional so every EXISTING test
+   * call site (which predates this param) keeps compiling and running
+   * byte-identically: `resume ?? { checkpoint: null, persistCheckpoint: () => {} }`
+   * below makes a call site that never passes it behave exactly like there
+   * is no checkpoint and no resume — a fresh run, drafting every requested
+   * episode, exactly like today.
+   */
+  resume?: VerticalDramaStoryJobResumeContext
 ) {
+  const resolvedResume: VerticalDramaStoryJobResumeContext =
+    resume ?? { checkpoint: null, persistCheckpoint: () => {} };
   const { tenantId, userId, seriesId } = params;
   const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
   const formatProfilesEnabled =
@@ -1174,6 +1456,35 @@ export async function runGenerateStoryBibleDeepJob(
     });
   }
 
+  // Production-grade full-story generation — the series' known location
+  // roster + character-bible names, threaded into the deep-draft prompt
+  // ("EXISTING LOCATIONS" FACT block) and the deterministic completeness
+  // gate (`location_key`/character-name membership checks). Loaded ONCE,
+  // BEFORE generation, so every chunk this run sees the SAME pre-run
+  // baseline — `generateStoryBibleDeep` grows its own in-memory copy as
+  // `new_locations` are accepted chunk-by-chunk within this one run.
+  const existingLocations = await loadSeriesLocationFacts(
+    tenantId,
+    userId,
+    seriesId
+  );
+  const characterBibleNames = readBibleRefinedCharacters(bible).map(
+    c => c.name
+  );
+
+  // Resilient resume — see `resolveDeepDraftResumeState`'s own doc comment
+  // for why source #2 (already-drafted-in-the-bible) applies unconditionally
+  // (no `mode` gate). Supported by BOTH modes: `generateStoryBibleDeep`
+  // forwards `resumeDraftedItems`/`alreadyDraftedEpisodeNumbers`/
+  // `onChunkComplete` straight through to `generateStoryBibleDeepPremium`
+  // when `mode === "premium"` (its own mode-switch at the very top passes
+  // `params` on unchanged) — see that function's own doc comment for its
+  // skip/union mechanics, which differ slightly from standard mode's
+  // (union happens at the END there, not seeded into a growing accumulator).
+  const { alreadyDraftedEpisodeNumbers, resumeDraftedItems } =
+    resolveDeepDraftResumeState(existingItems, resolvedResume);
+  const onChunkComplete = createDeepDraftCheckpointRelay(resolvedResume);
+
   let ledgerPlan: {
     ledgers: VerticalDramaQualityLedgers;
     creditsUsed: number;
@@ -1205,6 +1516,10 @@ export async function runGenerateStoryBibleDeepJob(
       episodeDurationSeconds: row.defaultEpisodeDurationSeconds,
       episodes: episodesToDraft,
       mode,
+      // Resilient resume — see the doc comment on this const block above.
+      resumeDraftedItems,
+      alreadyDraftedEpisodeNumbers,
+      onChunkComplete,
       // F131X + finale price_paid rule (both dormant without these — the
       // service's optional params default off; see #23's wiring note)
       totalEpisodeCount: row.targetEpisodeCount ?? undefined,
@@ -1223,6 +1538,10 @@ export async function runGenerateStoryBibleDeepJob(
       // above; always resolves to a concrete tier (defaults to the
       // least-restrictive "18plus" when absent/invalid).
       audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
+      // Production-grade full-story generation — see this function's own
+      // "existingLocations"/"characterBibleNames" load above.
+      existingLocations,
+      characterBibleNames,
       onProgress,
     });
   } catch (error) {
@@ -1245,13 +1564,62 @@ export async function runGenerateStoryBibleDeepJob(
   }
 
   const mergedItems = mergeDeepDraftItems(existingItems, result.draftedItems);
-  const horizonEndEpisode = result.draftedItems.reduce(
-    (max, item) => Math.max(max, item.episodeNumber),
+  // Silent-no-op fix (plan
+  // `planning/vertical-drama-deep-draft-update-all-noop`, added 2026-07-14)
+  // — compute over the MERGED (existing + newly-drafted) state, not just
+  // `result.draftedItems`. The old computation regressed
+  // `deepDraft.horizonEndEpisode` to 0 whenever a run drafted zero new
+  // episodes (empty `draftedItems.reduce(Math.max, 0) === 0`), even though
+  // episodes were already drafted from a prior run — see the plan's
+  // "secondary defect" section. This version never regresses: it's always
+  // the highest episode number that actually has shot drafts right now.
+  const horizonEndEpisode = mergedItems.reduce(
+    (max, item) =>
+      readItemShotDrafts(item) !== null
+        ? Math.max(max, item.episodeNumber)
+        : max,
     0
   );
   const generatedAt = new Date().toISOString();
   const totalCreditsUsed = result.creditsUsed + (ledgerPlan?.creditsUsed ?? 0);
 
+  // Defense-in-depth for an enqueue-then-state-changed race (added
+  // 2026-07-14, same plan as above) — the mutation's early-return (see
+  // `generateStoryBibleDeep`'s `remainingToDraft` guard) normally prevents a
+  // doomed "nothing to draft" job from ever being enqueued, but state can
+  // still shift between enqueue and this worker actually running (e.g. a
+  // concurrent run on the same series already drafted everything in the
+  // meantime). When that happens, `result.draftedItems` comes back empty
+  // and there is no ledger plan to persist either — skip the
+  // `appendBreakdownVersion` + bible write entirely (no junk version, no
+  // horizon regression) and return the CURRENT already-complete state with
+  // the corrected horizon computed above.
+  if (result.draftedItems.length === 0 && !ledgerPlan) {
+    return {
+      series: { ...row, id: String(row.id) },
+      creditsUsed: totalCreditsUsed,
+      model: result.model,
+      partial: false,
+      horizonEndEpisode,
+      chunkSizes: [],
+      warnings: result.warnings,
+      error: undefined,
+      mode,
+      callsMade: 0,
+      missingEpisodes: [],
+      tieInMismatchCount: result.tieInMismatchCount,
+      createdLocationCount: 0,
+      // Set B — this early-return path skips `ensureRosterCharactersFromStory`
+      // entirely (zero drafting work happened), so mirror `createdLocationCount`'s
+      // `0` above with the same "always present" empty shape.
+      createdCharacters: EMPTY_DEEP_DRAFT_CREATED_CHARACTERS,
+      // Signals to callers (tests, and any future caller) that this run
+      // did zero drafting work — distinct from `partial`, which means "did
+      // some work but stopped early on an error".
+      nothingDrafted: true,
+    };
+  }
+
   const nextBible = appendBreakdownVersion(bible, {
     source: "generate_story",
     items: mergedItems,
@@ -1271,6 +1639,68 @@ export async function runGenerateStoryBibleDeepJob(
     .where(seriesOwnershipWhere(tenantId, userId, seriesId))
     .returning();
 
+  // Production-grade full-story generation — persist any NEW locations this
+  // run declared into the durable `vertical_drama_locations` roster (Tab
+  // ฉาก), AFTER the bible write succeeds. Best-effort: a failure here must
+  // never fail the whole mutation or roll back the bible write, mirroring
+  // this router's established "audit/side-effect write must not fail the
+  // user-facing mutation" convention (see `recordDeepStoryDraftAuditEvent`'s
+  // own doc comment). Never overwrites an existing location's data — see
+  // `persistDeepDraftDeclaredLocations`'s own doc comment.
+  let createdLocationCount = 0;
+  // `result.newLocations ?? []` defensively tolerates a test double / older
+  // in-flight mock of `generateStoryBibleDeep` that predates this field —
+  // the REAL service always returns `[]` at minimum (see
+  // `GenerateStoryBibleDeepResult.newLocations`'s own doc comment).
+  const declaredNewLocations = result.newLocations ?? [];
+  if (declaredNewLocations.length > 0) {
+    try {
+      const locationPersistSummary = await persistDeepDraftDeclaredLocations(
+        { tenantId, userId, seriesId },
+        declaredNewLocations
+      );
+      createdLocationCount = locationPersistSummary.createdLocations.length;
+    } catch (error) {
+      debugError(
+        "verticalDramaSeries.deepStoryDraft",
+        "Failed to persist deep story draft declared locations",
+        error
+      );
+    }
+  }
+
+  // Auto-register story-introduced characters
+  // (`planning/vd-auto-register-story-characters/plan.md`) — same
+  // "best-effort, AFTER the bible write succeeds, never fail/roll back the
+  // user-facing mutation" convention as the location block just above.
+  // Candidates: this run's newly-drafted shots' `characters[]`/dialogue
+  // `speaker`s (`result.draftedItems`) PLUS the Story Bible's own
+  // `refinedCharacters` list (`characterBibleNames`, already loaded above
+  // for the deep-draft prompt) — see `ensureRosterCharactersFromStory`'s own
+  // doc comment for why the two sources are trusted differently.
+  //
+  // Set B — the returned `VdRosterAutoRegisterSummary` used to be discarded
+  // here; now captured into the mutation's `createdCharacters` response
+  // field (mirrors `createdLocationCount` just above), `EMPTY_...` on any
+  // failure (this best-effort block must never fail the mutation).
+  let createdCharacters: VdDeepDraftCreatedCharactersSummary = EMPTY_DEEP_DRAFT_CREATED_CHARACTERS;
+  try {
+    const rosterAutoRegisterSummary = await ensureRosterCharactersFromStory(
+      { tenantId, userId, seriesId },
+      {
+        refinedCharacters: characterBibleNames.map(name => ({ name })),
+        deepDraftShots: result.draftedItems.flatMap(item => item.shotDrafts),
+      }
+    );
+    createdCharacters = toDeepDraftCreatedCharactersSummary(rosterAutoRegisterSummary);
+  } catch (error) {
+    debugError(
+      "verticalDramaSeries.deepStoryDraft",
+      "Failed to auto-register story-introduced characters",
+      error
+    );
+  }
+
   await recordDeepStoryDraftAuditEvent({
     userId,
     seriesId,
@@ -1282,6 +1712,7 @@ export async function runGenerateStoryBibleDeepJob(
     idempotencyKey: params.idempotencyKey,
     mode,
     missingEpisodes: result.missingEpisodes,
+    createdLocationCount,
   });
 
   // Phase F (added 2026-07-09) — additive error-shaped audit event + auto
@@ -1383,6 +1814,23 @@ export async function runGenerateStoryBibleDeepJob(
     // active this run (see `GenerateStoryBibleDeepResult.tieInMismatchCount`'s
     // own doc comment).
     tieInMismatchCount: result.tieInMismatchCount,
+    // Production-grade full-story generation — count of NEW locations this
+    // run declared AND persisted into `vertical_drama_locations` (Tab ฉาก);
+    // always a number (never `undefined`), `0` when this run declared none.
+    createdLocationCount,
+    // Set B (vd-stuck-generation-and-lost-characters plan) — dialogue
+    // speakers / shot characters this run auto-registered into the roster
+    // (no DNA/portrait yet); always present, empty when none. See
+    // `VdDeepDraftCreatedCharactersSummary`'s own doc comment.
+    createdCharacters,
+    // Silent-no-op fix (plan
+    // `planning/vertical-drama-deep-draft-update-all-noop`, added
+    // 2026-07-14) — mirrors the early-return branch above so both shapes of
+    // this function's return value carry the same field; `false` here
+    // because reaching this point means `result.draftedItems.length > 0` OR
+    // a `ledgerPlan` was persisted (the early-return above is the only path
+    // that skips this bible write with zero drafted items).
+    nothingDrafted: result.draftedItems.length === 0,
   };
 }
 
@@ -1392,8 +1840,12 @@ export async function runExtendStoryDraftHorizonJob(
     mode?: VerticalDramaDeepStoryDraftMode;
     idempotencyKey?: string;
   },
-  onProgress: (progress: VerticalDramaStoryJobProgress) => void
+  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
+  /** Resilient resume (added 2026-07-14) — see `runGenerateStoryBibleDeepJob`'s identical param doc comment. */
+  resume?: VerticalDramaStoryJobResumeContext
 ) {
+  const resolvedResume: VerticalDramaStoryJobResumeContext =
+    resume ?? { checkpoint: null, persistCheckpoint: () => {} };
   const { tenantId, userId, seriesId } = params;
   const mode: VerticalDramaDeepStoryDraftMode = params.mode ?? "standard";
   const formatProfilesEnabled =
@@ -1470,6 +1922,32 @@ export async function runExtendStoryDraftHorizonJob(
       cliffhangerLine: readItemCliffhangerLine(item),
     }));
 
+  // Production-grade full-story generation — parity with
+  // `runGenerateStoryBibleDeepJob`: the series' known location roster +
+  // character-bible names, threaded into the deep-draft prompt ("EXISTING
+  // LOCATIONS" FACT block) and the deterministic completeness gate. Loaded
+  // ONCE, BEFORE generation, so every extended chunk sees the SAME pre-run
+  // baseline (including locations already declared by the earlier
+  // generate/extend runs that populated `vertical_drama_locations`), and
+  // `generateStoryBibleDeep` grows its own in-memory copy as this run's
+  // `new_locations` are accepted chunk-by-chunk.
+  const existingLocations = await loadSeriesLocationFacts(
+    tenantId,
+    userId,
+    seriesId
+  );
+  const characterBibleNames = readBibleRefinedCharacters(bible).map(
+    c => c.name
+  );
+
+  // Resilient resume — see `runGenerateStoryBibleDeepJob`'s identical block
+  // and `resolveDeepDraftResumeState`'s own doc comment for the full
+  // rationale (applies here too, since `episodesToDraft` above can still
+  // include an episode a prior INTERRUPTED extend attempt already drafted).
+  const { alreadyDraftedEpisodeNumbers, resumeDraftedItems } =
+    resolveDeepDraftResumeState(existingItems, resolvedResume);
+  const onChunkComplete = createDeepDraftCheckpointRelay(resolvedResume);
+
   let ledgerPlan: {
     ledgers: VerticalDramaQualityLedgers;
     creditsUsed: number;
@@ -1502,6 +1980,10 @@ export async function runExtendStoryDraftHorizonJob(
       episodes: episodesToDraft,
       priorRecap: { items: recapItems, openThreads: [] },
       mode,
+      // Resilient resume — see the doc comment on this const block above.
+      resumeDraftedItems,
+      alreadyDraftedEpisodeNumbers,
+      onChunkComplete,
       // F131X + finale price_paid rule (see runGenerateStoryBibleDeepJob)
       totalEpisodeCount: row.targetEpisodeCount ?? undefined,
       formatProfilesEnabled,
@@ -1515,6 +1997,10 @@ export async function runExtendStoryDraftHorizonJob(
       // Series-level audience age rating (Phase 1) — see
       // `runGenerateStoryBibleDeepJob`'s identical wiring.
       audienceAgeRating: resolveAudienceAgeRating(bible.audienceAgeRating),
+      // Production-grade full-story generation — parity with
+      // `runGenerateStoryBibleDeepJob`; see the load just above this try.
+      existingLocations,
+      characterBibleNames,
       onProgress,
     });
   } catch (error) {
@@ -1563,6 +2049,56 @@ export async function runExtendStoryDraftHorizonJob(
     .where(seriesOwnershipWhere(tenantId, userId, seriesId))
     .returning();
 
+  // Production-grade full-story generation — parity with
+  // `runGenerateStoryBibleDeepJob`: persist any NEW locations this extend run
+  // declared into the durable `vertical_drama_locations` roster (Tab ฉาก),
+  // AFTER the bible write succeeds. Best-effort (a failure here must never
+  // fail the mutation or roll back the bible write); never overwrites an
+  // existing location — see `persistDeepDraftDeclaredLocations`'s own doc
+  // comment. `result.newLocations ?? []` defensively tolerates a test double
+  // predating the field; the real service always returns `[]` at minimum.
+  let createdLocationCount = 0;
+  const declaredNewLocations = result.newLocations ?? [];
+  if (declaredNewLocations.length > 0) {
+    try {
+      const locationPersistSummary = await persistDeepDraftDeclaredLocations(
+        { tenantId, userId, seriesId },
+        declaredNewLocations
+      );
+      createdLocationCount = locationPersistSummary.createdLocations.length;
+    } catch (error) {
+      debugError(
+        "verticalDramaSeries.deepStoryDraft",
+        "Failed to persist deep story draft declared locations (extend)",
+        error
+      );
+    }
+  }
+
+  // Auto-register story-introduced characters
+  // (`planning/vd-auto-register-story-characters/plan.md`) — parity with
+  // `runGenerateStoryBibleDeepJob`'s identical block above; see that block's
+  // own doc comment for the full rationale.
+  //
+  // Set B — see `runGenerateStoryBibleDeepJob`'s identical capture above.
+  let createdCharacters: VdDeepDraftCreatedCharactersSummary = EMPTY_DEEP_DRAFT_CREATED_CHARACTERS;
+  try {
+    const rosterAutoRegisterSummary = await ensureRosterCharactersFromStory(
+      { tenantId, userId, seriesId },
+      {
+        refinedCharacters: characterBibleNames.map(name => ({ name })),
+        deepDraftShots: result.draftedItems.flatMap(item => item.shotDrafts),
+      }
+    );
+    createdCharacters = toDeepDraftCreatedCharactersSummary(rosterAutoRegisterSummary);
+  } catch (error) {
+    debugError(
+      "verticalDramaSeries.deepStoryDraft",
+      "Failed to auto-register story-introduced characters (extend)",
+      error
+    );
+  }
+
   await recordDeepStoryDraftAuditEvent({
     userId,
     seriesId,
@@ -1574,6 +2110,7 @@ export async function runExtendStoryDraftHorizonJob(
     idempotencyKey: params.idempotencyKey,
     mode,
     missingEpisodes: result.missingEpisodes,
+    createdLocationCount,
   });
 
   // Phase F parity fix (deferred note, added 2026-07-09) — `runExtendStoryDraftHorizonJob`
@@ -1671,6 +2208,12 @@ export async function runExtendStoryDraftHorizonJob(
     missingEpisodes: result.missingEpisodes,
     // Task #22 — see `runGenerateStoryBibleDeepJob`'s identical field.
     tieInMismatchCount: result.tieInMismatchCount,
+    // Production-grade full-story generation — see
+    // `runGenerateStoryBibleDeepJob`'s identical field; count of NEW locations
+    // this extend run persisted into Tab ฉาก (always a number, `0` when none).
+    createdLocationCount,
+    // Set B — see `runGenerateStoryBibleDeepJob`'s identical field.
+    createdCharacters,
   };
 }
 
@@ -1684,7 +2227,18 @@ export async function runExtendStoryDraftHorizonJob(
  */
 export async function runVerticalDramaStoryJobExecutor(
   payload: VerticalDramaStoryJobPayload,
-  onProgress: (progress: VerticalDramaStoryJobProgress) => void
+  onProgress: (progress: VerticalDramaStoryJobProgress) => void,
+  /**
+   * Resilient resume (added 2026-07-14) — always passed by
+   * `runVerticalDramaStoryJob` (this is the concrete
+   * `VerticalDramaStoryJobExecutor` registered onto the BullMQ worker, see
+   * `verticalDramaStoryJobs.ts`'s `initVerticalDramaStoryJobsQueue`), so this
+   * stays a required param here (unlike the two job functions it dispatches
+   * to below, which keep it optional for their own pre-existing test call
+   * sites). Only `"deep_generate"`/`"extend"` forward it — `"improve_script"`
+   * has no checkpoint/resume concept of its own and simply never reads it.
+   */
+  resume: VerticalDramaStoryJobResumeContext
 ): Promise<unknown> {
   const owner: StoryJobExecutorOwner = {
     tenantId: payload.tenantId,
@@ -1702,7 +2256,8 @@ export async function runVerticalDramaStoryJobExecutor(
             idempotencyKey?: string;
           }),
         },
-        onProgress
+        onProgress,
+        resume
       );
     case "extend":
       return runExtendStoryDraftHorizonJob(
@@ -1714,7 +2269,8 @@ export async function runVerticalDramaStoryJobExecutor(
             idempotencyKey?: string;
           }),
         },
-        onProgress
+        onProgress,
+        resume
       );
     case "improve_script": {
       // Lazy `await import(...)` — see this file's own import block doc
@@ -1898,7 +2454,15 @@ async function recordVerticalDramaSystemFailureAuditEvent(params: {
  */
 function parseCharactersDraft(
   draft: string
-): Array<{ name: string; role: string; description: string }> {
+): Array<{
+  name: string;
+  role: string;
+  description: string;
+  narrativeRole?: NarrativeRole;
+  roleTier?: RoleTier;
+  occupation?: string;
+  roleReviewStatus: "ready" | "needs_role_review";
+}> {
   return draft
     .split("\n")
     .map(line => line.trim())
@@ -1906,16 +2470,36 @@ function parseCharactersDraft(
     .map(line => {
       const match = line.match(/^(.+?)\s+—\s+(.+?):\s*(.*)$/);
       if (match) {
+        const legacy = normalizeLegacyRole(match[2]);
         return {
           name: match[1].trim(),
           role: match[2].trim(),
           description: match[3].trim(),
+          narrativeRole: legacy.narrativeRole ?? undefined,
+          roleTier: legacy.roleTier ?? undefined,
+          occupation: match[2].trim(),
+          roleReviewStatus: legacy.reviewStatus,
         };
       }
-      return { name: line, role: "", description: "" };
+      return {
+        name: line,
+        role: "",
+        description: "",
+        occupation: undefined,
+        roleReviewStatus: "needs_role_review",
+      };
     });
 }
 
+const presetCharacterProfileSchema = z.object({
+  name: z.string().trim().min(1),
+  speechProfile: z.unknown().optional(),
+  personality: z.unknown().optional(),
+  narrativeRole: narrativeRoleSchema.nullable().optional(),
+  roleTier: roleTierSchema.nullable().optional(),
+  occupation: z.string().trim().max(160).nullable().optional(),
+});
+
 function toGenrePresetDto(row: VerticalDramaGenrePresetRow): GenrePresetDto {
   return {
     id: String(row.id),
@@ -1931,6 +2515,9 @@ function toGenrePresetDto(row: VerticalDramaGenrePresetRow): GenrePresetDto {
       name: string;
       role: string;
       description: string;
+      narrativeRole?: NarrativeRole;
+      roleTier?: RoleTier;
+      occupation?: string;
     }>,
     visualBible: row.visualBible,
     visualIdentityJson: row.visualIdentityJson ?? undefined,
@@ -1997,6 +2584,9 @@ export async function seedCharactersFromDraft(
     name: string;
     speechProfile?: unknown;
     personality?: unknown;
+    narrativeRole?: NarrativeRole | null;
+    roleTier?: RoleTier | null;
+    occupation?: string | null;
   }>
 ): Promise<void> {
   const parsed = parseCharactersDraft(charactersDraft).filter(
@@ -2034,6 +2624,11 @@ export async function seedCharactersFromDraft(
       data.personality = matchedProfile.personality;
     }
 
+    const legacy = normalizeLegacyRole(character.role);
+    const narrativeRole = matchedProfile?.narrativeRole ?? character.narrativeRole ?? legacy.narrativeRole;
+    const roleTier = matchedProfile?.roleTier ?? character.roleTier ?? legacy.roleTier;
+    const occupation = matchedProfile?.occupation ?? character.occupation ?? (character.role || null);
+
     return {
       tenantId,
       userId,
@@ -2041,6 +2636,11 @@ export async function seedCharactersFromDraft(
       characterKey: key,
       name: character.name,
       role: character.role || null,
+      narrativeRole: narrativeRole ?? null,
+      roleTier: roleTier ?? null,
+      occupation,
+      roleProvenance: matchedProfile?.narrativeRole || matchedProfile?.roleTier ? "ai_assigned" : "migrated",
+      roleReviewStatus: narrativeRole && roleTier ? "ready" : "needs_role_review",
       data: Object.keys(data).length > 0 ? data : null,
     } as typeof verticalDramaCharacters.$inferInsert;
   });
@@ -2048,6 +2648,65 @@ export async function seedCharactersFromDraft(
   await db.insert(verticalDramaCharacters).values(rows);
 }
 
+/**
+ * Persist the canonical narrative role emitted by Story Bible generation onto
+ * the durable character roster. Legacy free-text `role` is never overwritten;
+ * user-confirmed assignments are also never downgraded by a later AI run.
+ */
+async function reconcileCharactersFromStoryBible(
+  tenantId: string,
+  userId: number,
+  seriesId: number,
+  refinedCharacters: Array<{
+    name: string;
+    role?: string;
+    narrativeRole?: NarrativeRole;
+    roleTier?: RoleTier;
+    occupation?: string;
+  }>,
+): Promise<void> {
+  if (refinedCharacters.length === 0) return;
+  const roster = (await db
+    .select()
+    .from(verticalDramaCharacters)
+    .where(
+      and(
+        eq(verticalDramaCharacters.tenantId, tenantId),
+        eq(verticalDramaCharacters.userId, userId),
+        eq(verticalDramaCharacters.seriesId, seriesId),
+      ),
+    )) as VerticalDramaCharacterRow[];
+  const byName = new Map(roster.map(character => [
+    character.name.trim().toLocaleLowerCase(),
+    character,
+  ]));
+
+  for (const profile of refinedCharacters) {
+    const character = byName.get(profile.name.trim().toLocaleLowerCase());
+    if (!character || character.roleProvenance === "user_confirmed") continue;
+    const narrativeRole = profile.narrativeRole ?? null;
+    const roleTier = profile.roleTier ?? null;
+    await db
+      .update(verticalDramaCharacters)
+      .set({
+        narrativeRole,
+        roleTier,
+        occupation: profile.occupation ?? profile.role ?? character.occupation ?? character.role,
+        roleProvenance: narrativeRole || roleTier ? "ai_assigned" : "migrated",
+        roleReviewStatus: narrativeRole && roleTier ? "ready" : "needs_role_review",
+        updatedAt: new Date(),
+      })
+      .where(
+        and(
+          eq(verticalDramaCharacters.id, character.id),
+          eq(verticalDramaCharacters.tenantId, tenantId),
+          eq(verticalDramaCharacters.userId, userId),
+          eq(verticalDramaCharacters.seriesId, seriesId),
+        ),
+      );
+  }
+}
+
 /* -------------------------------------------------------------------------- */
 /* Location Visual Bible whole-series seeding                                 */
 /*                                                                            */
@@ -2743,6 +3402,9 @@ export const verticalDramaSeriesRouter = router({
       // read by the Series Detail Characters tab) from the wizard's freeform
       // `bible.charactersDraft` text. Never allowed to fail series creation.
       const charactersDraft = input.bible?.charactersDraft;
+      const characterProfilesResult = presetCharacterProfileSchema
+        .array()
+        .safeParse(input.bible?.characterProfiles);
       if (
         typeof charactersDraft === "string" &&
         charactersDraft.trim().length > 0
@@ -2752,7 +3414,8 @@ export const verticalDramaSeriesRouter = router({
             tenantId,
             userId,
             Number(row.id),
-            charactersDraft
+            charactersDraft,
+            characterProfilesResult.success ? characterProfilesResult.data : undefined,
           );
         } catch (error) {
           debugError(
@@ -3821,6 +4484,13 @@ export const verticalDramaSeriesRouter = router({
         });
       }
 
+      await reconcileCharactersFromStoryBible(
+        tenantId,
+        userId,
+        seriesId,
+        result.expanded.refinedCharacters,
+      );
+
       const updatedBible = {
         ...bible,
         expandedSeasonArc: result.expanded.expandedSeasonArc,
@@ -3872,11 +4542,16 @@ export const verticalDramaSeriesRouter = router({
         horizonEpisodes: z.number().int().positive().optional(),
         idempotencyKey: z.string().trim().min(1).max(128).optional(),
         /**
-         * Premium multi-round drafts (W11-A, added 2026-07-08) — defaults to
-         * `"standard"` when omitted, running the EXACT W10-A pipeline
-         * byte-identically. `"premium"` runs the fan-out -> gates -> judge ->
-         * targeted-revise -> season-sweep pipeline instead (see
-         * `generateStoryBibleDeep`'s mode switch in the service).
+         * Premium multi-round drafts (W11-A, added 2026-07-08) — `"premium"`
+         * runs the fan-out -> gates -> judge -> targeted-revise -> season-sweep
+         * pipeline; `"standard"` runs the single-pass W10-A pipeline.
+         *
+         * Default CHANGED to `"premium"` when omitted (production-grade
+         * full-story generation, plan
+         * `planning/vertical-drama-full-story-production-grade`, added
+         * 2026-07-13) — the button's flow now uses the quality loop by
+         * default so it returns only complete, floor-passing content in one
+         * run; the client can still explicitly request `"standard"`.
          */
         mode: verticalDramaDeepStoryDraftModeSchema.optional(),
       })
@@ -3891,7 +4566,11 @@ export const verticalDramaSeriesRouter = router({
           message: "Invalid series id",
         });
       }
-      const mode: VerticalDramaDeepStoryDraftMode = input.mode ?? "standard";
+      // Production-grade full-story generation, added 2026-07-13 — default
+      // to "premium" (the quality-loop pipeline) when the client doesn't
+      // send a mode; an explicit "standard" request still runs the
+      // single-pass pipeline unchanged.
+      const mode: VerticalDramaDeepStoryDraftMode = input.mode ?? "premium";
 
       // Fail-fast sync validation — SAME guards the old synchronous body ran
       // (ownership + preconditions), so a doomed request never occupies the
@@ -3930,9 +4609,36 @@ export const verticalDramaSeriesRouter = router({
         });
       }
 
+      // Silent-no-op fix (plan
+      // `planning/vertical-drama-deep-draft-update-all-noop`, added
+      // 2026-07-14) — `episodesToDraft` above only reflects the resolved
+      // HORIZON, not what's actually undrafted within it. For a large series
+      // whose default horizon (or an explicitly-passed one) is fully covered
+      // by already-drafted episodes, enqueuing here would produce a job that
+      // makes zero LLM calls, charges zero credits, and "succeeds" in
+      // ~60ms — indistinguishable from "stopped" in the UI (see the plan's
+      // root-cause section). Filter to episodes that are still undrafted and
+      // short-circuit BEFORE enqueuing/charging when there's nothing left.
+      const remainingToDraft = episodesToDraft.filter(
+        item => readItemShotDrafts(item) === null
+      );
+      if (remainingToDraft.length === 0) {
+        // Pinned contract: this mutation's return type is now a union of
+        // `{ jobId, deduped, alreadyComplete: false }` (normal path, below)
+        // and `{ jobId: null, deduped: false, alreadyComplete: true }` (this
+        // early-complete path). Both branches share the same three keys so
+        // tRPC/TS infer one consistent object shape; the client narrows on
+        // `!jobId` to detect this case and must not attempt to poll it.
+        return { jobId: null, deduped: false, alreadyComplete: true as const };
+      }
+
       await ensureStoryJobCreditsAvailable(
         userId,
-        estimateDeepDraftJobCredits(episodesToDraft.length, mode)
+        // Credit precheck scoped to REMAINING (undrafted) episodes, not the
+        // full horizon — see the doc comment above. Already-drafted episodes
+        // inside the horizon must never count against the user's credit
+        // balance for this run.
+        estimateDeepDraftJobCredits(remainingToDraft.length, mode)
       );
 
       const { jobId, deduped } = await enqueueVerticalDramaStoryJob({
@@ -3946,7 +4652,7 @@ export const verticalDramaSeriesRouter = router({
           idempotencyKey: input.idempotencyKey,
         },
       });
-      return { jobId, deduped };
+      return { jobId, deduped, alreadyComplete: false as const };
     }),
 
   /**
@@ -5971,7 +6677,20 @@ export const verticalDramaSeriesRouter = router({
    * generation runs (plan.md §1, §8).
    */
   generateAdBannerImage: verticalDramaProcedure
-    .input(adBannerScopeInput)
+    .input(
+      adBannerScopeInput.extend({
+        // Feature 135 — Hermes Grok media worker (section 09, remediation
+        // row 10). This surface gains MCP support as a side effect of the
+        // shared transport-decision helper — `mcpConnectionId`/
+        // `sharedGroupId` are new for the banner picker (section 10 wires
+        // the UI); `hermesConnectionId` is required only when the resolved
+        // model is Hermes-transport and the caller has no default Hermes
+        // connection for images.
+        mcpConnectionId: z.string().max(64).optional(),
+        sharedGroupId: z.number().int().positive().optional(),
+        hermesConnectionId: z.string().max(64).optional(),
+      }),
+    )
     .mutation(async ({ ctx, input }) => {
       // Lazy-loaded (see this file's Ad Banner Overlay import-block doc
       // comment) — checked FIRST, fail-fast, before any DB read or paid call.
@@ -6047,12 +6766,52 @@ export const verticalDramaSeriesRouter = router({
         });
       }
 
-      const { DEFAULT_MODELS } =
-        await import("../services/mediaGenerationService");
-      const modelId = banner.generation.modelId || DEFAULT_MODELS.image;
+      // Feature 135 — Hermes Grok media worker (section 09, remediation row
+      // 10): fail-closed guard — the silent `DEFAULT_MODELS.image` fallback
+      // is gone. An empty `banner.generation.modelId` now throws BAD_REQUEST
+      // instead of silently substituting a system default the user never
+      // picked (same fail-closed convention as `resolveCharacterImageModelId`).
+      const modelId = banner.generation.modelId?.trim();
+      if (!modelId) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: "เลือกโมเดลภาพก่อนสร้างแบนเนอร์ / Select an image model before generating the banner.",
+        });
+      }
       const pricing = await resolveAdBannerImageModelPricing(modelId);
       const shouldChargeImageCredits = pricing.creditCost > 0;
-      if (shouldChargeImageCredits) {
+
+      const referenceImageUrls = await resolveAdBannerProductReferenceImageUrls(
+        rawProductTieIn,
+        {
+          userId,
+          tenantId,
+        }
+      );
+
+      // Route through the shared transport-decision helper — gateway_api
+      // (byte-identical to before), mcp (this surface gains MCP support as
+      // a side effect — pricing/charge stays identical, only the submit
+      // path's `transportMetadata` changes), or hermes (no platform-credit
+      // charge; submits straight to `queueHermesMediaJob`). Resolved BEFORE
+      // the credit check/reserve below (not after) — structurally
+      // guarantees "no platform-credit reserve for hermes". Reuses
+      // `pricing.configJson` (the SAME `media_models` row
+      // `resolveAdBannerImageModelPricing` already read above) — never a
+      // second DB read for the same row.
+      const { resolveVdCharacterMediaTransportDecision } = await import("./verticalDramaCharacters");
+      const transportDecision = await resolveVdCharacterMediaTransportDecision({
+        tenantId,
+        actorUserId: userId,
+        assetType: "image",
+        modelId,
+        configJson: pricing.configJson,
+        mcpConnectionId: input.mcpConnectionId,
+        sharedGroupId: input.sharedGroupId,
+        hermesConnectionId: input.hermesConnectionId,
+      });
+
+      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
         const hasCredits = await hasEnoughCredits(userId, pricing.creditCost);
         if (!hasCredits) {
           throw new TRPCError({
@@ -6062,13 +6821,72 @@ export const verticalDramaSeriesRouter = router({
         }
       }
 
-      const referenceImageUrls = await resolveAdBannerProductReferenceImageUrls(
-        rawProductTieIn,
-        {
+      if (transportDecision.kind === "hermes") {
+        const { queueHermesMediaJob } = await import("../services/hermesMediaScheduler");
+        const {
+          buildHermesMediaReferences,
+          buildHermesMediaTaskEnvelope,
+          resolveHermesOrderedRefsFromUrls,
+        } = await import("../services/hermesMediaReferences");
+        const { resolveMediaModelTransportConfig } = await import("../../shared/mediaModelTransport");
+        const hermesTraceId = crypto.randomUUID();
+        const { orderedRefs, droppedReferenceCount } = await resolveHermesOrderedRefsFromUrls({
+          tenantId,
           userId,
+          urls: referenceImageUrls.slice(0, pricing.maxReferenceImages),
+          traceId: hermesTraceId,
+          connectionId: transportDecision.connectionId,
+          roleFor: () => "product",
+        });
+        const references = await buildHermesMediaReferences({ tenantId, userId, orderedRefs });
+        const hermesProviderModelId =
+          resolveMediaModelTransportConfig({
+            modelId,
+            configJson: pricing.configJson,
+          }).providerModelId ?? modelId;
+        const result = await queueHermesMediaJob({
+          contractVersion: 1,
+          operation: references.length > 0 ? "image.edit" : "image.generate",
+          connectionId: transportDecision.connectionId,
+          prompt: promptText,
+          settings: {
+            model: hermesProviderModelId,
+            ...(banner.generation.aspectRatio ? { aspectRatio: banner.generation.aspectRatio } : {}),
+            outputCount: 1,
+          },
+          references,
+          entity: { type: "vertical_drama_ad_banner", id: banner.id },
+          traceId: hermesTraceId,
           tenantId,
-        }
-      );
+          requestedByUserId: userId,
+        });
+        const hermesTask = buildHermesMediaTaskEnvelope({
+          taskId: result.taskId,
+          userId,
+          mediaType: "image",
+          model: hermesProviderModelId,
+          prompt: promptText,
+          extraParams: { __vd_series_id: String(seriesId), __vd_ad_banner_id: banner.id },
+          droppedReferenceCount,
+        });
+        const hermesNextBanner: VdAdBannerDesign = {
+          ...banner,
+          status: "generating",
+          pendingTaskId: hermesTask.id,
+        };
+        const hermesNextBanners = banners.slice();
+        hermesNextBanners[bannerIndex] = hermesNextBanner;
+        await persistAdBannerDesigns(tenantId, userId, seriesId, rawProductTieIn, hermesNextBanners);
+        return {
+          taskId: hermesTask.id,
+          creditCost: 0,
+          banner: hermesNextBanner,
+          droppedReferenceCount,
+        };
+      }
+
+      const transportMetadata =
+        transportDecision.kind === "mcp" ? transportDecision.transportMetadata : undefined;
 
       // Credits are RESERVED now; `getAdBannerImageStatus` reconciles once
       // the task completes/fails, same convention as `generateCharacterImage`.
@@ -6106,6 +6924,7 @@ export const verticalDramaSeriesRouter = router({
           maxReferenceImages: pricing.maxReferenceImages,
           publicUrl: ctx.publicUrl ?? undefined,
           userToken,
+          ...(transportMetadata ? { transportMetadata } : {}),
         });
       } catch (err) {
         if (shouldChargeImageCredits) {
diff --git a/apps/web/server/services/hermesMediaReferences.ts b/apps/web/server/services/hermesMediaReferences.ts
new file mode 100644
index 000000000..a3e1bdb80
--- /dev/null
+++ b/apps/web/server/services/hermesMediaReferences.ts
@@ -0,0 +1,362 @@
+/**
+ * Feature 135 — Hermes Grok media worker: reference-set + task-envelope
+ * helpers shared by every VD/media.ts Hermes arm (section 09).
+ *
+ * `buildHermesMediaReferences` converts an ordered, asset-id-backed
+ * reference list into the frozen `HermesMediaJobContract["references"]`
+ * shape (assetId + 1-based continuous index + role + label + sha256) —
+ * NEVER emits a URL field (the contract schema is `.strict()`; section 01's
+ * claim-time-minting rule forbids storing a pre-resolved URL at rest).
+ *
+ * `resolveHermesReferenceAssetIdFromUrl` is the companion best-effort
+ * lookup for surfaces that only hold a resolved reference URL today (e.g.
+ * VD's character-portrait/location-plate identity-lock references) — it
+ * maps our own storage-proxy URL shapes (`/api/storage/files/<key>`,
+ * `/uploads/<key>`) back to the owning `media_assets` row. A URL this
+ * cannot resolve (foreign host, no owning row) yields `null`, and callers
+ * treat that as "drop this optional reference" rather than a hard failure
+ * — Hermes references are best-effort identity/environment locks, never a
+ * hard precondition for image/location/character surfaces (video's
+ * `generateVideoClip` start frame is the one MANDATORY reference and that
+ * surface resolves its assetId directly, without going through a URL).
+ *
+ * `buildHermesMediaTaskEnvelope` wraps a freshly queued job's `taskId` into
+ * the same `MediaTask` shape `mediaGenerationService.generateImageAsync`/
+ * `generateVideoAsync` already return, so every existing caller (`task.id`,
+ * `media.getTask` polling) keeps working unchanged — the fully-populated
+ * projection for every SUBSEQUENT poll is `hermesMediaAdapter.ts`'s
+ * `getHermesMediaTask` (section 06); this helper only shapes the FIRST,
+ * synchronous return value from the submit call.
+ *
+ * Namespace rule (hard): `hermesMedia*` / `hermes*` only — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { createHash } from "node:crypto";
+import { eq, and } from "drizzle-orm";
+import { getDb } from "../db";
+import { mediaAssets } from "../../drizzle/schema";
+import { storageResolveUrl } from "../storage";
+import { getCachedInternalNodeUrl } from "./appRuntimeConfig";
+import { debugLog } from "../_core/logger";
+import type { HermesMediaJobContract } from "../../shared/hermesMedia";
+import type { MediaTask } from "./mediaGenerationService";
+
+export type HermesMediaReferenceList = HermesMediaJobContract["references"];
+
+export interface HermesMediaReferenceOrderedRef {
+  assetId: string;
+  role: string;
+  label: string;
+}
+
+export interface HermesMediaReferenceAssetRow {
+  id: string;
+  storageKey: string;
+  checksumSha256: string | null;
+}
+
+export interface HermesMediaReferenceRepo {
+  findAssetById(params: {
+    tenantId: string;
+    userId: number;
+    assetId: string;
+  }): Promise<HermesMediaReferenceAssetRow | null>;
+  persistChecksum(params: { assetId: string; checksumSha256: string }): Promise<void>;
+}
+
+export const defaultHermesMediaReferenceRepo: HermesMediaReferenceRepo = {
+  async findAssetById({ tenantId, userId, assetId }) {
+    const numericId = Number(assetId);
+    if (!Number.isFinite(numericId)) return null;
+    const db = getDb();
+    const [row] = await db
+      .select({
+        id: mediaAssets.id,
+        storageKey: mediaAssets.storageKey,
+        checksumSha256: mediaAssets.checksumSha256,
+      })
+      .from(mediaAssets)
+      .where(
+        and(
+          eq(mediaAssets.id, numericId),
+          eq(mediaAssets.tenantId, tenantId),
+          eq(mediaAssets.userId, userId),
+        ),
+      )
+      .limit(1);
+    return row
+      ? { id: String(row.id), storageKey: row.storageKey, checksumSha256: row.checksumSha256 ?? null }
+      : null;
+  },
+  async persistChecksum({ assetId, checksumSha256 }) {
+    const numericId = Number(assetId);
+    if (!Number.isFinite(numericId)) return;
+    const db = getDb();
+    await db.update(mediaAssets).set({ checksumSha256 }).where(eq(mediaAssets.id, numericId));
+  },
+};
+
+function toAbsoluteStorageUrl(relativePath: string): string {
+  if (/^https?:\/\//i.test(relativePath)) return relativePath;
+  return `${getCachedInternalNodeUrl()}${relativePath}`;
+}
+
+/**
+ * Streams the stored object and hashes its real bytes — the "compute once"
+ * fallback for a reference asset whose `media_assets.checksumSha256` column
+ * is not yet populated. Mirrors `videoProjectAssetResolver.ts`'s
+ * `computeContentSha256` convention, but THROWS on failure (rather than
+ * returning `undefined`) — a Hermes reference's `sha256` is a required,
+ * non-optional contract field (`hermesMediaReferenceSchema`), so a fetch
+ * failure here must fail the submit, not silently mint a reference with a
+ * missing checksum.
+ */
+export async function defaultHashHermesReferenceObject(params: {
+  storageKey: string;
+}): Promise<string> {
+  const relativeUrl = await storageResolveUrl(params.storageKey);
+  if (!relativeUrl) {
+    throw new Error(`Cannot resolve storage URL for reference asset (storageKey=${params.storageKey})`);
+  }
+  const absoluteUrl = toAbsoluteStorageUrl(relativeUrl);
+  const response = await fetch(absoluteUrl);
+  if (!response.ok) {
+    throw new Error(`Failed to fetch reference asset bytes for checksum (status ${response.status})`);
+  }
+  const bytes = Buffer.from(await response.arrayBuffer());
+  return createHash("sha256").update(bytes).digest("hex");
+}
+
+export interface BuildHermesMediaReferencesDeps {
+  repo?: HermesMediaReferenceRepo;
+  hashObject?: (params: {
+    tenantId: string;
+    userId: number;
+    assetId: string;
+    storageKey: string;
+  }) => Promise<string>;
+}
+
+export class HermesMediaReferenceAssetNotFoundError extends Error {
+  readonly assetId: string;
+  constructor(assetId: string) {
+    super(`Hermes media reference asset ${assetId} was not found for this owner`);
+    this.name = "HermesMediaReferenceAssetNotFoundError";
+    this.assetId = assetId;
+  }
+}
+
+/**
+ * Convert an ordered VD reference set (media asset ids + roles + the
+ * "Image-N = <name>" labels from `contactSheets.ts`'s convention) into the
+ * contract's `references[]`: `{ assetId, index (1-based, continuous), role,
+ * label, sha256 }`. `sha256` comes from the `media_assets` checksum column;
+ * when absent, computed once via the injectable `hashObject` and persisted
+ * back (best-effort — a persistence failure does not fail THIS submit,
+ * since the freshly computed hash is already in hand for the contract
+ * being built right now).
+ */
+export async function buildHermesMediaReferences(
+  params: {
+    tenantId: string;
+    userId: number;
+    orderedRefs: HermesMediaReferenceOrderedRef[];
+  },
+  deps: BuildHermesMediaReferencesDeps = {},
+): Promise<HermesMediaReferenceList> {
+  const repo = deps.repo ?? defaultHermesMediaReferenceRepo;
+  const hashObject =
+    deps.hashObject ?? (({ storageKey }) => defaultHashHermesReferenceObject({ storageKey }));
+
+  const references: HermesMediaReferenceList = [];
+  let index = 1;
+  for (const ref of params.orderedRefs) {
+    const asset = await repo.findAssetById({
+      tenantId: params.tenantId,
+      userId: params.userId,
+      assetId: ref.assetId,
+    });
+    if (!asset) {
+      throw new HermesMediaReferenceAssetNotFoundError(ref.assetId);
+    }
+    let sha256 = asset.checksumSha256;
+    if (!sha256) {
+      sha256 = await hashObject({
+        tenantId: params.tenantId,
+        userId: params.userId,
+        assetId: ref.assetId,
+        storageKey: asset.storageKey,
+      });
+      try {
+        await repo.persistChecksum({ assetId: ref.assetId, checksumSha256: sha256 });
+      } catch {
+        // Best-effort write-back only — the freshly computed hash above is
+        // still used for THIS contract even if persistence fails; a future
+        // reference to the same asset simply recomputes it again.
+      }
+    }
+    references.push({ assetId: ref.assetId, index, role: ref.role, label: ref.label, sha256 });
+    index += 1;
+  }
+  return references;
+}
+
+function extractStorageKeyFromUrl(url: string): string | null {
+  const withoutQuery = url.split("?")[0]?.split("#")[0] ?? "";
+  const proxyMatch = /\/api\/storage\/files\/(.+)$/.exec(withoutQuery);
+  if (proxyMatch) return decodeURIComponent(proxyMatch[1]);
+  const uploadsMatch = /\/uploads\/(.+)$/.exec(withoutQuery);
+  if (uploadsMatch) return decodeURIComponent(uploadsMatch[1]);
+  return null;
+}
+
+export interface HermesReferenceAssetLookupRepo {
+  findAssetByStorageKey(params: {
+    tenantId: string;
+    userId: number;
+    storageKey: string;
+  }): Promise<{ id: string } | null>;
+}
+
+export const defaultHermesReferenceAssetLookupRepo: HermesReferenceAssetLookupRepo = {
+  async findAssetByStorageKey({ tenantId, userId, storageKey }) {
+    const db = getDb();
+    const [row] = await db
+      .select({ id: mediaAssets.id })
+      .from(mediaAssets)
+      .where(
+        and(
+          eq(mediaAssets.storageKey, storageKey),
+          eq(mediaAssets.tenantId, tenantId),
+          eq(mediaAssets.userId, userId),
+        ),
+      )
+      .limit(1);
+    return row ? { id: String(row.id) } : null;
+  },
+};
+
+/**
+ * Best-effort URL -> `media_assets.id` lookup for surfaces that only hold a
+ * resolved reference URL (never the asset id itself) today. Returns `null`
+ * (never throws) for a URL this cannot map back to an owned asset row — the
+ * two proxy shapes `storageResolveUrl` ever emits are
+ * `/api/storage/files/<key>` (S3/R2) and `/uploads/<key>` (local); anything
+ * else (a foreign host, an already-expired presigned URL, etc.) is treated
+ * as unresolvable rather than a hard error.
+ */
+export async function resolveHermesReferenceAssetIdFromUrl(
+  params: { tenantId: string; userId: number; url: string },
+  deps: { repo?: HermesReferenceAssetLookupRepo } = {},
+): Promise<string | null> {
+  const storageKey = extractStorageKeyFromUrl(params.url);
+  if (!storageKey) return null;
+  const repo = deps.repo ?? defaultHermesReferenceAssetLookupRepo;
+  const row = await repo.findAssetByStorageKey({
+    tenantId: params.tenantId,
+    userId: params.userId,
+    storageKey,
+  });
+  return row ? row.id : null;
+}
+
+export interface ResolveHermesOrderedRefsFromUrlsParams {
+  tenantId: string;
+  userId: number;
+  urls: string[];
+  /** For the audit log line only — never sent anywhere else. */
+  traceId: string;
+  connectionId: string;
+  /** Called with the ORIGINAL (pre-drop) loop index — same convention every
+   *  VD call site already used inline (`Image-${idx + 1}` numbering never
+   *  compacts around a dropped entry). */
+  roleFor?: (originalIndex: number) => string;
+  labelFor?: (originalIndex: number) => string;
+}
+
+/**
+ * Batch wrapper around `resolveHermesReferenceAssetIdFromUrl` for every VD
+ * image surface's reference list. A URL that fails to resolve to an owned
+ * `media_assets` row is DROPPED from the returned `orderedRefs` (never
+ * throws — see that function's own doc comment on why this stays
+ * best-effort for image/location/character identity-lock references) —
+ * but the drop is no longer SILENT: this feature's whole premise is killing
+ * silent quality fallbacks, so every drop is logged with the job's
+ * `traceId` + `connectionId` (never the url/asset content itself), and the
+ * total drop count is returned so the caller can thread it into
+ * `buildHermesMediaTaskEnvelope`'s `droppedReferenceCount` for the client to
+ * warn on (a dropped reference silently degrades `image.edit` identity/
+ * environment lock, or can silently downgrade the whole call to
+ * `image.generate` if it was the only reference).
+ */
+export async function resolveHermesOrderedRefsFromUrls(
+  params: ResolveHermesOrderedRefsFromUrlsParams,
+  deps: { repo?: HermesReferenceAssetLookupRepo } = {},
+): Promise<{ orderedRefs: HermesMediaReferenceOrderedRef[]; droppedReferenceCount: number }> {
+  const orderedRefs: HermesMediaReferenceOrderedRef[] = [];
+  let droppedReferenceCount = 0;
+  for (let i = 0; i < params.urls.length; i++) {
+    const url = params.urls[i];
+    const assetId = await resolveHermesReferenceAssetIdFromUrl(
+      { tenantId: params.tenantId, userId: params.userId, url },
+      { repo: deps.repo },
+    );
+    if (!assetId) {
+      droppedReferenceCount += 1;
+      debugLog(
+        "hermesMediaReferences",
+        "Dropped an unresolvable Hermes reference — not a library-backed asset for this owner; identity/environment lock for this reference is lost",
+        { traceId: params.traceId, connectionId: params.connectionId, referenceIndex: i },
+      );
+      continue;
+    }
+    orderedRefs.push({
+      assetId,
+      role: params.roleFor ? params.roleFor(i) : "reference",
+      label: params.labelFor ? params.labelFor(i) : `Image-${i + 1}`,
+    });
+  }
+  return { orderedRefs, droppedReferenceCount };
+}
+
+/**
+ * Wraps a freshly queued Hermes job's `taskId` into the same `MediaTask`
+ * shape `mediaGenerationService.generateImageAsync`/`generateVideoAsync`
+ * return — every existing call site that reads `task.id` (to persist onto a
+ * shot/candidate/banner row, or to return `{ taskId: task.id }` to the
+ * client) keeps working unchanged. `media.getTask`'s hermes branch (section
+ * 06, `hermesMediaAdapter.ts`'s `getHermesMediaTask`) is the fully-populated
+ * projection used on every SUBSEQUENT poll — this is only the immediate,
+ * synchronous submit response.
+ */
+export function buildHermesMediaTaskEnvelope(params: {
+  taskId: string;
+  userId: number;
+  mediaType: "image" | "video";
+  model: string;
+  prompt: string;
+  extraParams?: Record<string, unknown>;
+  /**
+   * How many of this job's candidate reference URLs were silently
+   * unresolvable (see `resolveHermesOrderedRefsFromUrls`) and therefore
+   * dropped before submit. Surfaced under `resultData` (never silently
+   * swallowed) so the client can warn the user that an identity/
+   * environment lock reference did not make it into the render.
+   */
+  droppedReferenceCount?: number;
+}): MediaTask {
+  return {
+    id: params.taskId,
+    userId: String(params.userId),
+    mediaType: params.mediaType,
+    status: "pending",
+    model: params.model,
+    prompt: params.prompt,
+    ...(params.extraParams ? { parameters: { extra_params: params.extraParams } } : {}),
+    ...(params.droppedReferenceCount
+      ? { resultData: { droppedReferenceCount: params.droppedReferenceCount } }
+      : {}),
+    creditsUsed: 0,
+    createdAt: new Date().toISOString(),
+  };
+}
diff --git a/apps/web/server/services/verticalDramaAdBanner.ts b/apps/web/server/services/verticalDramaAdBanner.ts
index 2d97899fb..c8777d2e6 100644
--- a/apps/web/server/services/verticalDramaAdBanner.ts
+++ b/apps/web/server/services/verticalDramaAdBanner.ts
@@ -503,6 +503,13 @@ export interface AdBannerImageModelPricing {
   modelId: string;
   creditCost: number;
   maxReferenceImages: number;
+  /**
+   * Feature 135 — Hermes Grok media worker (section 09, remediation row
+   * 10). Reuses the SAME `media_models` row already read here for
+   * pricing/capabilities — the router's transport-decision helper needs
+   * this to detect a `hermes_worker`/`mcp` model without a second DB read.
+   */
+  configJson: Record<string, unknown> | null;
 }
 
 /**
@@ -539,6 +546,7 @@ export async function resolveAdBannerImageModelPricing(
     modelId,
     creditCost,
     maxReferenceImages: capabilities.maxReferenceImages ?? 0,
+    configJson: (row?.configJson as Record<string, unknown> | null | undefined) ?? null,
   };
 }
 
@@ -556,6 +564,17 @@ export interface SubmitAdBannerImageGenerationParams {
   maxReferenceImages: number;
   publicUrl?: string;
   userToken: string;
+  /**
+   * Feature 135 — Hermes Grok media worker (section 09, remediation row
+   * 10). Mirrors `generateCharacterImage`'s `transportMetadata` param —
+   * when the router resolved an MCP-transport model, it passes the
+   * resolved `MediaTaskTransportMetadata` through here so
+   * `mediaGenerationService.generateImageAsync`'s own MCP branch submits
+   * through the connected provider account instead of the gateway_api/
+   * Python-backend path. `undefined` for gateway_api models (byte-identical
+   * to before this param existed).
+   */
+  transportMetadata?: import("../../shared/mcpConnectTypes").MediaTaskTransportMetadata;
 }
 
 export interface SubmitAdBannerImageGenerationResult {
@@ -594,6 +613,7 @@ export async function submitAdBannerImageGeneration(
         __vd_ad_banner_id: params.bannerId,
       },
       publicUrl: params.publicUrl,
+      ...(params.transportMetadata ? { transportMetadata: params.transportMetadata } : {}),
       auditContext: {
         userId: params.userId,
         traceId: crypto.randomUUID(),
