import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  llmInferenceProfileCandidateHeads,
  llmInferenceProfileVersions,
  llmInferenceProbeRuns,
  llmProviders,
  modelProviderMap,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import { executeWithFallback } from "../llmRouter";
import {
  inferenceProfilePairSchema,
  type InferenceProfilePair,
} from "./profileRegistry";
import { verifyProviderMapRuntimeBinding } from "./providerMapRuntimeBinding";
import { createInferenceRuntimeBindingFingerprint } from "./runtimeBindingFingerprint";
import { resolveProbePricing, type ProbePricing } from "./probePricing";

const PROBE_SUITE_REVISION = "connectivity:1";
const PROBE_MARKER = "SAH_CONNECTIVITY_PROBE_V1";
const PROBE_TIMEOUT_MS = 12_000;
const PROBE_MAX_OUTPUT_TOKENS = 16;

export type ConnectivityProbeTarget = {
  profileVersionId: number;
  runtimeBindingHash: string;
  profile: InferenceProfilePair;
  providerRecordId: number;
  modelMappingId: number;
  providerModelId: string;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  probePricing: ProbePricing;
};

export type InferenceProbeTargetResolution =
  | { ok: true; target: ConnectivityProbeTarget }
  | {
      ok: false;
      reason:
        | "PROFILE_NOT_FOUND"
        | "PROFILE_INVALID"
        | "PROFILE_RUNTIME_BINDING_MISSING"
        | "RUNTIME_BINDING_IDENTITY_MISMATCH"
        | "RUNTIME_BINDING_DISABLED"
        | "RUNTIME_CREDENTIAL_UNAVAILABLE"
        | "RUNTIME_SURFACE_MISMATCH"
        | "LOCAL_PROBE_UNSUPPORTED"
        | "PROBE_TARGET_UNAVAILABLE";
    };

export type ConnectivityProbeResult = {
  runId: string;
  evidenceRef: string;
  deploymentId: string;
  deploymentRevision: string;
  status: "passed" | "failed" | "blocked";
  reasonCode?: string;
  checks: { basicRequestResponse: boolean };
  responseLatencyMs: number;
  observedProviderId?: string;
  observedModelId?: string;
};

function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const value = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(value) ? (value as T[]) : [];
}

