import {
  assertVerticalDramaArtifactLineageCurrent,
  buildVerticalDramaArtifactAssuranceLineage,
  fingerprintVerticalDramaStageInput,
  VerticalDramaArtifactAssuranceLineageSchema,
  VerticalDramaAssuredArtifactRefSchema,
  type VerticalDramaArtifactAssuranceLineage,
  type VerticalDramaAssuredArtifactRef,
  type VerticalDramaAssuranceFinding,
  type VerticalDramaAssuranceRequest,
  type VerticalDramaAssuranceResult,
  type VerticalDramaAssuranceTaskKind,
} from "../../shared/verticalDramaSeries/assurance";
import {
  ProductionContextSnapshotRefSchema,
  validateProductionContextSnapshotRef,
  type ProductionContextSnapshot,
  type ProductionContextSnapshotRef,
} from "../../shared/verticalDramaSeries/verticalDramaAssuranceContext";
import {
  canonicalJsonStringify,
  sha256Hex,
} from "../../shared/verticalDramaSeries/artifacts";
import { validateBrollBinding } from "./verticalDramaBrollService";

export type VerticalDramaAssuranceDomainOwner = {
  tenantId: string;
  userId: number;
  entityType: "series" | "episode" | "shot";
  entityId: string;
};

export interface VerticalDramaStageAssuranceInput<TStageInput> {
  tenantId: string;
  userId: number;
  domainOwner: VerticalDramaAssuranceDomainOwner;
  taskKind: VerticalDramaAssuranceTaskKind;
  context: ProductionContextSnapshot;
  contextRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  idempotencyKey: string;
  stageInput: TStageInput;
  boundary: "advisory" | "activation" | "paid" | "export";
}

export interface VerticalDramaStageAssuranceOutput<TOutput> {
  output: TOutput;
  artifactRef: VerticalDramaAssuredArtifactRef;
  lineage: VerticalDramaArtifactAssuranceLineage;
  assurance: VerticalDramaAssuranceResult;
}

export interface VerticalDramaStageAssuranceDependencies<TStageInput, TOutput> {
  execute(input: {
    request: VerticalDramaStageAssuranceInput<TStageInput>;
    predecessorRefs: VerticalDramaAssuredArtifactRef[];
    inputFingerprint: string;
  }): Promise<{
    output: TOutput;
    assurance: VerticalDramaAssuranceResult;
    artifactId: string;
    artifactVersion: string;
    outputContractVersion: string;
    promptHash?: string;
    referenceManifestFingerprint?: string;
    providerProfileHash?: string;
  }>;
}

export class VerticalDramaStageAssuranceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "VerticalDramaStageAssuranceError";
  }
}

const ARTIFACT_KIND_BY_TASK: Record<
  VerticalDramaAssuranceTaskKind,
  VerticalDramaAssuredArtifactRef["kind"]
> = {
  premise_expansion: "story_architecture",
  story_architecture: "story_architecture",
  full_story: "full_story",
  draft_qc: "post_generation_qc",
  draft_repair: "full_story",
  start_frame_prompt: "start_frame_prompt",
  reference_image_prompt: "reference_image_prompt",
  video_prompt_qc: "video_motion_prompt_pack",
  broll_assembly_qc: "assembly_manifest",
  season_qc: "season_qc",
};

function finding(
  code: VerticalDramaAssuranceFinding["code"],
  message: string
): VerticalDramaAssuranceFinding {
  return { code, message };
}

function assertContextRefCurrent(
  context: ProductionContextSnapshot,
  contextRef: ProductionContextSnapshotRef
): void {
  const parsed = ProductionContextSnapshotRefSchema.parse(contextRef);
  if (!validateProductionContextSnapshotRef(context, parsed).ok) {
    throw new VerticalDramaStageAssuranceError(
      "VD_ASSURANCE_CONTEXT_STALE",
      "Production context reference is no longer current"
    );
  }
}

const readinessRank: Record<
  ProductionContextSnapshot["readiness"]["state"],
  number
> = {
  needs_review: -1,
  draft: 0,
  verified: 1,
  provider_ready: 2,
  production_ready: 3,
};

function assertBoundaryReadiness(
  context: ProductionContextSnapshot,
  boundary: VerticalDramaStageAssuranceInput<unknown>["boundary"]
): void {
  const required =
    boundary === "export"
      ? "production_ready"
      : boundary === "paid"
        ? "provider_ready"
        : boundary === "activation"
          ? "verified"
          : null;
  if (
    required &&
    readinessRank[context.readiness.state] < readinessRank[required]
  ) {
    throw new VerticalDramaStageAssuranceError(
      "VD_ASSURANCE_SOURCE_NOT_READY",
      `Production context is ${context.readiness.state}; ${required} readiness is required`
    );
  }
}

