import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  canonicalDesignDigestInput,
  designArtifactVersionSchema,
  designRequestSchema,
  type DesignArtifactVersion,
} from "../../shared/designIntelligence";
import {
  isDesignProviderEnabled,
  type TenantFeatureFlags,
} from "../../shared/featureFlags";

export type DesignProviderCandidate = DesignArtifactVersion;
export type DesignProviderActor = { tenantId: string; projectId: string; userId: string };
export type DesignProviderInput = Partial<{ intent: string; prompt: string; locale: string }>;
export type DesignProviderPolicy = {
  status: "approved";
  certification: "verified";
  consentGranted: true;
  bindingEligible: true;
  policyDecisionRef: string;
  region: string;
  retention: "none" | "short-lived";
  allowImportedUntrusted: boolean;
  allowedFields: Array<keyof DesignProviderInput>;
  apiVersion: string;
  requiredCapabilities: string[];
};

const policySchema = z.object({
  status: z.literal("approved"),
  certification: z.literal("verified"),
  consentGranted: z.literal(true),
  bindingEligible: z.literal(true),
  policyDecisionRef: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
  region: z.string().min(1).max(100),
  retention: z.enum(["none", "short-lived"]),
  allowImportedUntrusted: z.boolean(),
  allowedFields: z.array(z.enum(["intent", "prompt", "locale"])).min(1).refine((fields) => fields.includes("prompt")),
  apiVersion: z.string().min(1).max(100),
  requiredCapabilities: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)).max(100),
}).strict();
const negotiationSchema = z.object({
  apiVersion: z.string().min(1).max(100),
  capabilities: z.array(z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/)).max(500),
}).strict();

export class DesignProviderAdapterError extends Error {
  constructor(readonly code: "PROVIDER_DISABLED" | "PROVIDER_UNAVAILABLE" | "POLICY_DENIED" | "RESULT_INVALID" | "CANCELLED" | "TIMEOUT" | "VERSION_MISMATCH" | "CAPABILITY_UNAVAILABLE" | "REQUEST_CONFLICT") {
    super(code);
    this.name = "DesignProviderAdapterError";
  }
}

