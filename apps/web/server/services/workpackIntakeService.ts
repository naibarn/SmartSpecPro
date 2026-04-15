import { inferBrowserSkillId } from "../../shared/browserSkills";
import {
  buildDefaultEvidenceGovernance,
  type CaseSource,
  type CaseSourceType,
  caseSourceSchema,
  localFileReferenceSchema,
  type Playbook,
  playbookSchema,
  type WorkpackClarificationQuestion,
  type WorkpackExtractedField,
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
import {
  createWorkpackId,
  getWorkpackDetail,
  saveCaseSources,
  savePlaybook,
  saveTelemetryEvent,
  saveWorkpack,
  saveWorkpackVersion,
  updateWorkpack,
  updateWorkpackVersion,
  withWorkpackPersistenceTransaction,
} from "./workpackPersistence";

export interface DraftWorkpackSourceInput {
  type: CaseSourceType;
  title: string;
  sourceText?: string;
  referenceId?: string | null;
  originSurface?: string;
  localFileRef?: {
    deviceId?: string | null;
    rootLabel?: string | null;
    rootPath?: string | null;
    path: string;
    metadataSummary?: string;
    previewAvailable?: boolean;
    snippetAvailable?: boolean;
  } | null;
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

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function confidenceFromLength(value: string, bonus = 0): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.length >= 140) return clampConfidence(0.92 + bonus);
  if (trimmed.length >= 60) return clampConfidence(0.78 + bonus);
  if (trimmed.length >= 20) return clampConfidence(0.62 + bonus);
  return clampConfidence(0.4 + bonus);
}

function collectActors(text: string, domainPack: WorkpackDomainPack): string[] {
  const normalized = text.toLowerCase();
  const actors = new Set<string>();
  if (normalized.includes("customer")) actors.add("customer");
  if (normalized.includes("employee")) actors.add("employee");
  if (normalized.includes("vendor") || normalized.includes("supplier")) actors.add("vendor");
  if (normalized.includes("requester")) actors.add("requester");
  if (normalized.includes("manager")) actors.add("manager");
  if (normalized.includes("finance")) actors.add("finance operator");
  if (normalized.includes("hr")) actors.add("hr operator");
  if (normalized.includes("support")) actors.add("support operator");
  if (normalized.includes("sales")) actors.add("sales operator");
  if (normalized.includes("legal")) actors.add("legal reviewer");
  if (actors.size === 0) {
    actors.add(domainPack.replace(/_/g, " "));
  }
  return Array.from(actors);
}

function collectTriggerHints(text: string): string[] {
  const normalized = text.toLowerCase();
  const triggers = new Set<string>();
  if (normalized.includes("daily")) triggers.add("daily schedule");
  if (normalized.includes("weekly")) triggers.add("weekly schedule");
  if (normalized.includes("monthly")) triggers.add("monthly schedule");
  if (normalized.includes("when")) triggers.add("event-based intake");
  if (normalized.includes("inbound")) triggers.add("new inbound item");
  if (normalized.includes("new request")) triggers.add("new request created");
  return Array.from(triggers);
}

function collectFailureModes(domainPack: WorkpackDomainPack, text: string): string[] {
  const normalized = text.toLowerCase();
  const issues = new Set<string>();
  if (normalized.includes("mismatch")) issues.add("data mismatch");
  if (normalized.includes("missing")) issues.add("missing source data");
  if (normalized.includes("policy")) issues.add("policy boundary");
  if (normalized.includes("approval")) issues.add("approval needed");
  if (domainPack === "finance_ops" || domainPack === "procurement_ops") issues.add("financial commit boundary");
  if (domainPack === "support_ops") issues.add("low-confidence routing");
  if (domainPack === "legal_ops") issues.add("legal review ambiguity");
  return Array.from(issues);
}

