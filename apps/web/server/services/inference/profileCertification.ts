import { and, desc, eq } from "drizzle-orm";
import {
  llmInferenceProfileCandidateHeads,
  llmInferenceProfileCertifications,
  llmInferenceProfileHeads,
  llmInferenceProfileVersions,
  llmInferenceProbeRuns,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  evaluateDeploymentQualification,
  requiredProbeChecksForModel,
  type LogicalModelProfile,
  type ProviderDeploymentProfile,
} from "./qualification";
import {
  inferenceProfilePairSchema,
  type InferenceProfilePair,
} from "./profileRegistry";

export const INFERENCE_PROFILE_PROBE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CapabilityProbeReceipt = {
  runId: string;
  profileVersionId: number;
  deploymentId: string;
  deploymentRevision: string;
  providerRecordId: number;
  modelMappingId: number;
  probeKind: string;
  probeSuiteRevision: string;
  status: string;
  resultJson: Record<string, unknown>;
  finishedAt: Date;
};

export type ProfileCertificationResult =
  | { ok: true; profile: InferenceProfilePair; probeRunId: string }
  | {
      ok: false;
      reason:
        | "PROFILE_OR_PROBE_BINDING_MISMATCH"
        | "CAPABILITY_PROBE_NOT_PASSED"
        | "CAPABILITY_CHECKS_INCOMPLETE"
        | "PROBE_STALE"
        | "PROFILE_NOT_QUALIFIED";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * Produces the server-owned active projection for an immutable candidate.
 * Neither candidate JSON nor a client-supplied lifecycle flag can certify it.
 */
export function certifyInferenceProfileCandidate(input: {
  profile: InferenceProfilePair;
  candidateProfileVersionId: number;
  receipt: CapabilityProbeReceipt;
  now: Date;
}): ProfileCertificationResult {
  const { profile, candidateProfileVersionId, receipt, now } = input;
  const binding = profile.deployment.runtimeBinding;
  const observedAtMs = receipt.finishedAt.getTime();
  if (
    !binding ||
    !Number.isSafeInteger(candidateProfileVersionId) ||
    candidateProfileVersionId <= 0 ||
    receipt.profileVersionId !== candidateProfileVersionId ||
    receipt.deploymentId !== profile.deployment.deploymentId ||
    receipt.deploymentRevision !== profile.deployment.revision ||
    receipt.providerRecordId !== binding.providerRecordId ||
    receipt.modelMappingId !== binding.modelMappingId ||
    receipt.probeKind !== "capability_suite" ||
    !receipt.probeSuiteRevision.trim() ||
    !Number.isSafeInteger(observedAtMs) ||
    observedAtMs > now.getTime()
  ) {
    return { ok: false, reason: "PROFILE_OR_PROBE_BINDING_MISMATCH" };
  }
  const result = receipt.resultJson;
  if (receipt.status !== "passed" || result.qualificationStatus !== "passed") {
    return { ok: false, reason: "CAPABILITY_PROBE_NOT_PASSED" };
  }
  if (now.getTime() - observedAtMs > INFERENCE_PROFILE_PROBE_MAX_AGE_MS) {
    return { ok: false, reason: "PROBE_STALE" };
  }
  const checks = isRecord(result.checks) ? result.checks : undefined;
  const probedCapabilityRefs = Array.isArray(result.probedCapabilityRefs)
    ? result.probedCapabilityRefs
    : undefined;
  const runtimeBindingHash = result.runtimeBindingHash;
  const reasonCodes = Array.isArray(result.reasonCodes)
    ? result.reasonCodes
    : [];
  if (
    !checks ||
    !probedCapabilityRefs ||
    typeof result.evidenceRef !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(result.evidenceRef) ||
    typeof runtimeBindingHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(runtimeBindingHash) ||
    reasonCodes.length > 0
  ) {
    return { ok: false, reason: "CAPABILITY_PROBE_NOT_PASSED" };
  }
  const requiredChecks = requiredProbeChecksForModel(profile.model);
  if (
    requiredChecks.some(check => checks[check] !== true) ||
    result.maximumOutputLimitVerified !== true ||
    profile.model.capabilityRefs.some(
      ref => !probedCapabilityRefs.includes(ref)
    )
  ) {
    return { ok: false, reason: "CAPABILITY_CHECKS_INCOMPLETE" };
  }

  const certifiedModel: LogicalModelProfile = {
    ...profile.model,
    lifecycle: "ACTIVE",
  };
  const certifiedDeployment: ProviderDeploymentProfile = {
    ...profile.deployment,
    status: "ACTIVE",
    health: "healthy",
    healthObservedAtMs: observedAtMs,
    probe: {
      source: "live_probe",
      endpointSurface: profile.deployment.endpointSurface,
      probeSuiteRevision: receipt.probeSuiteRevision,
      evidenceRef: result.evidenceRef,
      observedAtMs,
      validUntilMs: observedAtMs + INFERENCE_PROFILE_PROBE_MAX_AGE_MS,
      probedCapabilityRefs: probedCapabilityRefs as string[],
      checks: checks as ProviderDeploymentProfile["probe"]["checks"],
    },
  };
  const qualification = evaluateDeploymentQualification(
    certifiedModel,
    certifiedDeployment,
    now.getTime(),
    INFERENCE_PROFILE_PROBE_MAX_AGE_MS
  );
  if (!qualification.eligible) {
    return { ok: false, reason: "PROFILE_NOT_QUALIFIED" };
  }
  return {
    ok: true,
    profile: { model: certifiedModel, deployment: certifiedDeployment },
    probeRunId: receipt.runId,
  };
}

export type StoredProfileCertificationResult =
  | {
      ok: true;
      deploymentId: string;
      deploymentRevision: string;
      profileVersionId: number;
      probeRunId: string;
      action: "certified" | "already_certified";
    }
  | {
      ok: false;
      reason:
        | "CANDIDATE_NOT_FOUND"
        | "CAPABILITY_PROBE_NOT_FOUND"
        | "PROFILE_OR_PROBE_BINDING_MISMATCH"
        | "CAPABILITY_PROBE_NOT_PASSED"
        | "CAPABILITY_CHECKS_INCOMPLETE"
        | "PROBE_STALE"
        | "PROFILE_NOT_QUALIFIED"
        | "CANDIDATE_ALREADY_CERTIFIED"
        | "CERTIFICATION_PERSISTENCE_FAILED";
    };

/** Promote only the latest immutable probe receipt for the exact candidate head. */
export async function certifyStoredInferenceProfileCandidate(input: {
  deploymentId: string;
  actorUserId: number;
  now?: Date;
}): Promise<StoredProfileCertificationResult> {
  if (
    !input.deploymentId.trim() ||
    !Number.isSafeInteger(input.actorUserId) ||
    input.actorUserId <= 0
  ) {
    return { ok: false, reason: "CANDIDATE_NOT_FOUND" };
  }
  const now = input.now ?? new Date();
  const db = getDb();
  try {
    return await db.transaction(async tx => {
      const [candidate] = await tx
        .select({
          profileVersionId: llmInferenceProfileVersions.id,
          deploymentId: llmInferenceProfileVersions.deploymentId,
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
        .where(
          eq(llmInferenceProfileCandidateHeads.deploymentId, input.deploymentId)
        )
        .for("update")
        .limit(1);
      if (!candidate) {
        const [active] = await tx
          .select({
            profileVersionId: llmInferenceProfileVersions.id,
            deploymentId: llmInferenceProfileVersions.deploymentId,
            deploymentRevision: llmInferenceProfileVersions.deploymentRevision,
            probeRunId: llmInferenceProfileCertifications.probeRunId,
          })
          .from(llmInferenceProfileHeads)
          .innerJoin(
            llmInferenceProfileVersions,
            eq(
              llmInferenceProfileHeads.profileVersionId,
              llmInferenceProfileVersions.id
            )
          )
          .innerJoin(
            llmInferenceProfileCertifications,
            eq(
              llmInferenceProfileCertifications.profileVersionId,
              llmInferenceProfileVersions.id
            )
          )
          .where(eq(llmInferenceProfileHeads.deploymentId, input.deploymentId))
          .limit(1);
        return active
          ? {
              ok: true as const,
              deploymentId: active.deploymentId,
              deploymentRevision: active.deploymentRevision,
              profileVersionId: active.profileVersionId,
              probeRunId: active.probeRunId,
              action: "already_certified" as const,
            }
          : { ok: false as const, reason: "CANDIDATE_NOT_FOUND" as const };
      }
      const parsed = inferenceProfilePairSchema.safeParse(
        candidate.profileJson
      );
      if (
        !parsed.success ||
        parsed.data.deployment.deploymentId !== candidate.deploymentId ||
        parsed.data.deployment.revision !== candidate.deploymentRevision
      ) {
        return {
          ok: false as const,
          reason: "PROFILE_OR_PROBE_BINDING_MISMATCH" as const,
        };
      }
      const [receipt] = await tx
        .select({
          runId: llmInferenceProbeRuns.runId,
          profileVersionId: llmInferenceProbeRuns.profileVersionId,
          deploymentId: llmInferenceProbeRuns.deploymentId,
          deploymentRevision: llmInferenceProbeRuns.deploymentRevision,
          providerRecordId: llmInferenceProbeRuns.providerRecordId,
          modelMappingId: llmInferenceProbeRuns.modelMappingId,
          probeKind: llmInferenceProbeRuns.probeKind,
          probeSuiteRevision: llmInferenceProbeRuns.probeSuiteRevision,
          status: llmInferenceProbeRuns.status,
          resultJson: llmInferenceProbeRuns.resultJson,
          finishedAt: llmInferenceProbeRuns.finishedAt,
        })
        .from(llmInferenceProbeRuns)
        .where(
          and(
            eq(
              llmInferenceProbeRuns.profileVersionId,
              candidate.profileVersionId
            ),
            eq(llmInferenceProbeRuns.probeKind, "capability_suite")
          )
        )
        .orderBy(desc(llmInferenceProbeRuns.finishedAt))
        .for("update")
        .limit(1);
      if (!receipt) {
        return {
          ok: false as const,
          reason: "CAPABILITY_PROBE_NOT_FOUND" as const,
        };
      }
      const certification = certifyInferenceProfileCandidate({
        profile: parsed.data,
        candidateProfileVersionId: candidate.profileVersionId,
        receipt,
        now,
      });
      if (!certification.ok) return certification;

      const [existing] = await tx
        .select({ probeRunId: llmInferenceProfileCertifications.probeRunId })
        .from(llmInferenceProfileCertifications)
        .where(
          eq(
            llmInferenceProfileCertifications.profileVersionId,
            candidate.profileVersionId
          )
        )
        .limit(1);
      if (existing && existing.probeRunId !== receipt.runId) {
        return {
          ok: false as const,
          reason: "CANDIDATE_ALREADY_CERTIFIED" as const,
        };
      }
      if (!existing) {
        await tx.insert(llmInferenceProfileCertifications).values({
          profileVersionId: candidate.profileVersionId,
          probeRunId: receipt.runId,
          certifiedProfileJson: certification.profile,
          certifiedByUserId: input.actorUserId,
          certifiedAt: now,
        });
      }
      await tx
        .insert(llmInferenceProfileHeads)
        .values({
          deploymentId: candidate.deploymentId,
          profileVersionId: candidate.profileVersionId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: llmInferenceProfileHeads.deploymentId,
          set: { profileVersionId: candidate.profileVersionId, updatedAt: now },
        });
      await tx
        .delete(llmInferenceProfileCandidateHeads)
        .where(
          eq(
            llmInferenceProfileCandidateHeads.deploymentId,
            candidate.deploymentId
          )
        );
      return {
        ok: true as const,
        deploymentId: candidate.deploymentId,
        deploymentRevision: candidate.deploymentRevision,
        profileVersionId: candidate.profileVersionId,
        probeRunId: receipt.runId,
        action: existing
          ? ("already_certified" as const)
          : ("certified" as const),
      };
    });
  } catch {
    return { ok: false, reason: "CERTIFICATION_PERSISTENCE_FAILED" };
  }
}
