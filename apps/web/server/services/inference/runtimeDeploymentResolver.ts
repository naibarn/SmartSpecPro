import { and, eq, sql } from "drizzle-orm";
import {
  llmInferenceProbeRuns,
  llmProviders,
  modelProviderMap,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { isAvailable } from "../providerHealth";
import {
  resolveTrustedInferenceIntent,
  type InferenceIntentV2,
} from "./contracts";
import { composeInferenceAuthority } from "./authorityComposer";
import type { InferenceAuthoritySnapshot } from "./policyResolver";
import { buildQualifiedRouteCandidate } from "./qualification";
import type { RouteCandidate } from "./policyResolver";
import { evaluateInferenceEligibility } from "./policyResolver";
import { loadInferenceProfileRegistry } from "./profileRegistry";
import { loadInferencePolicySourceLayers } from "./policySourceLoader";
import type { InferencePlanningSourceOwners } from "./inferencePlanningService";
import { hashInferenceIntent } from "./planFactory";
import { verifyProviderMapRuntimeBinding } from "./providerMapRuntimeBinding";
import { createInferenceRuntimeBindingFingerprint } from "./runtimeBindingFingerprint";
import { resolveProbePricing } from "./probePricing";

export type RuntimeDeploymentResolution =
  | {
      ok: true;
      candidate: RouteCandidate;
      authority: InferenceAuthoritySnapshot;
      registryRevision: string;
      runtime: {
        providerRecordId: number;
        modelMappingId: number;
        providerName: string;
        providerModelId: string;
        apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
      };
    }
  | {
      ok: false;
      reason:
        | "PROFILE_NOT_FOUND"
        | "PROFILE_RUNTIME_BINDING_MISSING"
        | "RUNTIME_BINDING_IDENTITY_MISMATCH"
        | "RUNTIME_BINDING_DISABLED"
        | "RUNTIME_CREDENTIAL_UNAVAILABLE"
        | "RUNTIME_SURFACE_MISMATCH"
        | "RUNTIME_PROVIDER_UNAVAILABLE"
        | "RUNTIME_PROBE_BINDING_MISMATCH"
        | "PROFILE_NOT_QUALIFIED"
        | "AUTHORITY_STALE_OR_CHANGED";
    };

/** Revalidates a plan-pinned profile and provider row from one PG snapshot. */
export async function resolveCurrentInferenceDeployment(input: {
  deploymentId: string;
  intent: InferenceIntentV2;
  owners: InferencePlanningSourceOwners;
  expectedRegistryRevision: string;
  expectedRouterPolicyRevision: string;
  now?: Date;
}): Promise<RuntimeDeploymentResolution> {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    return { ok: false, reason: "PROFILE_NOT_QUALIFIED" };
  }
  try {
    const db = getDb();
    return await db.transaction(async tx => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
      );
      const registry = await loadInferenceProfileRegistry(now, tx);
      if (!registry.ok) {
        return { ok: false as const, reason: "PROFILE_NOT_QUALIFIED" as const };
      }
      if (registry.registryRevision !== input.expectedRegistryRevision) {
        return {
          ok: false as const,
          reason: "AUTHORITY_STALE_OR_CHANGED" as const,
        };
      }
      const requestContext = input.owners.requestContext;
      const policy = await loadInferencePolicySourceLayers(
        {
          tenantId: requestContext.tenantId,
          principalId: requestContext.principalId,
          now,
        },
        tx
      );
      if (!policy.ok) {
        return {
          ok: false as const,
          reason: "AUTHORITY_STALE_OR_CHANGED" as const,
        };
      }
      const platformRouterPolicy = policy.sources.platform.routerPolicy;
      if (!platformRouterPolicy) {
        return {
          ok: false as const,
          reason: "AUTHORITY_STALE_OR_CHANGED" as const,
        };
      }
      const composed = composeInferenceAuthority(
        {
          ...policy.sources,
          budget: input.owners.budget,
          registry: {
            revision: registry.registryRevision,
            observedAtMs: registry.observedAtMs,
          },
          router: {
            revision: policy.sources.platform.revision,
            scoreCalibrationRevision:
              platformRouterPolicy.scoreCalibrationRevision,
            routingWeights: platformRouterPolicy.weights,
          },
        },
        nowMs
      );
      if (
        !composed.ok ||
        composed.snapshot.policyRevision !== input.intent.policyRevision ||
        composed.snapshot.routerPolicyRevision !==
          input.expectedRouterPolicyRevision
      ) {
        return {
          ok: false as const,
          reason: "AUTHORITY_STALE_OR_CHANGED" as const,
        };
      }
      const boundIntent = resolveTrustedInferenceIntent(input.intent, {
        tenantId: requestContext.tenantId,
        principalId: requestContext.principalId,
        traceId: requestContext.traceId,
        policyRevision: composed.snapshot.policyRevision,
        budgetScopeRef: requestContext.budgetScopeRef,
        idempotencyKey: requestContext.idempotencyKey,
        maxAuthorizedCostMicros: composed.snapshot.availableBudgetMicros,
        effectivePrivacyClass: requestContext.effectivePrivacyClass,
        effectiveRisk: requestContext.effectiveRisk,
        allowedRegions: composed.snapshot.allowedRegions,
        requireZeroDataRetention: composed.snapshot.requireZeroDataRetention,
      });
      if (
        !boundIntent.ok ||
        hashInferenceIntent(boundIntent.intent) !==
          hashInferenceIntent(input.intent)
      ) {
        return {
          ok: false as const,
          reason: "AUTHORITY_STALE_OR_CHANGED" as const,
        };
      }
      const profile = registry.profiles.find(
        item => item.deployment.deploymentId === input.deploymentId
      );
      if (!profile) {
        return { ok: false as const, reason: "PROFILE_NOT_FOUND" as const };
      }
      const binding = profile.deployment.runtimeBinding;
      const deployment = profile.deployment;
      if (!binding || binding.kind !== "llm_provider_map") {
        return {
          ok: false as const,
          reason: "PROFILE_RUNTIME_BINDING_MISSING" as const,
        };
      }

      const [row] = await tx
        .select({
          mappingId: modelProviderMap.id,
          providerRecordId: llmProviders.id,
          modelId: modelProviderMap.modelId,
          providerModelId: modelProviderMap.providerModelId,
          apiStyle: modelProviderMap.apiStyle,
          mappingEnabled: modelProviderMap.isEnabled,
          providerEnabled: llmProviders.isEnabled,
          apiKeyEncrypted: llmProviders.apiKeyEncrypted,
          baseUrl: llmProviders.baseUrl,
          providerName: llmProviders.providerName,
          healthStatus: llmProviders.healthStatus,
          availableModels: llmProviders.availableModels,
          pricingInput: modelProviderMap.pricingInput,
          pricingOutput: modelProviderMap.pricingOutput,
          isFree: modelProviderMap.isFree,
        })
        .from(modelProviderMap)
        .innerJoin(
          llmProviders,
          eq(modelProviderMap.providerId, llmProviders.id)
        )
        .where(
          and(
            eq(modelProviderMap.id, binding.modelMappingId),
            eq(llmProviders.id, binding.providerRecordId)
          )
        )
        .limit(1);
      const bindingResult = verifyProviderMapRuntimeBinding(
        profile.model,
        profile.deployment,
        row
          ? {
              mappingId: row.mappingId,
              providerRecordId: row.providerRecordId,
              modelId: row.modelId,
              providerModelId: row.providerModelId,
              apiStyle: row.apiStyle,
              mappingEnabled: row.mappingEnabled,
              providerEnabled: row.providerEnabled,
              credentialConfigured: Boolean(row.apiKeyEncrypted),
              baseUrlConfigured: Boolean(row.baseUrl?.trim()),
            }
          : null
      );
      if (!bindingResult.ok) {
        return { ok: false as const, reason: bindingResult.reason };
      }
      if (deployment.probe.source === "live_probe") {
        const probePricing = resolveProbePricing({
          providerName: row.providerName,
          availableModels: row.availableModels,
          providerModelId: row.providerModelId,
          pricingInput: row.pricingInput,
          pricingOutput: row.pricingOutput,
          isFree: row.isFree,
          snapshot: {
            inputMicrosPerMillion: deployment.price.inputMicrosPerMillion,
            outputMicrosPerMillion: deployment.price.outputMicrosPerMillion,
          },
        });
        const [probeEvidence] = await tx
          .select({
            profileVersionId: llmInferenceProbeRuns.profileVersionId,
            deploymentId: llmInferenceProbeRuns.deploymentId,
            deploymentRevision: llmInferenceProbeRuns.deploymentRevision,
            providerRecordId: llmInferenceProbeRuns.providerRecordId,
            modelMappingId: llmInferenceProbeRuns.modelMappingId,
            probeSuiteRevision: llmInferenceProbeRuns.probeSuiteRevision,
            resultJson: llmInferenceProbeRuns.resultJson,
          })
          .from(llmInferenceProbeRuns)
          .where(
            and(
              eq(llmInferenceProbeRuns.deploymentId, deployment.deploymentId),
              eq(llmInferenceProbeRuns.deploymentRevision, deployment.revision),
              eq(llmInferenceProbeRuns.probeKind, "capability_suite"),
              eq(llmInferenceProbeRuns.status, "passed"),
              eq(
                sql<string>`${llmInferenceProbeRuns.resultJson}->>'evidenceRef'`,
                deployment.probe.evidenceRef
              )
            )
          )
          .limit(1);
        const evidenceResult = probeEvidence?.resultJson as
          Record<string, unknown> | undefined;
        const currentBindingHash = probeEvidence
          ? createInferenceRuntimeBindingFingerprint({
              profileVersionId: probeEvidence.profileVersionId,
              deploymentRevision: probeEvidence.deploymentRevision,
              modelMappingId: row.mappingId,
              providerRecordId: row.providerRecordId,
              modelId: row.modelId,
              providerModelId: row.providerModelId,
              apiStyle: row.apiStyle ?? "chat-completions",
              baseUrl: row.baseUrl,
              encryptedCredential: row.apiKeyEncrypted,
              probePricing,
            })
          : null;
        if (
          !probeEvidence ||
          probeEvidence.deploymentId !== deployment.deploymentId ||
          probeEvidence.deploymentRevision !== deployment.revision ||
          probeEvidence.probeSuiteRevision !==
            deployment.probe.probeSuiteRevision ||
          probeEvidence.providerRecordId !== row.providerRecordId ||
          probeEvidence.modelMappingId !== row.mappingId ||
          typeof evidenceResult?.runtimeBindingHash !== "string" ||
          evidenceResult.runtimeBindingHash !== currentBindingHash
        ) {
          return {
            ok: false as const,
            reason: "RUNTIME_PROBE_BINDING_MISMATCH" as const,
          };
        }
      }
      if (
        !row ||
        row.healthStatus === "down" ||
        !isAvailable(row.providerRecordId)
      ) {
        return {
          ok: false as const,
          reason: "RUNTIME_PROVIDER_UNAVAILABLE" as const,
        };
      }
      const qualified = buildQualifiedRouteCandidate(
        input.intent,
        profile.model,
        profile.deployment,
        nowMs
      );
      if (
        !qualified.ok ||
        qualified.candidate.deploymentId !== input.deploymentId ||
        qualified.candidate.providerId !==
          `provider:llm-provider:${row.providerRecordId}` ||
        qualified.candidate.credentialOwnerRef !==
          `credential-owner:llm-provider:${row.providerRecordId}` ||
        !evaluateInferenceEligibility(
          input.intent,
          qualified.candidate,
          composed.snapshot
        ).eligible
      ) {
        return { ok: false as const, reason: "PROFILE_NOT_QUALIFIED" as const };
      }
      return {
        ok: true as const,
        candidate: qualified.candidate,
        authority: composed.snapshot,
        registryRevision: registry.registryRevision,
        runtime: {
          providerRecordId: row.providerRecordId,
          modelMappingId: row.mappingId,
          providerName: row.providerName,
          providerModelId: row.providerModelId,
          apiStyle: row.apiStyle,
        },
      };
    });
  } catch {
    return { ok: false, reason: "PROFILE_NOT_QUALIFIED" };
  }
}