function collectPolicyConstraints(domainPack: WorkpackDomainPack, sources: DraftWorkpackSourceInput[]): string[] {
  const constraints = new Set<string>(["approval decisions stay context-bound"]);
  if (sources.some((source) => source.type === "local_file")) {
    constraints.add("local files must stay inside approved roots");
  }
  if (sources.some((source) => source.type === "screenshot" || source.type === "screen_recording")) {
    constraints.add("visual evidence stays redacted until reviewed");
  }
  if (domainPack === "finance_ops" || domainPack === "procurement_ops") {
    constraints.add("financial and procurement writes require explicit approval");
  }
  if (domainPack === "hr_ops" || domainPack === "legal_ops") {
    constraints.add("sensitive people and legal data remains tenant-local");
  }
  return Array.from(constraints);
}

function buildExtractedFields(input: DraftWorkpackInput, domainPack: WorkpackDomainPack, connectorFamilies: string[]): WorkpackExtractedField[] {
  const joinedText = input.sources.map((source) => source.sourceText ?? source.title).join("\n");
  const actors = collectActors(joinedText, domainPack);
  const triggers = collectTriggerHints(joinedText);
  const failureModes = collectFailureModes(domainPack, joinedText);
  const policyConstraints = collectPolicyConstraints(domainPack, input.sources);
  const dataSensitivity = input.sources.some((source) => (
    source.type === "local_file"
    || source.type === "screenshot"
    || source.type === "screen_recording"
    || domainPack === "finance_ops"
    || domainPack === "legal_ops"
    || domainPack === "hr_ops"
  ))
    ? "restricted handling required"
    : "internal operational data";
  const baseSourceIds = input.sources.map((_source, index) => `src${index + 1}`);

  return [
    {
      key: "goal",
      label: "Goal",
      valueSummary: input.goal,
      confidence: confidenceFromLength(input.goal, 0.05),
      inferred: false,
      sourceIds: baseSourceIds,
      requiresClarification: confidenceFromLength(input.goal) < 0.65,
    },
    {
      key: "actors",
      label: "Actors",
      valueSummary: actors.join(", "),
      structuredValue: actors,
      confidence: clampConfidence(actors.length > 1 ? 0.76 : 0.62),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: actors.length === 0,
    },
    {
      key: "target_systems",
      label: "Target systems",
      valueSummary: connectorFamilies.join(", "),
      structuredValue: connectorFamilies,
      confidence: clampConfidence(connectorFamilies.length > 0 ? 0.8 : 0.35),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: connectorFamilies.length === 0,
    },
    {
      key: "trigger_conditions",
      label: "Trigger conditions",
      valueSummary: triggers.join(", "),
      structuredValue: triggers,
      confidence: clampConfidence(triggers.length > 0 ? 0.72 : 0.38),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: triggers.length === 0,
    },
    {
      key: "inputs_outputs",
      label: "Inputs and outputs",
      valueSummary: `Inputs from ${input.sources.map((source) => source.title).join(", ")}; outputs aligned to ${input.goal}`,
      confidence: clampConfidence(input.sources.length > 0 ? 0.77 : 0.3),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: input.sources.length === 0,
    },
    {
      key: "recurring_steps",
      label: "Recurring steps",
      valueSummary: getWorkpackDomainPack(domainPack).defaultStepTitles.join(", "),
      structuredValue: getWorkpackDomainPack(domainPack).defaultStepTitles,
      confidence: 0.74,
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: false,
    },
    {
      key: "exceptions_failure_modes",
      label: "Exceptions and failure modes",
      valueSummary: failureModes.join(", "),
      structuredValue: failureModes,
      confidence: clampConfidence(failureModes.length > 0 ? 0.68 : 0.42),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: failureModes.length === 0,
    },
    {
      key: "policy_constraints",
      label: "Policy constraints",
      valueSummary: policyConstraints.join(", "),
      structuredValue: policyConstraints,
      confidence: 0.84,
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: false,
    },
    {
      key: "data_sensitivity",
      label: "Data sensitivity",
      valueSummary: dataSensitivity,
      confidence: 0.82,
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: false,
    },
    {
      key: "connector_requirements",
      label: "Connector requirements",
      valueSummary: connectorFamilies.join(", "),
      structuredValue: connectorFamilies,
      confidence: clampConfidence(connectorFamilies.length > 0 ? 0.78 : 0.34),
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: connectorFamilies.length === 0,
    },
    {
      key: "evaluation_criteria",
      label: "Evaluation criteria",
      valueSummary: `High completion, low intervention, bounded exceptions, and evidence-backed output for ${input.title}`,
      confidence: 0.71,
      inferred: true,
      sourceIds: baseSourceIds,
      requiresClarification: false,
    },
  ];
}

