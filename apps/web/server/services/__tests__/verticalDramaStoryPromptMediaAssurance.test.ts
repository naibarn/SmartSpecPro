import { describe, expect, it } from "vitest";
import {
  buildVerticalDramaArtifactAssuranceLineage,
  type VerticalDramaAssuranceRequest,
  type VerticalDramaAssuranceResult,
} from "@shared/verticalDramaSeries/assurance";
import { buildProductionContextSnapshot } from "@shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  fingerprintVerticalDramaReferenceManifest,
  resolveCurrentAssuredPredecessors,
  runAssuredStage,
  validateLineageContinuity,
} from "../verticalDramaStoryPromptMediaAssurance";

const hash = "a".repeat(64);

function context() {
  return buildProductionContextSnapshot({
    schemaVersion: 1,
    snapshotId: "ctx-1",
    revision: 1,
    seriesId: 1,
    profile: {
      profileId: "documentary",
      version: 1,
      contentKind: "documentary",
      visualGroundingVersion: 1,
      visualGroundingFingerprint: hash,
      factPolicyVersion: 1,
      brollPolicyVersion: 1,
    },
    sourcePackPolicy: "optional",
    sourcePackDecision: "explicit_none",
    sourcePack: null,
    readiness: { state: "draft", blockingReasons: ["context_facts_missing"] },
    visualSource: {
      snapshotId: "visual-1",
      revision: 1,
      fingerprint: hash,
      visualCanonVersion: 1,
      visualCanonFingerprint: hash,
    },
    claimLedger: null,
    coveragePlan: null,
    references: {
      storyControlRefs: [],
      characterRefs: [],
      sceneRefs: [],
      shotRefs: [],
      claimRefs: [],
      coverageRefs: [],
      slotRefs: [],
      assetRefs: [],
      segmentRefs: [],
      mediaBindingRefs: [],
    },
  });
}

function request(
  snapshot: ReturnType<typeof context>
): VerticalDramaAssuranceRequest {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    userId: 1,
    taskKind: "story_architecture",
    runtimeTaskKind: "structured_generation",
    sourceRef: null,
    contextSnapshotRef: {
      snapshotId: snapshot.snapshotId,
      revision: snapshot.revision,
      fingerprint: snapshot.fingerprint,
    },
    inputRefs: ["premise"],
    contractVersion: 1,
    runtimeContractVersion: 2,
    outputContractVersion: 1,
    rulePackIds: [],
    policyHash: hash,
    modelHash: hash,
    compatibilityMode: "native",
    requiredReadiness: "verified",
    idempotencyKey: "idem-1",
    attemptId: "attempt-1",
    budget: {
      maxTurns: 1,
      maxToolCalls: 1,
      maxParallelAgents: 1,
      maxPlanDepth: 1,
      maxWallClockSeconds: 1,
      maxInputTokens: 1,
      maxOutputTokens: 1,
      maxRepairAttempts: 0,
      estimatedCost: 0,
    },
    sideEffectPolicy: "none",
  };
}

function result(): VerticalDramaAssuranceResult {
  return {
    executionId: "exec-1",
    attemptId: "attempt-1",
    state: "succeeded",
    disposition: "verified",
    readiness: "verified",
    findings: [],
    mode: "legacy_deterministic",
    fallbackReason: null,
    traceId: null,
    nextAction: "continue",
  };
}