/** Optional boundary; runOnce must atomically serialize a key and reject fingerprint conflicts. */
export function createDesignProviderAdapter(input: {
  flags: Pick<TenantFeatureFlags,
    | "smartAiHubDesignIntelligence"
    | "smartAiHubDesignNative"
    | "smartAiHubDesignProviders"
    | "smartAiHubDesignResolver"
    | "smartAiHubGoogleStitch"
    | "smartAiHubDesignVisualVerify"
  >;
  readPolicy?: (args: { actor: DesignProviderActor; provider: "stitch"; bindingRef: string }) => Promise<DesignProviderPolicy | null>;
  bindingRef?: string;
  operationStore?: { runOnce: (key: string, fingerprint: string, operation: () => Promise<DesignProviderCandidate>) => Promise<DesignProviderCandidate> };
  provider?: {
    negotiate: () => Promise<{ apiVersion: string; capabilities: string[] }>;
    generate: (request: DesignProviderInput, signal: AbortSignal) => Promise<unknown>;
  };
  createId?: () => string;
  now?: () => Date;
  timeoutMs?: number;
}) {
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("timeoutMs must be a positive finite number");

  return {
    async generate(rawRequest: unknown, actor: DesignProviderActor, signal?: AbortSignal): Promise<DesignProviderCandidate> {
      const parsedRequest = designRequestSchema.safeParse(rawRequest);
      if (!parsedRequest.success || parsedRequest.data.tenantId !== actor.tenantId ||
        parsedRequest.data.projectId !== actor.projectId || parsedRequest.data.requestedBy !== actor.userId) {
        throw new DesignProviderAdapterError("POLICY_DENIED");
      }
      if (!isDesignProviderEnabled(input.flags, "stitch")) {
        throw new DesignProviderAdapterError("PROVIDER_DISABLED");
      }
      if (!input.readPolicy || !input.operationStore || !input.provider || !input.bindingRef) {
        throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
      }
      if (signal?.aborted) throw new DesignProviderAdapterError("CANCELLED");

      let rawPolicy: unknown;
      try {
        rawPolicy = await input.readPolicy({ actor, provider: "stitch", bindingRef: input.bindingRef });
      } catch {
        throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
      }
      const parsedPolicy = policySchema.safeParse(rawPolicy);
      if (!parsedPolicy.success) throw new DesignProviderAdapterError("POLICY_DENIED");
      const policy = parsedPolicy.data;
      if (
        (parsedRequest.data.prompt.trust === "imported-untrusted" && !policy.allowImportedUntrusted)) {
        throw new DesignProviderAdapterError("POLICY_DENIED");
      }

      const operationKey = `${actor.tenantId}:${actor.projectId}:${actor.userId}:stitch:${parsedRequest.data.requestId}`;
      const requestFingerprint = createHash("sha256").update(canonicalDesignDigestInput({
        request: parsedRequest.data,
        actor,
        policyDecisionRef: policy.policyDecisionRef,
        apiVersion: policy.apiVersion,
        region: policy.region,
        retention: policy.retention,
        allowedFields: policy.allowedFields,
        requiredCapabilities: policy.requiredCapabilities,
      })).digest("hex");
      try {
        return await input.operationStore.runOnce(operationKey, requestFingerprint, async () => {
          if (signal?.aborted) throw new DesignProviderAdapterError("CANCELLED");
          let rawNegotiation: unknown;
          try {
            rawNegotiation = await input.provider!.negotiate();
          } catch {
            throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
          }
          const parsedNegotiation = negotiationSchema.safeParse(rawNegotiation);
          if (!parsedNegotiation.success) throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
          const negotiated = parsedNegotiation.data;
          if (negotiated.apiVersion !== policy!.apiVersion) throw new DesignProviderAdapterError("VERSION_MISMATCH");
          if (!policy!.requiredCapabilities.every((capability) => negotiated.capabilities.includes(capability))) {
            throw new DesignProviderAdapterError("CAPABILITY_UNAVAILABLE");
          }

          const fullInput: DesignProviderInput = {
            intent: parsedRequest.data.intent,
            prompt: parsedRequest.data.prompt.text,
            locale: parsedRequest.data.locale,
          };
          const egressInput: DesignProviderInput = {};
          for (const field of policy!.allowedFields) egressInput[field] = fullInput[field];
          const controller = new AbortController();
          let rejectCancellation: ((reason: DesignProviderAdapterError) => void) | undefined;
          const cancellationPromise = new Promise<never>((_, reject) => { rejectCancellation = reject; });
          const onAbort = () => {
            controller.abort();
            rejectCancellation?.(new DesignProviderAdapterError("CANCELLED"));
          };
          signal?.addEventListener("abort", onAbort, { once: true });
          let timeout: ReturnType<typeof setTimeout> | undefined;
          let didTimeout = false;
          try {
            if (signal?.aborted) {
              onAbort();
              throw new DesignProviderAdapterError("CANCELLED");
            }
            const providerPromise = input.provider!.generate(egressInput, controller.signal);
            const timeoutPromise = new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                didTimeout = true;
                controller.abort();
                reject(new DesignProviderAdapterError("TIMEOUT"));
              }, timeoutMs);
            });
            let providerPayload: unknown;
            try {
              providerPayload = await Promise.race([providerPromise, timeoutPromise, cancellationPromise]);
            } catch (error) {
              if (didTimeout) throw new DesignProviderAdapterError("TIMEOUT");
              if (error instanceof DesignProviderAdapterError) throw error;
              if (signal?.aborted) throw new DesignProviderAdapterError("CANCELLED");
              throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
            }
            if (signal?.aborted) throw new DesignProviderAdapterError("CANCELLED");
            const artifactId = input.createId?.() ?? randomUUID();
            const createdAt = (input.now?.() ?? new Date()).toISOString();
            const systemSnapshot = {
              catalogSnapshotId: parsedRequest.data.componentCatalogSnapshotId,
              componentVersion: "astryx-0.6.3",
              locale: parsedRequest.data.locale,
              theme: "system" as const,
              deviceProfile: "unspecified",
            };
            const provenance = {
              source: "external-provider" as const,
              requestId: parsedRequest.data.requestId,
              providerId: "stitch",
              providerVersion: negotiated.apiVersion,
              policyDecisionRef: policy!.policyDecisionRef,
              branchId: artifactId,
              reproducibility: "provider-nondeterministic" as const,
            };
            const digestInput = { payload: providerPayload, systemSnapshot, provenance };
            const digest = `sha256:${createHash("sha256").update(canonicalDesignDigestInput(digestInput)).digest("hex")}`;
            const candidate = designArtifactVersionSchema.safeParse({
              artifactId,
              version: 1,
              digest,
              tenantId: actor.tenantId,
              projectId: actor.projectId,
              ownerId: actor.userId,
              createdBy: actor.userId,
              status: "draft",
              rights: { ownerId: actor.userId, license: "unknown", assetsCleared: false },
              systemSnapshot,
              actionBindings: [],
              storageRef: `internal:design-artifact-candidates/${artifactId}/1`,
              provenance,
              payload: providerPayload,
              createdAt,
            });
            if (!candidate.success) throw new DesignProviderAdapterError("RESULT_INVALID");
            return candidate.data;
          } finally {
            if (timeout) clearTimeout(timeout);
            signal?.removeEventListener("abort", onAbort);
          }
        });
      } catch (error) {
        if (error instanceof DesignProviderAdapterError) throw error;
        if (signal?.aborted) throw new DesignProviderAdapterError("CANCELLED");
        throw new DesignProviderAdapterError("PROVIDER_UNAVAILABLE");
      }
    },
  };
}