function buildClarificationQueue(fields: WorkpackExtractedField[]): WorkpackClarificationQuestion[] {
  const createdAt = nowIso();
  return fields
    .filter((field) => field.requiresClarification || field.confidence < 0.6)
    .slice(0, 5)
    .map((field, index) => ({
      id: createWorkpackId(`clar${index + 1}`),
      fieldKey: field.key,
      prompt: `Please confirm the ${field.label.toLowerCase()} for this workpack.`,
      reason: field.valueSummary
        ? `Current extraction confidence is ${(field.confidence * 100).toFixed(0)}% and may be incomplete.`
        : `No reliable ${field.label.toLowerCase()} was extracted from the supplied sources.`,
      suggestedAnswer: field.valueSummary || null,
      confidence: field.confidence,
      status: "pending",
      answer: null,
      sourceIds: field.sourceIds,
      createdAt,
      updatedAt: createdAt,
    }));
}

function buildLocalFileIntelligence(input: DraftWorkpackInput) {
  const localSources = input.sources.filter((source) => source.type === "local_file");
  if (localSources.length === 0) {
    return {
      available: false,
      sourceDeviceId: null,
      parserStatus: "unknown" as const,
      capabilities: [],
      notes: [],
    };
  }
  const firstRef = localSources[0]?.localFileRef ?? null;
  return {
    available: Boolean(firstRef?.path),
    sourceDeviceId: firstRef?.deviceId ?? null,
    parserStatus: firstRef?.snippetAvailable || firstRef?.previewAvailable ? "ready" as const : "degraded" as const,
    capabilities: [
      firstRef?.previewAvailable ? "preview" : null,
      firstRef?.snippetAvailable ? "snippets" : null,
      "metadata",
    ].filter((value): value is string => Boolean(value)),
    notes: localSources.map((source) => `Local source staged from ${source.localFileRef?.path ?? source.title}`),
  };
}