describe("Vertical Drama story/prompt/media assurance coordinator", () => {
  it("keeps reference-manifest order in the identity hash", () => {
    const refs = [
      {
        kind: "start_frame_prompt" as const,
        artifactId: "a",
        version: "1",
        fingerprint: hash,
        orderedIndex: 0,
      },
      {
        kind: "reference_image_prompt" as const,
        artifactId: "b",
        version: "1",
        fingerprint: hash,
        orderedIndex: 1,
      },
    ];
    expect(fingerprintVerticalDramaReferenceManifest(refs)).not.toBe(
      fingerprintVerticalDramaReferenceManifest([...refs].reverse())
    );
  });

  it("rejects caller-invented predecessors", async () => {
    const snapshot = context();
    const ref = {
      kind: "story_architecture" as const,
      artifactId: "a",
      version: "1",
      fingerprint: hash,
    };
    await expect(
      resolveCurrentAssuredPredecessors({
        context: snapshot,
        contextRef: {
          snapshotId: snapshot.snapshotId,
          revision: snapshot.revision,
          fingerprint: snapshot.fingerprint,
        },
        predecessorRefs: [ref],
        loadAuthoritativeRefs: async () => [],
      })
    ).rejects.toMatchObject({ code: "VD_ASSURANCE_PREDECESSOR_STALE" });
  });

  it("runs a stage through one deterministic fingerprint and returns immutable lineage", async () => {
    const snapshot = context();
    const req = request(snapshot);
    const output = { title: "candidate" };
    const lineage = buildVerticalDramaArtifactAssuranceLineage({
      request: req,
      result: result(),
      outputContractVersion: "1",
      output,
      predecessorRefs: [],
      modelPolicy: "model:v1",
      stageInput: { premise: "x" },
    });
    const executed = await runAssuredStage(
      {
        tenantId: "tenant-1",
        userId: 1,
        domainOwner: {
          tenantId: "tenant-1",
          userId: 1,
          entityType: "series",
          entityId: "1",
        },
        taskKind: "story_architecture",
        context: snapshot,
        contextRef: req.contextSnapshotRef,
        predecessorRefs: [],
        contractVersion: "1",
        policyHash: hash,
        modelPolicy: "model:v1",
        idempotencyKey: "idem-1",
        stageInput: { premise: "x" },
        boundary: "advisory",
      },
      {
        execute: async () => ({
          output,
          assurance: result(),
          artifactId: "artifact-1",
          artifactVersion: "1",
          outputContractVersion: "1",
        }),
      }
    );
    expect(executed.artifactRef.artifactId).toBe("artifact-1");
    expect(executed.lineage.inputFingerprint).toBe(lineage.inputFingerprint);
  });

  it("reports stale lineage without mutating the accepted artifact", () => {
    const snapshot = context();
    const req = request(snapshot);
    const lineage = buildVerticalDramaArtifactAssuranceLineage({
      request: req,
      result: result(),
      outputContractVersion: "1",
      output: { title: "candidate" },
      predecessorRefs: [],
      modelPolicy: "model:v1",
      stageInput: { premise: "x" },
    });
    const findings = validateLineageContinuity({
      lineage,
      contextRef: req.contextSnapshotRef,
      predecessorRefs: [],
      stageInput: { premise: "changed" },
      taskKind: "story_architecture",
      contractVersion: "1",
      policyHash: hash,
      modelPolicy: "model:v1",
      requiredReadiness: "verified",
    });
    expect(findings[0]?.code).toBe("VD_ASSURANCE_STAGE_INPUT_MISMATCH");
  });

  it("fails closed when an export context is not production-ready", async () => {
    const snapshot = context();
    await expect(
      runAssuredStage(
        {
          tenantId: "tenant-1",
          userId: 1,
          domainOwner: {
            tenantId: "tenant-1",
            userId: 1,
            entityType: "series",
            entityId: "1",
          },
          taskKind: "story_architecture",
          context: snapshot,
          contextRef: {
            snapshotId: snapshot.snapshotId,
            revision: snapshot.revision,
            fingerprint: snapshot.fingerprint,
          },
          predecessorRefs: [],
          contractVersion: "1",
          policyHash: hash,
          modelPolicy: "model:v1",
          idempotencyKey: "export-not-ready",
          stageInput: { premise: "x" },
          boundary: "export",
        },
        {
          execute: async () => ({
            output: { title: "candidate" },
            assurance: result(),
            artifactId: "artifact-1",
            artifactVersion: "1",
            outputContractVersion: "1",
          }),
        }
      )
    ).rejects.toMatchObject({ code: "VD_ASSURANCE_SOURCE_NOT_READY" });
  });
});