export function fingerprintVerticalDramaReferenceManifest(
  refs: readonly VerticalDramaAssuredArtifactRef[]
): string {
  return sha256Hex(
    canonicalJsonStringify(
      refs.map(ref => VerticalDramaAssuredArtifactRefSchema.parse(ref))
    )
  );
}

export async function resolveCurrentAssuredPredecessors(input: {
  context: ProductionContextSnapshot;
  contextRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  loadAuthoritativeRefs: () => Promise<VerticalDramaAssuredArtifactRef[]>;
}): Promise<VerticalDramaAssuredArtifactRef[]> {
  assertContextRefCurrent(input.context, input.contextRef);
  const requested = input.predecessorRefs.map(ref =>
    VerticalDramaAssuredArtifactRefSchema.parse(ref)
  );
  const authoritative = (await input.loadAuthoritativeRefs()).map(ref =>
    VerticalDramaAssuredArtifactRefSchema.parse(ref)
  );
  if (
    canonicalJsonStringify(requested) !== canonicalJsonStringify(authoritative)
  ) {
    throw new VerticalDramaStageAssuranceError(
      "VD_ASSURANCE_PREDECESSOR_STALE",
      "Caller predecessors do not match authoritative accepted artifacts"
    );
  }
  return authoritative;
}

export async function runAssuredStage<TStageInput, TOutput>(
  input: VerticalDramaStageAssuranceInput<TStageInput>,
  deps: VerticalDramaStageAssuranceDependencies<TStageInput, TOutput>
): Promise<VerticalDramaStageAssuranceOutput<TOutput>> {
  if (
    input.tenantId !== input.domainOwner.tenantId ||
    input.userId !== input.domainOwner.userId
  ) {
    throw new VerticalDramaStageAssuranceError(
      "VD_ASSURANCE_TENANT_MISMATCH",
      "Stage owner does not match the domain owner"
    );
  }
  assertContextRefCurrent(input.context, input.contextRef);
  assertBoundaryReadiness(input.context, input.boundary);
  const predecessorRefs = input.predecessorRefs.map(ref =>
    VerticalDramaAssuredArtifactRefSchema.parse(ref)
  );
  const inputFingerprint = fingerprintVerticalDramaStageInput({
    taskKind: input.taskKind,
    contextSnapshotRef: input.contextRef,
    predecessorRefs,
    contractVersion: input.contractVersion,
    policyHash: input.policyHash,
    modelPolicy: input.modelPolicy,
    stageInput: input.stageInput,
  });
  const executed = await deps.execute({
    request: { ...input, predecessorRefs },
    predecessorRefs,
    inputFingerprint,
  });
  if (
    executed.assurance.state !== "succeeded" ||
    executed.assurance.disposition !== "verified"
  ) {
    throw new VerticalDramaStageAssuranceError(
      "VD_ASSURANCE_FINAL_GATE_BLOCKED",
      "Deterministic assurance did not produce a verified result"
    );
  }
  const lineage = buildVerticalDramaArtifactAssuranceLineage({
    request: {
      schemaVersion: 1,
      tenantId: input.tenantId,
      userId: input.userId,
      taskKind: input.taskKind,
      runtimeTaskKind:
        input.taskKind === "start_frame_prompt" ||
        input.taskKind === "reference_image_prompt"
          ? "image_prompt"
          : input.taskKind === "video_prompt_qc"
            ? "video_prompt"
            : "skill_execution",
      sourceRef: null,
      contextSnapshotRef: input.contextRef,
      inputRefs: [
        input.idempotencyKey,
        ...predecessorRefs.map(ref => ref.artifactId),
      ],
      contractVersion: Number(input.contractVersion) || 1,
      runtimeContractVersion: 2,
      outputContractVersion: Number(executed.outputContractVersion) || 1,
      rulePackIds: [],
      policyHash: input.policyHash,
      modelHash: sha256Hex(input.modelPolicy),
      compatibilityMode: "native",
      requiredReadiness:
        input.boundary === "export"
          ? "production_ready"
          : input.boundary === "paid"
            ? "provider_ready"
            : "verified",
      idempotencyKey: input.idempotencyKey,
      attemptId: executed.assurance.attemptId,
      budget: {
        maxTurns: 1,
        maxToolCalls: 0,
        maxParallelAgents: 1,
        maxPlanDepth: 1,
        maxWallClockSeconds: 1,
        maxInputTokens: 1,
        maxOutputTokens: 1,
        maxRepairAttempts: 0,
        estimatedCost: 0,
      },
      sideEffectPolicy: "none",
    },
    result: executed.assurance,
    outputContractVersion: executed.outputContractVersion,
    output: executed.output,
    predecessorRefs,
    modelPolicy: input.modelPolicy,
    stageInput: input.stageInput,
    promptHash: executed.promptHash,
    referenceManifestFingerprint: executed.referenceManifestFingerprint,
    providerProfileHash: executed.providerProfileHash,
  });
  const artifactRef = VerticalDramaAssuredArtifactRefSchema.parse({
    kind: ARTIFACT_KIND_BY_TASK[input.taskKind],
    artifactId: executed.artifactId,
    version: executed.artifactVersion,
    fingerprint: lineage.outputFingerprint,
  });
  return {
    output: executed.output,
    artifactRef,
    lineage: VerticalDramaArtifactAssuranceLineageSchema.parse(lineage),
    assurance: executed.assurance,
  };
}

