import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  llmInferencePolicyHeads,
  llmInferencePolicySnapshots,
  llmInferenceRevocations,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import type { PolicyLayer } from "./authorityComposer";
import { inferenceRouterPolicySchema } from "./routerPolicy";

type InferenceReadTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

const idList = z.array(z.string().trim().min(1).max(256)).max(512);
const policyPayloadSchema = z
  .object({
    ready: z.boolean(),
    allowedProviderIds: idList,
    allowedRegions: idList,
    allowedCredentialOwnerRefs: idList,
    requireZeroDataRetention: z.boolean(),
    routingPolicy: inferenceRouterPolicySchema.optional(),
  })
  .strict();

type PolicyScope = "platform" | "tenant" | "principal";

export type InferencePolicySourceLayers = {
  platform: PolicyLayer;
  tenant: PolicyLayer;
  principal: PolicyLayer;
  revocations: {
    tenantId: string;
    principalId: string;
    revision: string;
    observedAtMs: number;
    fresh: boolean;
    revokedModelProfileIds: string[];
    revokedDeploymentIds: string[];
  };
};

export type PolicySourceLoadResult =
  | { ok: true; sources: InferencePolicySourceLayers }
  | {
      ok: false;
      code:
        | "POLICY_SCOPE_MISSING"
        | "POLICY_SCOPE_INVALID"
        | "POLICY_SOURCE_UNAVAILABLE";
      scope?: PolicyScope;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Loads the three mandatory policy layers and active revocations from PostgreSQL.
 * Missing or malformed policy never inherits broad defaults.
 */
export async function loadInferencePolicySourceLayers(input: {
  tenantId: string;
  principalId: string;
  now?: Date;
}, readTx?: InferenceReadTransaction): Promise<PolicySourceLoadResult> {
  if (
    !input.tenantId.trim() ||
    !input.principalId.trim() ||
    input.tenantId.length > 36 ||
    input.principalId.length > 256
  ) {
    return { ok: false, code: "POLICY_SCOPE_INVALID" };
  }
  const now = input.now ?? new Date();
  const observedAtMs = now.getTime();
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < 0) {
    return { ok: false, code: "POLICY_SCOPE_INVALID" };
  }
  try {
    const load = async (tx: InferenceReadTransaction) => {
      // Read all policy heads and revocations from one PostgreSQL snapshot so
      // concurrent policy edits cannot be mixed into a synthetic authority.
      if (!readTx) {
        await tx.execute(
          sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
        );
      }
      const loadPolicyLayer = async (layer: {
        scopeType: PolicyScope;
        scopeKey: string;
        principalRef: string | null;
      }): Promise<PolicySourceLoadResult | PolicyLayer> => {
        const [row] = await tx
          .select({
            scopeType: llmInferencePolicySnapshots.scopeType,
            scopeKey: llmInferencePolicySnapshots.scopeKey,
            tenantId: llmInferencePolicySnapshots.tenantId,
            principalRef: llmInferencePolicySnapshots.principalRef,
            revision: llmInferencePolicySnapshots.revision,
            policyJson: llmInferencePolicySnapshots.policyJson,
          })
          .from(llmInferencePolicyHeads)
          .innerJoin(
            llmInferencePolicySnapshots,
            eq(
              llmInferencePolicyHeads.snapshotId,
              llmInferencePolicySnapshots.id
            )
          )
          .where(
            and(
              eq(llmInferencePolicyHeads.scopeType, layer.scopeType),
              eq(llmInferencePolicyHeads.scopeKey, layer.scopeKey)
            )
          )
          .limit(1);
        if (!row)
          return {
            ok: false,
            code: "POLICY_SCOPE_MISSING",
            scope: layer.scopeType,
          };
        if (
          row.scopeType !== layer.scopeType ||
          row.scopeKey !== layer.scopeKey ||
          (layer.scopeType !== "platform" && row.tenantId !== input.tenantId) ||
          row.principalRef !== layer.principalRef ||
          !row.revision.trim()
        ) {
          return {
            ok: false,
            code: "POLICY_SCOPE_INVALID",
            scope: layer.scopeType,
          };
        }
        const payload = policyPayloadSchema.safeParse(row.policyJson);
        if (
          !payload.success ||
          (layer.scopeType === "platform" && !payload.data.routingPolicy) ||
          (layer.scopeType !== "platform" && payload.data.routingPolicy !== undefined)
        ) {
          return {
            ok: false,
            code: "POLICY_SCOPE_INVALID",
            scope: layer.scopeType,
          };
        }
        return {
          tenantId: input.tenantId,
          principalId: input.principalId,
          revision: row.revision,
          observedAtMs,
          ready: payload.data.ready,
          allowedProviderIds: payload.data.allowedProviderIds,
          allowedRegions: payload.data.allowedRegions,
          allowedCredentialOwnerRefs: payload.data.allowedCredentialOwnerRefs,
          requireZeroDataRetention: payload.data.requireZeroDataRetention,
          ...(layer.scopeType === "platform" && payload.data.routingPolicy
            ? { routerPolicy: payload.data.routingPolicy }
            : {}),
        };
      };

      const principalKey = `${input.tenantId}:${input.principalId}`;
      const layers = [
        await loadPolicyLayer({
          scopeType: "platform",
          scopeKey: "platform",
          principalRef: null,
        }),
        await loadPolicyLayer({
          scopeType: "tenant",
          scopeKey: input.tenantId,
          principalRef: null,
        }),
        await loadPolicyLayer({
          scopeType: "principal",
          scopeKey: principalKey,
          principalRef: input.principalId,
        }),
      ];
      const failedLayer = layers.find(
        layer => "ok" in layer && layer.ok === false
      );
      if (failedLayer && "ok" in failedLayer) return failedLayer;
      const loadedLayers = layers.filter(
        (layer): layer is PolicyLayer => !("ok" in layer)
      );
      if (loadedLayers.length !== 3) {
        return { ok: false, code: "POLICY_SCOPE_INVALID" };
      }
      const [platform, tenant, principal] = loadedLayers as [
        PolicyLayer,
        PolicyLayer,
        PolicyLayer,
      ];

      const activeRevocationPredicate = or(
        isNull(llmInferenceRevocations.expiresAt),
        gt(llmInferenceRevocations.expiresAt, now)
      );
      const rows = await tx
        .select({
          scopeType: llmInferenceRevocations.scopeType,
          targetType: llmInferenceRevocations.targetType,
          targetId: llmInferenceRevocations.targetId,
          createdAt: llmInferenceRevocations.createdAt,
          id: llmInferenceRevocations.id,
        })
        .from(llmInferenceRevocations)
        .where(
          and(
            eq(llmInferenceRevocations.tenantId, input.tenantId),
            activeRevocationPredicate,
            or(
              and(
                eq(llmInferenceRevocations.scopeType, "tenant"),
                isNull(llmInferenceRevocations.principalRef)
              ),
              and(
                eq(llmInferenceRevocations.scopeType, "principal"),
                eq(llmInferenceRevocations.principalRef, input.principalId)
              )
            )
          )
        );
      const revokedModelProfileIds = rows
        .filter(row => row.targetType === "model")
        .map(row => row.targetId);
      const revokedDeploymentIds = rows
        .filter(row => row.targetType === "deployment")
        .map(row => row.targetId);
      const revocationRevision = `revocations:${createHash("sha256")
        .update(
          rows
            .map(row => `${row.id}:${row.targetType}:${row.targetId}`)
            .sort()
            .join("\n")
        )
        .digest("hex")}`;

      return {
        ok: true,
        sources: {
          platform,
          tenant,
          principal,
          revocations: {
            tenantId: input.tenantId,
            principalId: input.principalId,
            revision: revocationRevision,
            observedAtMs,
            fresh: true,
            revokedModelProfileIds,
            revokedDeploymentIds,
          },
        },
      };
    };
    return readTx ? await load(readTx) : await getDb().transaction(load);
  } catch {
    return { ok: false, code: "POLICY_SOURCE_UNAVAILABLE" };
  }
}