function requiresClarification(fields: WorkpackExtractedField[], questions: WorkpackClarificationQuestion[]): boolean {
  if (!fields.length) return true;
  if (questions.length > 0) return true;
  return fields.some((field) => field.confidence < 0.55);
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
    localFileRef: source.localFileRef
      ? localFileReferenceSchema.parse(source.localFileRef)
      : null,
    governance: buildDefaultEvidenceGovernance({
      sensitivityClass:
        source.type === "screenshot"
        || source.type === "screen_recording"
        || source.type === "local_file"
          ? "restricted"
          : source.type === "spreadsheet"
            ? "financial"
            : "internal",
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

export async function createDraftWorkpack(input: DraftWorkpackInput): Promise<DraftWorkpackOutput> {
  const createdAt = nowIso();
  const inferredDomainPack = input.domainPack ?? inferWorkpackDomainPackFromText(
    `${input.title}\n${input.goal}\n${input.sources.map((source) => source.sourceText ?? "").join("\n")}`,
  );
  const pack = getWorkpackDomainPack(inferredDomainPack);
  const caseSources = input.sources.map((source, index) => buildCaseSource(input, source, index));
  const extractedFields = buildExtractedFields(input, inferredDomainPack, pack.connectorFamilies);
  const clarificationQueue = buildClarificationQueue(extractedFields);
  const localFileIntelligence = buildLocalFileIntelligence(input);
  const playbook = playbookSchema.parse({
    id: createWorkpackId("pl"),
    tenantId: input.tenantId,
    title: `${input.title} Playbook`,
    goal: input.goal,
    description: input.description ?? "",
    domainPack: inferredDomainPack,
    sourceIds: caseSources.map((source) => source.id),
    extractedFields,
    clarificationQueue,
    localFileIntelligence,
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
    lifecycleState: requiresClarification(extractedFields, clarificationQueue) ? "clarification_needed" : "draft",
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

  await withWorkpackPersistenceTransaction(async (session) => {
    await saveCaseSources(caseSources, session);
    await savePlaybook(playbook, session);
    await saveWorkpack(workpack, session);
    await saveWorkpackVersion(version, session);
    await saveTelemetryEvent({
      id: createWorkpackId("evt"),
      tenantId: input.tenantId,
      workpackId,
      versionId: version.id,
      eventName: requiresClarification(extractedFields, clarificationQueue) ? "clarification_requested" : "draft_created",
      detail: requiresClarification(extractedFields, clarificationQueue)
        ? `Draft created with ${clarificationQueue.length} targeted clarification prompts`
        : "Draft created from structured case intake",
      createdAt,
    }, session);
  });

  return {
    caseSources,
    playbook,
    workpack,
    version,
    suggestions: {
      domainPack: inferredDomainPack,
      connectorFamilies: pack.connectorFamilies,
      browserSkillHints: pack.browserSkillHints,
      workflowWorkerNodes: [
        "intake_case",
        "classify_case",
        "route_work",
        "approval_boundary",
        "retry_with_policy",
        "handoff_to_exception_queue",
        "dispatch_worker_job",
        "wait_for_worker_completion",
        "publish_worker_artifacts",
      ],
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
    "legal_ops",
    "customer_success",
    "operations",
    "content_operations",
    "executive_support",
  ] as const;
}

export async function answerClarificationQuestion(input: {
  workpackId: string;
  questionId: string;
  answer: string;
}): Promise<Playbook> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  const answeredAt = nowIso();
  let nextPlaybook: Playbook | null = null;
  await withWorkpackPersistenceTransaction(async (session) => {
    await updateWorkpackVersion(detail.version.id, (version) => {
      const clarificationQueue = version.playbook.clarificationQueue.map((question) => (
        question.id === input.questionId
          ? {
              ...question,
              status: "answered" as const,
              answer: input.answer,
              updatedAt: answeredAt,
            }
          : question
      ));
      const extractedFields = version.playbook.extractedFields.map((field) => (
        clarificationQueue.some((question) => question.id === input.questionId && question.fieldKey === field.key)
          ? {
              ...field,
              valueSummary: input.answer,
              confidence: Math.max(field.confidence, 0.88),
              inferred: false,
              requiresClarification: false,
            }
          : field
      ));
      nextPlaybook = {
        ...version.playbook,
        clarificationQueue,
        extractedFields,
      };
      return {
        ...version,
        playbook: nextPlaybook,
      };
    }, session);
    if (!nextPlaybook) {
      throw new Error(`Failed to answer clarification question: ${input.questionId}`);
    }
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: nextPlaybook!.clarificationQueue.some((question) => question.status === "pending")
        ? "clarification_needed"
        : "draft",
      updatedAt: answeredAt,
    }), session);
  });
  if (!nextPlaybook) {
    throw new Error(`Failed to answer clarification question: ${input.questionId}`);
  }
  return nextPlaybook;
}

export async function dismissClarificationQuestion(input: {
  workpackId: string;
  questionId: string;
}): Promise<Playbook> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  const updatedAt = nowIso();
  let nextPlaybook: Playbook | null = null;
  await withWorkpackPersistenceTransaction(async (session) => {
    await updateWorkpackVersion(detail.version.id, (version) => {
      nextPlaybook = {
        ...version.playbook,
        clarificationQueue: version.playbook.clarificationQueue.map((question) => (
          question.id === input.questionId
            ? { ...question, status: "dismissed" as const, updatedAt }
            : question
        )),
      };
      return {
        ...version,
        playbook: nextPlaybook,
      };
    }, session);
    if (!nextPlaybook) {
      throw new Error(`Failed to dismiss clarification question: ${input.questionId}`);
    }
    await updateWorkpack(detail.workpack.id, (workpack) => ({
      ...workpack,
      lifecycleState: nextPlaybook!.clarificationQueue.some((question) => question.status === "pending")
        ? "clarification_needed"
        : "draft",
      updatedAt,
    }), session);
  });
  if (!nextPlaybook) {
    throw new Error(`Failed to dismiss clarification question: ${input.questionId}`);
  }
  return nextPlaybook;
}