export function validateLineageContinuity(input: {
  lineage: VerticalDramaArtifactAssuranceLineage;
  contextRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  stageInput: unknown;
  taskKind: VerticalDramaAssuranceTaskKind;
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  requiredReadiness:
    | "draft"
    | "verified"
    | "provider_ready"
    | "production_ready";
}): VerticalDramaAssuranceFinding[] {
  try {
    assertVerticalDramaArtifactLineageCurrent({
      lineage: input.lineage,
      expectedContext: input.contextRef,
      expectedPredecessors: input.predecessorRefs,
      expectedInputFingerprint: fingerprintVerticalDramaStageInput({
        taskKind: input.taskKind,
        contextSnapshotRef: input.contextRef,
        predecessorRefs: input.predecessorRefs,
        contractVersion: input.contractVersion,
        policyHash: input.policyHash,
        modelPolicy: input.modelPolicy,
        stageInput: input.stageInput,
      }),
      requiredReadiness: input.requiredReadiness,
    });
    return [];
  } catch (error) {
    const code =
      error instanceof Error && "code" in error
        ? String((error as { code: unknown }).code)
        : "VD_ASSURANCE_STAGE_INPUT_MISMATCH";
    return [
      finding(
        code as VerticalDramaAssuranceFinding["code"],
        error instanceof Error
          ? error.message
          : "Artifact lineage is not current"
      ),
    ];
  }
}

export const validateStartFramePromptContinuity = validateLineageContinuity;
export const validateReferencePromptContinuity = validateLineageContinuity;
export const validateVideoPromptContinuity = validateLineageContinuity;

export function validateBrollAssemblyContinuity(input: {
  lineage: VerticalDramaArtifactAssuranceLineage;
  contextRef: ProductionContextSnapshotRef;
  predecessorRefs: VerticalDramaAssuredArtifactRef[];
  stageInput: unknown;
  contractVersion: string;
  policyHash: string;
  modelPolicy: string;
  binding: Parameters<typeof validateBrollBinding>[0];
}): VerticalDramaAssuranceFinding[] {
  const findings = validateLineageContinuity({
    ...input,
    taskKind: "broll_assembly_qc",
    requiredReadiness: "verified",
  });
  try {
    validateBrollBinding(input.binding, {
      snapshotRevision: input.contextRef.revision,
      snapshotFingerprint: input.contextRef.fingerprint,
    });
  } catch (error) {
    findings.push(
      finding(
        "VD_ASSURANCE_BROLL_BINDING_STALE",
        error instanceof Error ? error.message : "B-roll binding is not current"
      )
    );
  }
  return findings;
}

type StageWithoutTask<T> = Omit<
  VerticalDramaStageAssuranceInput<T>,
  "taskKind"
>;
export const runAssuredStoryArchitecture = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "story_architecture" }, deps);
export const runAssuredFullStory = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "full_story" }, deps);
export const runAssuredDeepStoryDraft = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "full_story" }, deps);
export const runAssuredStartFramePrompt = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "start_frame_prompt" }, deps);
export const runAssuredReferenceImagePrompt = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "reference_image_prompt" }, deps);
export const runAssuredVideoPrompt = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "video_prompt_qc" }, deps);
export const runAssuredBrollAssemblyQc = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "broll_assembly_qc" }, deps);
export const runAssuredPostGenerationQc = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "draft_qc" }, deps);
export const runAssuredSeasonQc = <TInput, TOutput>(
  input: StageWithoutTask<TInput>,
  deps: VerticalDramaStageAssuranceDependencies<TInput, TOutput>
) => runAssuredStage({ ...input, taskKind: "season_qc" }, deps);