export async function resolveInferenceProbeTarget(
  deploymentId: string
): Promise<InferenceProbeTargetResolution> {
  try {
    const db = getDb();
    return await db.transaction(async tx => {
      await tx.execute(
        sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`
      );
      const [profileRow] = await tx
        .select({
          profileVersionId: llmInferenceProfileVersions.id,
          deploymentRevision: llmInferenceProfileVersions.deploymentRevision,
          profileJson: llmInferenceProfileVersions.profileJson,
        })
        .from(llmInferenceProfileCandidateHeads)
        .innerJoin(
          llmInferenceProfileVersions,
          eq(
            llmInferenceProfileCandidateHeads.profileVersionId,
            llmInferenceProfileVersions.id
          )
        )
        .where(eq(llmInferenceProfileCandidateHeads.deploymentId, deploymentId))
        .limit(1);
      if (!profileRow)
        return { ok: false as const, reason: "PROFILE_NOT_FOUND" as const };
      const parsed = inferenceProfilePairSchema.safeParse(
        profileRow.profileJson
      );
      if (
        !parsed.success ||
        parsed.data.deployment.deploymentId !== deploymentId ||
        parsed.data.deployment.revision !== profileRow.deploymentRevision
      ) {
        return { ok: false as const, reason: "PROFILE_INVALID" as const };
      }
      const profile = parsed.data;
      const binding = profile.deployment.runtimeBinding;
      if (!binding) {
        return {
          ok: false as const,
          reason: "PROFILE_RUNTIME_BINDING_MISSING" as const,
        };
      }
      if (profile.deployment.executionSurface !== "cloud") {
        return {
          ok: false as const,
          reason: "LOCAL_PROBE_UNSUPPORTED" as const,
        };
      }

      const [providerMap] = await tx
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
      const apiStyle = providerMap?.apiStyle ?? "chat-completions";
      const bindingResult = verifyProviderMapRuntimeBinding(
        profile.model,
        profile.deployment,
        providerMap
          ? {
              mappingId: providerMap.mappingId,
              providerRecordId: providerMap.providerRecordId,
              modelId: providerMap.modelId,
              providerModelId: providerMap.providerModelId,
              apiStyle,
              mappingEnabled: providerMap.mappingEnabled,
              providerEnabled: providerMap.providerEnabled,
              credentialConfigured: Boolean(providerMap.apiKeyEncrypted),
              baseUrlConfigured: Boolean(providerMap.baseUrl?.trim()),
            }
          : null
      );
      if (!bindingResult.ok) {
        return { ok: false as const, reason: bindingResult.reason };
      }
      if (!providerMap) {
        return {
          ok: false as const,
          reason: "PROBE_TARGET_UNAVAILABLE" as const,
        };
      }
      const probePricing = resolveProbePricing({
        providerName: providerMap.providerName,
        availableModels: providerMap.availableModels,
        providerModelId: providerMap.providerModelId,
        pricingInput: providerMap.pricingInput,
        pricingOutput: providerMap.pricingOutput,
        isFree: providerMap.isFree,
        snapshot: {
          inputMicrosPerMillion: profile.deployment.price.inputMicrosPerMillion,
          outputMicrosPerMillion:
            profile.deployment.price.outputMicrosPerMillion,
        },
      });
      return {
        ok: true as const,
        target: {
          profileVersionId: profileRow.profileVersionId,
          runtimeBindingHash: createInferenceRuntimeBindingFingerprint({
            profileVersionId: profileRow.profileVersionId,
            deploymentRevision: profileRow.deploymentRevision,
            modelMappingId: providerMap.mappingId,
            providerRecordId: providerMap.providerRecordId,
            modelId: providerMap.modelId,
            providerModelId: providerMap.providerModelId,
            apiStyle,
            baseUrl: providerMap.baseUrl,
            encryptedCredential: providerMap.apiKeyEncrypted,
            probePricing,
          }),
          profile,
          providerRecordId: providerMap.providerRecordId,
          modelMappingId: providerMap.mappingId,
          providerModelId: providerMap.providerModelId,
          apiStyle,
          probePricing,
        },
      };
    });
  } catch {
    return { ok: false, reason: "PROBE_TARGET_UNAVAILABLE" };
  }
}

function assistantText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object")
    return "";
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      part =>
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
    )
    .map(part => (part as { text: string }).text)
    .join("");
}

function hashEvidence(value: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export async function runInferenceConnectivityProbe(
  input: {
    deploymentId: string;
    actorUserId: number;
  },
  dependencies: {
    resolveTarget?: typeof resolveInferenceProbeTarget;
    execute?: typeof executeWithFallback;
    persist?: (row: typeof llmInferenceProbeRuns.$inferInsert) => Promise<void>;
    now?: () => Date;
  } = {}
): Promise<
  ConnectivityProbeResult | { status: "blocked"; reasonCode: string }
> {
  const targetResult = await (
    dependencies.resolveTarget ?? resolveInferenceProbeTarget
  )(input.deploymentId);
  if (!targetResult.ok) {
    return { status: "blocked", reasonCode: targetResult.reason };
  }
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) {
    return { status: "blocked", reasonCode: "INVALID_ACTOR" };
  }

  const { target } = targetResult;
  const startedAt = (dependencies.now ?? (() => new Date()))();
  const startedMs = startedAt.getTime();
  let status: ConnectivityProbeResult["status"] = "failed";
  let reasonCode: string | undefined;
  let observedProviderId: string | undefined;
  let observedModelId: string | undefined;
  let passed = false;
  try {
    const execution = await (dependencies.execute ?? executeWithFallback)({
      model: target.profile.model.logicalModelId,
      messages: [
        {
          role: "user",
          content: `Reply with exactly this marker and nothing else: ${PROBE_MARKER}`,
        },
      ],
      stream: false,
      userId: 0,
      preferredProvider: target.providerRecordId,
      strictProviderPin: true,
      expectedProviderModelId: target.providerModelId,
      expectedApiStyle: target.apiStyle,
      expectedModelMappingId: target.modelMappingId,
      disableProviderFallbacks: true,
      maxTokens: PROBE_MAX_OUTPUT_TOKENS,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (execution.type !== "success") {
      reasonCode =
        execution.type === "error"
          ? "PROVIDER_CALL_FAILED"
          : "PROBE_EXECUTION_UNSUPPORTED";
    } else {
      observedProviderId = `provider:llm-provider:${execution.providerId}`;
      const response = execution.response as { model?: unknown } | null;
      observedModelId =
        typeof response?.model === "string" ? response.model : undefined;
      if (execution.providerId !== target.providerRecordId) {
        reasonCode = "OBSERVED_PROVIDER_MISMATCH";
      } else if (observedModelId !== target.providerModelId) {
        reasonCode = "OBSERVED_MODEL_MISMATCH";
      } else if (!assistantText(execution.response).includes(PROBE_MARKER)) {
        reasonCode = "PROBE_RESPONSE_INVALID";
      } else {
        passed = true;
        status = "passed";
      }
    }
  } catch {
    reasonCode = "PROVIDER_CALL_FAILED";
  }

  if (passed) {
    const latestTarget = await (
      dependencies.resolveTarget ?? resolveInferenceProbeTarget
    )(input.deploymentId);
    if (
      !latestTarget.ok ||
      latestTarget.target.profileVersionId !== target.profileVersionId ||
      latestTarget.target.runtimeBindingHash !== target.runtimeBindingHash
    ) {
      passed = false;
      status = "failed";
      reasonCode = "PROBE_TARGET_CHANGED_DURING_EXECUTION";
    }
  }

  const finishedAt = (dependencies.now ?? (() => new Date()))();
  const responseLatencyMs = Math.max(0, finishedAt.getTime() - startedMs);
  const runId = randomUUID();
  const safeResult = {
    checks: { basicRequestResponse: passed },
    runtimeBindingHash: target.runtimeBindingHash,
    responseLatencyMs,
    ...(reasonCode ? { reasonCode } : {}),
    ...(observedProviderId ? { observedProviderId } : {}),
    ...(observedModelId ? { observedModelId } : {}),
  };
  const evidenceRef = hashEvidence({
    runId,
    deploymentId: target.profile.deployment.deploymentId,
    deploymentRevision: target.profile.deployment.revision,
    profileVersionId: target.profileVersionId,
    probeSuiteRevision: PROBE_SUITE_REVISION,
    status,
    result: safeResult,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  });
  const persistedResult = { ...safeResult, evidenceRef };
  const row: typeof llmInferenceProbeRuns.$inferInsert = {
    runId,
    profileVersionId: target.profileVersionId,
    deploymentId: target.profile.deployment.deploymentId,
    deploymentRevision: target.profile.deployment.revision,
    providerRecordId: target.providerRecordId,
    modelMappingId: target.modelMappingId,
    actorUserId: input.actorUserId,
    probeKind: "connectivity",
    probeSuiteRevision: PROBE_SUITE_REVISION,
    status,
    resultJson: persistedResult,
    startedAt,
    finishedAt,
  };
  try {
    if (dependencies.persist) {
      await dependencies.persist(row);
    } else {
      await getDb().insert(llmInferenceProbeRuns).values(row);
    }
  } catch {
    return { status: "blocked", reasonCode: "PROBE_EVIDENCE_PERSIST_FAILED" };
  }

  return {
    runId,
    evidenceRef,
    deploymentId: target.profile.deployment.deploymentId,
    deploymentRevision: target.profile.deployment.revision,
    status,
    ...(reasonCode ? { reasonCode } : {}),
    checks: { basicRequestResponse: passed },
    responseLatencyMs,
    ...(observedProviderId ? { observedProviderId } : {}),
    ...(observedModelId ? { observedModelId } : {}),
  };
}

export async function listInferenceConnectivityProbeRuns(input: {
  deploymentId: string;
  limit?: number;
}) {
  const db = getDb();
  return db
    .select({
      runId: llmInferenceProbeRuns.runId,
      profileVersionId: llmInferenceProbeRuns.profileVersionId,
      deploymentId: llmInferenceProbeRuns.deploymentId,
      deploymentRevision: llmInferenceProbeRuns.deploymentRevision,
      providerRecordId: llmInferenceProbeRuns.providerRecordId,
      modelMappingId: llmInferenceProbeRuns.modelMappingId,
      actorUserId: llmInferenceProbeRuns.actorUserId,
      probeKind: llmInferenceProbeRuns.probeKind,
      probeSuiteRevision: llmInferenceProbeRuns.probeSuiteRevision,
      status: llmInferenceProbeRuns.status,
      resultJson: llmInferenceProbeRuns.resultJson,
      startedAt: llmInferenceProbeRuns.startedAt,
      finishedAt: llmInferenceProbeRuns.finishedAt,
      createdAt: llmInferenceProbeRuns.createdAt,
    })
    .from(llmInferenceProbeRuns)
    .where(eq(llmInferenceProbeRuns.deploymentId, input.deploymentId))
    .orderBy(sql`${llmInferenceProbeRuns.createdAt} DESC`)
    .limit(Math.min(Math.max(input.limit ?? 20, 1), 100));
}

/** Resolve a stored profile and exact runtime binding without exposing credentials. */
export async function resolveInferenceConnectivityProbeTarget(
  deploymentId: string
): Promise<InferenceProbeTargetResolution> {
  return resolveInferenceProbeTarget(deploymentId);
}
