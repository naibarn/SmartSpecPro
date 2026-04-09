import { inferBrowserSkillId } from "../../shared/browserSkills";
import {
  buildDefaultEvidenceGovernance,
  type CaseSource,
  type CaseSourceType,
  caseSourceSchema,
  type Playbook,
  playbookSchema,
  type Workpack,
  type WorkpackStep,
  workpackSchema,
  type WorkpackVersion,
  workpackVersionSchema,
} from "../../shared/workpackContracts";
import {
  getWorkpackDomainPack,
  inferWorkpackDomainPackFromText,
  type WorkpackDomainPack,
} from "../../shared/workpackDomainPacks";
import { createWorkpackId, saveCaseSources, savePlaybook, saveTelemetryEvent, saveWorkpack, saveWorkpackVersion } from "./workpackPersistence";

export interface DraftWorkpackSourceInput {
  type: CaseSourceType;
  title: string;
  sourceText?: string;
  referenceId?: string | null;
  originSurface?: string;
}

export interface DraftWorkpackInput {
  tenantId: string;
  title: string;
  goal: string;
  description?: string;
  domainPack?: WorkpackDomainPack;
  sources: DraftWorkpackSourceInput[];
}

export interface DraftWorkpackOutput {
  caseSources: CaseSource[];
  playbook: Playbook;
  workpack: Workpack;
  version: WorkpackVersion;
  suggestions: {
    domainPack: WorkpackDomainPack;
    connectorFamilies: string[];
    browserSkillHints: string[];
    workflowWorkerNodes: string[];
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeSourceText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function requiresClarification(input: DraftWorkpackInput): boolean {
  if (!input.goal.trim()) return true;
  if (!input.sources.length) return true;
  return input.sources.some((source) => (source.sourceText ?? "").trim().length < 16);
}

function buildCaseSource(input: DraftWorkpackInput, source: DraftWorkpackSourceInput, index: number): CaseSource {
  const createdAt = nowIso();
  return caseSourceSchema.parse({
    id: createWorkpackId(`src${index + 1}`),
    tenantId: input.tenantId,
    type: source.type,
    title: source.title,
    referenceId: source.referenceId ?? null,
    sourceText: source.sourceText ?? "",
    summary: summarizeSourceText(source.sourceText ?? ""),
    trace: [
      {
        sourceId: `source-${index + 1}`,
        sourceType: source.type,
        originSurface: source.originSurface ?? "workpack_intake",
        label: source.title,
        referenceId: source.referenceId ?? null,
      },
    ],
    governance: buildDefaultEvidenceGovernance({
      sensitivityClass: source.type === "screenshot" ? "restricted" : "internal",
      redactionState: source.type === "local_file" ? "redacted" : "summary_only",
    }),
    createdAt,
  });
}

function buildStepId(seed: string, index: number): string {
  return `${seed}_${index + 1}`;
}

function defaultSideEffectForDomain(
  domainPack: WorkpackDomainPack,
  index: number,
): WorkpackStep["sideEffectClass"] {
  if (index === 0) return "read_only";
  if (index === 1) return "bounded_write";
  if ((domainPack === "finance_ops" || domainPack === "procurement_ops") && index >= 2) {
    return index === 3 ? "financial" : "external_write";
  }
  return index === 3 ? "external_write" : "bounded_write";
}

function buildInitialStepRuntime(
  domainPack: WorkpackDomainPack,
  index: number,
): WorkpackStep["preferredRuntimePath"] {
  if (index === 0) return "skill";
  if (domainPack === "procurement_ops") return index === 1 ? "browser" : "hybrid";
  if (domainPack === "executive_support") return index === 3 ? "browser" : "hybrid";
  if (domainPack === "support_ops") return index === 1 ? "workflow" : "hybrid";
  return index >= 2 ? "hybrid" : "workflow";
}

function buildDraftSteps(input: DraftWorkpackInput, domainPack: WorkpackDomainPack): WorkpackStep[] {
  const pack = getWorkpackDomainPack(domainPack);
  return pack.defaultStepTitles.map((title, index) => {
    const sideEffectClass = defaultSideEffectForDomain(domainPack, index);
    const preferredRuntimePath = buildInitialStepRuntime(domainPack, index);
    const requiresApproval = sideEffectClass === "financial" || sideEffectClass === "irreversible";
    const browserHint = inferBrowserSkillId(`${input.title} ${input.goal} ${title}`);

    return {
      id: buildStepId(`step_${domainPack}`, index),
      title,
      objective: `${title} for ${input.goal}`,
      expectedOutcome: `Bounded, inspectable progress for ${input.title}`,
      preferredRuntimePath,
      allowedFallbackPaths: preferredRuntimePath === "hybrid" ? ["workflow", "agency"] : preferredRuntimePath === "browser" ? ["hybrid"] : ["skill"],
      requiredConnectorFamilies: pack.connectorFamilies,
      sideEffectClass,
      requiresReplay: true,
      requiresApproval,
      localityHint: preferredRuntimePath === "desktop_local" ? "desktop" : "none",
      idempotency: {
        mode: sideEffectClass === "read_only" ? "none" : sideEffectClass === "financial" ? "single_attempt" : "connector_key",
        effectKey: sideEffectClass === "read_only" ? null : `${domainPack}-${index + 1}-${browserHint}`,
        retryDisposition: sideEffectClass === "financial" ? "blocked" : sideEffectClass === "read_only" ? "safe_retry" : "safe_retry",
        replayMode: sideEffectClass === "read_only" ? "inspection_only" : "requires_fresh_run",
      },
      metadata: {
        browserHint,
        domainPack,
        draftSourceCount: input.sources.length,
      },
    };
  });
}

export function createDraftWorkpack(input: DraftWorkpackInput): DraftWorkpackOutput {
  const createdAt = nowIso();
  const inferredDomainPack = input.domainPack ?? inferWorkpackDomainPackFromText(
    `${input.title}\n${input.goal}\n${input.sources.map((source) => source.sourceText ?? "").join("\n")}`,
  );
  const caseSources = input.sources.map((source, index) => buildCaseSource(input, source, index));
  const playbook = playbookSchema.parse({
    id: createWorkpackId("pl"),
    tenantId: input.tenantId,
    title: `${input.title} Playbook`,
    goal: input.goal,
    description: input.description ?? "",
    domainPack: inferredDomainPack,
    sourceIds: caseSources.map((source) => source.id),
    steps: buildDraftSteps(input, inferredDomainPack),
    createdAt,
  });
  const workpackId = createWorkpackId("wp");
  const version = workpackVersionSchema.parse({
    id: createWorkpackId("wpv"),
    workpackId,
    versionNumber: 1,
    playbook,
    executionPlan: null,
    connectorMaps: [],
    fixtureCatalog: caseSources.map((source, index) => ({
      id: createWorkpackId(`fix${index + 1}`),
      label: `Fixture ${index + 1}`,
      payload: {
        sourceId: source.id,
        summary: source.summary,
      },
      governance: {
        ...source.governance,
        redactionState: source.governance.redactionState === "unscrubbed" ? "redacted" : source.governance.redactionState,
      },
    })),
    compilerMetadata: {},
    publishedAt: null,
    createdAt,
  });
  const workpack = workpackSchema.parse({
    id: workpackId,
    tenantId: input.tenantId,
    title: input.title,
    description: input.description ?? "",
    goal: input.goal,
    domainPack: inferredDomainPack,
    lifecycleState: requiresClarification(input) ? "clarification_needed" : "draft",
    autonomyMode: "draft",
    promotionState: "unpromoted",
    currentVersionId: version.id,
    caseSourceIds: caseSources.map((source) => source.id),
    policyProfile: {
      humanInLoopPreference: "exception_only",
    },
    runtimePreferenceHints: Array.from(new Set(playbook.steps.map((step) => step.preferredRuntimePath))),
    createdAt,
    updatedAt: createdAt,
  });

  saveCaseSources(caseSources);
  savePlaybook(playbook);
  saveWorkpack(workpack);
  saveWorkpackVersion(version);
  saveTelemetryEvent({
    id: createWorkpackId("evt"),
    tenantId: input.tenantId,
    workpackId,
    versionId: version.id,
    eventName: requiresClarification(input) ? "clarification_requested" : "draft_created",
    detail: requiresClarification(input)
      ? "Draft created but requires clarification before promotion"
      : "Draft created from structured case intake",
    createdAt,
  });

  const pack = getWorkpackDomainPack(inferredDomainPack);
  return {
    caseSources,
    playbook,
    workpack,
    version,
    suggestions: {
      domainPack: inferredDomainPack,
      connectorFamilies: pack.connectorFamilies,
      browserSkillHints: pack.browserSkillHints,
      workflowWorkerNodes: ["dispatch_worker_job", "wait_for_worker_completion", "publish_worker_artifacts"],
    },
  };
}

export function listDomainPackSuggestions() {
  return [
    "finance_ops",
    "hr_ops",
    "support_ops",
    "sales_ops",
    "procurement_ops",
    "executive_support",
  ] as const;
}
