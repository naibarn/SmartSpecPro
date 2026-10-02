import type { DataRequirement } from "./resolver";

export type ResearchMode = "SOURCE_DISCOVERY" | "EVIDENCE_ACQUISITION" | "KNOWLEDGE_SYNTHESIS" | "REVALIDATION" | "MONITORING";
export type ResearchConsumerKind = "DECISION_ANALYSIS" | "EMERGENCY_PROFILE" | "SKILL" | "OTHER";
export type ResearchRunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export interface ResearchRequest {
  readonly contractVersion: "spec266-research-v1";
  readonly researchRequestId: string;
  readonly idempotencyKey: string;
  readonly authorizationScope: "PUBLIC" | "TENANT";
  readonly consumerKind: ResearchConsumerKind;
  readonly consumerRef: string;
  readonly tenantId?: string;
  readonly projectId?: string;
  readonly requestedBy: string;
  readonly goal: string;
  readonly mode: ResearchMode;
  readonly dataRequirements?: readonly DataRequirement[];
  readonly geographyRefs?: readonly string[];
  readonly temporalRequirement?: { readonly from?: string; readonly to?: string };
  readonly preferredProviderIds?: readonly string[];
  readonly prohibitedProviderIds?: readonly string[];
  readonly maxCostCredits?: number;
  readonly maxExternalCost?: number | "unknown";
  readonly maxWallTimeSeconds?: number;
  readonly maxSources?: number;
  readonly privacyClass: string;
  readonly rightsRequirements?: readonly string[];
  readonly outputPolicyRef: string;
}

export interface ResearchRun {
  readonly contractVersion: "spec266-research-v1";
  readonly researchRunId: string;
  readonly researchRequestId: string;
  readonly canonicalJobRef?: string;
  readonly tenantId?: string;
  readonly providerId: string;
  readonly modelOrAgentVersion?: string;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly status: ResearchRunStatus;
  readonly queryPlanRef?: string;
  readonly toolReceiptRefs: readonly string[];
  readonly artifactRefs: readonly string[];
  readonly candidateRefs: readonly string[];
  readonly sourceUrlsOrIds: readonly string[];
  readonly costReceiptRef?: string;
  readonly parentResearchRunIds?: readonly string[];
}

type ParseError = "RESEARCH_CONTRACT_INVALID" | "RESEARCH_UNKNOWN_FIELD" | "RESEARCH_SCOPE_INVALID" | "RESEARCH_BUDGET_INVALID";
type ParseResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: ParseError };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const PERSISTED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,35}$/;
const MODES = new Set<ResearchMode>(["SOURCE_DISCOVERY", "EVIDENCE_ACQUISITION", "KNOWLEDGE_SYNTHESIS", "REVALIDATION", "MONITORING"]);
const CONSUMERS = new Set<ResearchConsumerKind>(["DECISION_ANALYSIS", "EMERGENCY_PROFILE", "SKILL", "OTHER"]);
const RUN_STATUSES = new Set<ResearchRunStatus>(["queued", "running", "completed", "partial", "failed", "cancelled"]);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_FIELD = /(?:api[_-]?key|authorization|cookie|credential|password|secret|token)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    count += 1;
    if (count > allowed.size || !allowed.has(key)) return false;
  }
  return true;
}

function isDenseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value as Record<string, unknown>)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_INSTANT.test(value) || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === value;
}

function stringList(value: unknown, maximum: number): value is string[] {
  if (!isDenseArray(value, maximum)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isId(item) || seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}

function isBoundedData(value: unknown, depth = 0, budget = { count: 0 }): boolean {
  budget.count += 1;
  if (depth > 6 || budget.count > 1_024) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 2_048;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (!isDenseArray(value, 128)) return false;
    for (const item of value) if (!isBoundedData(item, depth + 1, budget)) return false;
    return true;
  }
  if (!isRecord(value)) return false;
  let fields = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    fields += 1;
    if (fields > 64 || SECRET_FIELD.test(key) || key.length > 128 || !isBoundedData(value[key], depth + 1, budget)) return false;
  }
  return true;
}

const REQUIREMENT_FIELDS = new Set([
  "semanticType", "geography", "temporal", "minimumFreshness", "minimumCoverage", "requiredFields", "acceptedSourceClasses",
  "acceptedEvidenceClasses", "commercialUseRequired", "redistributableRequired", "maximumCostCredits", "privacyClass", "required",
]);
const EVIDENCE_CLASSES = new Set<string>([
  "reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning",
]);

/** Strict version-1 DataRequirement parser shared by research and decision admission. */
export function parseDataRequirement(value: unknown): ParseResult<DataRequirement> {
  if (!isRecord(value) || !hasOnlyFields(value, REQUIREMENT_FIELDS) || !isId(value.semanticType)) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (value.geography !== undefined && (!isRecord(value.geography) || !hasOnlyFields(value.geography, new Set(["kind", "ref"])) || !isId(value.geography.kind) || !isId(value.geography.ref))) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (value.temporal !== undefined && (!isRecord(value.temporal) || !hasOnlyFields(value.temporal, new Set(["from", "to"])) ||
    (value.temporal.from !== undefined && !isInstant(value.temporal.from)) || (value.temporal.to !== undefined && !isInstant(value.temporal.to)) ||
    (value.temporal.from !== undefined && value.temporal.to !== undefined && Date.parse(value.temporal.from as string) > Date.parse(value.temporal.to as string)))) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  const stringLists = [value.requiredFields, value.acceptedSourceClasses];
  if (stringLists.some(list => list !== undefined && !stringList(list, 128)) ||
    (value.acceptedEvidenceClasses !== undefined && (!isDenseArray(value.acceptedEvidenceClasses, 16) || value.acceptedEvidenceClasses.some(item => typeof item !== "string" || !EVIDENCE_CLASSES.has(item)) || new Set(value.acceptedEvidenceClasses).size !== value.acceptedEvidenceClasses.length)) ||
    (value.minimumFreshness !== undefined && (typeof value.minimumFreshness !== "string" || !Number.isFinite(Number(value.minimumFreshness)) || Number(value.minimumFreshness) < 0)) ||
    (value.minimumCoverage !== undefined && (typeof value.minimumCoverage !== "number" || !Number.isFinite(value.minimumCoverage) || value.minimumCoverage < 0 || value.minimumCoverage > 1)) ||
    (value.maximumCostCredits !== undefined && (typeof value.maximumCostCredits !== "number" || !Number.isFinite(value.maximumCostCredits) || value.maximumCostCredits < 0)) ||
    ["commercialUseRequired", "redistributableRequired", "required"].some(key => value[key] !== undefined && typeof value[key] !== "boolean") ||
    (value.privacyClass !== undefined && !isId(value.privacyClass))) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  return {
    ok: true,
    value: deepFreeze({
      semanticType: value.semanticType as string,
      ...(value.geography === undefined ? {} : { geography: { kind: value.geography.kind as string, ref: value.geography.ref as string } }),
      ...(value.temporal === undefined ? {} : { temporal: { ...(value.temporal.from === undefined ? {} : { from: value.temporal.from as string }), ...(value.temporal.to === undefined ? {} : { to: value.temporal.to as string }) } }),
      ...(value.minimumFreshness === undefined ? {} : { minimumFreshness: value.minimumFreshness as string }),
      ...(value.minimumCoverage === undefined ? {} : { minimumCoverage: value.minimumCoverage as number }),
      ...(value.requiredFields === undefined ? {} : { requiredFields: [...value.requiredFields as string[]] }),
      ...(value.acceptedSourceClasses === undefined ? {} : { acceptedSourceClasses: [...value.acceptedSourceClasses as string[]] }),
      ...(value.acceptedEvidenceClasses === undefined ? {} : { acceptedEvidenceClasses: [...value.acceptedEvidenceClasses as string[]] }),
      ...(value.commercialUseRequired === undefined ? {} : { commercialUseRequired: value.commercialUseRequired as boolean }),
      ...(value.redistributableRequired === undefined ? {} : { redistributableRequired: value.redistributableRequired as boolean }),
      ...(value.maximumCostCredits === undefined ? {} : { maximumCostCredits: value.maximumCostCredits as number }),
      ...(value.privacyClass === undefined ? {} : { privacyClass: value.privacyClass as string }),
      ...(value.required === undefined ? {} : { required: value.required as boolean }),
    }) as DataRequirement,
  };
}

function validBudget(value: Record<string, unknown>): ParseError | undefined {
  if (value.maxCostCredits !== undefined && (!Number.isFinite(value.maxCostCredits) || (value.maxCostCredits as number) < 0)) return "RESEARCH_BUDGET_INVALID";
  if (value.maxExternalCost !== undefined && (value.maxExternalCost === "unknown" || !Number.isFinite(value.maxExternalCost) || (value.maxExternalCost as number) < 0)) return "RESEARCH_BUDGET_INVALID";
  if (value.maxWallTimeSeconds !== undefined && (!Number.isInteger(value.maxWallTimeSeconds) || (value.maxWallTimeSeconds as number) < 1 || (value.maxWallTimeSeconds as number) > 86_400)) return "RESEARCH_BUDGET_INVALID";
  if (value.maxSources !== undefined && (!Number.isInteger(value.maxSources) || (value.maxSources as number) < 1 || (value.maxSources as number) > 100)) return "RESEARCH_BUDGET_INVALID";
  return undefined;
}

const REQUEST_FIELDS = new Set([
  "contractVersion", "researchRequestId", "idempotencyKey", "authorizationScope", "consumerKind", "consumerRef", "tenantId", "projectId", "requestedBy", "goal", "mode",
  "dataRequirements", "geographyRefs", "temporalRequirement", "preferredProviderIds", "prohibitedProviderIds", "maxCostCredits", "maxExternalCost", "maxWallTimeSeconds", "maxSources", "privacyClass", "rightsRequirements", "outputPolicyRef",
]);

/** Validates the stable request contract. Identity/scope authorization must still be derived by the server. */
export function parseResearchRequest(value: unknown): ParseResult<ResearchRequest> {
  if (!isRecord(value)) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (!hasOnlyFields(value, REQUEST_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  if (value.authorizationScope !== "PUBLIC" && value.authorizationScope !== "TENANT") return { ok: false, code: "RESEARCH_SCOPE_INVALID" };
  if ((value.authorizationScope === "TENANT" && (!isId(value.tenantId) || !PERSISTED_ID.test(value.tenantId as string))) ||
    (value.authorizationScope === "PUBLIC" && value.tenantId !== undefined) || !isId(value.requestedBy)) return { ok: false, code: "RESEARCH_SCOPE_INVALID" };
  const budgetError = validBudget(value);
  if (budgetError) return { ok: false, code: budgetError };
  const preferredProviders = value.preferredProviderIds as unknown;
  const prohibitedProviders = value.prohibitedProviderIds as unknown;
  if ((preferredProviders !== undefined && !stringList(preferredProviders, 32)) ||
    (prohibitedProviders !== undefined && !stringList(prohibitedProviders, 32))) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (Array.isArray(preferredProviders) && Array.isArray(prohibitedProviders) &&
    preferredProviders.some(provider => prohibitedProviders.includes(provider))) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (value.contractVersion !== "spec266-research-v1" || !isId(value.researchRequestId) || !PERSISTED_ID.test(value.researchRequestId as string) ||
    typeof value.idempotencyKey !== "string" || value.idempotencyKey.length < 8 || value.idempotencyKey.length > 200 ||
    !CONSUMERS.has(value.consumerKind as ResearchConsumerKind) || !isId(value.consumerRef) ||
    typeof value.requestedBy !== "string" || value.requestedBy.length > 160 ||
    (value.projectId !== undefined && (!isId(value.projectId) || !PERSISTED_ID.test(value.projectId as string))) || typeof value.goal !== "string" || value.goal.trim().length < 8 || value.goal.length > 4_000 ||
    !MODES.has(value.mode as ResearchMode) || typeof value.privacyClass !== "string" || !isId(value.privacyClass) || !isId(value.outputPolicyRef) ||
    (value.geographyRefs !== undefined && !stringList(value.geographyRefs, 256)) ||
    (value.preferredProviderIds !== undefined && !stringList(value.preferredProviderIds, 32)) ||
    (value.prohibitedProviderIds !== undefined && !stringList(value.prohibitedProviderIds, 32)) ||
    (value.rightsRequirements !== undefined && !stringList(value.rightsRequirements, 32)) ||
    (value.dataRequirements !== undefined && (!Array.isArray(value.dataRequirements) || value.dataRequirements.length > 64 || !isBoundedData(value.dataRequirements) || value.dataRequirements.some(item => !parseDataRequirement(item).ok))) ||
    (value.temporalRequirement !== undefined && (!isRecord(value.temporalRequirement) || !hasOnlyFields(value.temporalRequirement, new Set(["from", "to"])) ||
      (value.temporalRequirement.from !== undefined && !isInstant(value.temporalRequirement.from)) ||
      (value.temporalRequirement.to !== undefined && !isInstant(value.temporalRequirement.to)) ||
      (value.temporalRequirement.from !== undefined && value.temporalRequirement.to !== undefined && Date.parse(value.temporalRequirement.from as string) > Date.parse(value.temporalRequirement.to as string))))) {
    return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  }
  const normalizedRequirements = value.dataRequirements === undefined
    ? undefined
    : (value.dataRequirements as unknown[]).map(item => parseDataRequirement(item)).map(result => result.ok ? result.value : undefined);
  if (normalizedRequirements?.some(item => item === undefined)) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  return {
    ok: true,
    value: deepFreeze({
      contractVersion: value.contractVersion as ResearchRequest["contractVersion"],
      researchRequestId: value.researchRequestId as string,
      idempotencyKey: value.idempotencyKey as string,
      authorizationScope: value.authorizationScope as ResearchRequest["authorizationScope"],
      consumerKind: value.consumerKind as ResearchConsumerKind,
      consumerRef: value.consumerRef as string,
      ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId as string }),
      ...(value.projectId === undefined ? {} : { projectId: value.projectId as string }),
      requestedBy: value.requestedBy as string,
      goal: value.goal as string,
      mode: value.mode as ResearchMode,
      ...(normalizedRequirements === undefined ? {} : { dataRequirements: normalizedRequirements as DataRequirement[] }),
      ...(value.geographyRefs === undefined ? {} : { geographyRefs: [...value.geographyRefs as string[]] }),
      ...(value.temporalRequirement === undefined ? {} : { temporalRequirement: { ...(value.temporalRequirement.from === undefined ? {} : { from: value.temporalRequirement.from as string }), ...(value.temporalRequirement.to === undefined ? {} : { to: value.temporalRequirement.to as string }) } }),
      ...(value.preferredProviderIds === undefined ? {} : { preferredProviderIds: [...value.preferredProviderIds as string[]] }),
      ...(value.prohibitedProviderIds === undefined ? {} : { prohibitedProviderIds: [...value.prohibitedProviderIds as string[]] }),
      ...(value.maxCostCredits === undefined ? {} : { maxCostCredits: value.maxCostCredits as number }),
      ...(value.maxExternalCost === undefined ? {} : { maxExternalCost: value.maxExternalCost as number }),
      ...(value.maxWallTimeSeconds === undefined ? {} : { maxWallTimeSeconds: value.maxWallTimeSeconds as number }),
      ...(value.maxSources === undefined ? {} : { maxSources: value.maxSources as number }),
      privacyClass: value.privacyClass as string,
      ...(value.rightsRequirements === undefined ? {} : { rightsRequirements: [...value.rightsRequirements as string[]] }),
      outputPolicyRef: value.outputPolicyRef as string,
    }) as ResearchRequest,
  };
}

const RUN_FIELDS = new Set([
  "contractVersion", "researchRunId", "researchRequestId", "canonicalJobRef", "tenantId", "providerId", "modelOrAgentVersion", "startedAt", "completedAt", "status", "queryPlanRef", "toolReceiptRefs", "artifactRefs", "candidateRefs", "sourceUrlsOrIds", "costReceiptRef", "parentResearchRunIds",
]);

/** Validates immutable run metadata; raw artifacts stay behind separately authorized artifact references. */
export function parseResearchRun(value: unknown): ParseResult<ResearchRun> {
  if (!isRecord(value)) return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  if (!hasOnlyFields(value, RUN_FIELDS)) return { ok: false, code: "RESEARCH_UNKNOWN_FIELD" };
  const refsValid = ["toolReceiptRefs", "artifactRefs", "candidateRefs", "sourceUrlsOrIds"].every(key => stringList(value[key], 256));
  if (value.contractVersion !== "spec266-research-v1" || !isId(value.researchRunId) || !PERSISTED_ID.test(value.researchRunId as string) || !isId(value.researchRequestId) || !PERSISTED_ID.test(value.researchRequestId as string) ||
    !isId(value.providerId) || (value.tenantId !== undefined && (!isId(value.tenantId) || !PERSISTED_ID.test(value.tenantId as string))) ||
    (value.canonicalJobRef !== undefined && (!isId(value.canonicalJobRef) || !PERSISTED_ID.test(value.canonicalJobRef as string))) || !isInstant(value.startedAt) ||
    (value.completedAt !== undefined && (!isInstant(value.completedAt) || Date.parse(value.completedAt) < Date.parse(value.startedAt))) ||
    !RUN_STATUSES.has(value.status as ResearchRunStatus) || !refsValid ||
    (value.modelOrAgentVersion !== undefined && !isId(value.modelOrAgentVersion)) ||
    (value.queryPlanRef !== undefined && !isId(value.queryPlanRef)) || (value.costReceiptRef !== undefined && !isId(value.costReceiptRef)) ||
    (value.parentResearchRunIds !== undefined && !stringList(value.parentResearchRunIds, 64))) {
    return { ok: false, code: "RESEARCH_CONTRACT_INVALID" };
  }
  return {
    ok: true,
    value: deepFreeze({
      contractVersion: value.contractVersion as ResearchRun["contractVersion"],
      researchRunId: value.researchRunId as string,
      researchRequestId: value.researchRequestId as string,
      ...(value.canonicalJobRef === undefined ? {} : { canonicalJobRef: value.canonicalJobRef as string }),
      ...(value.tenantId === undefined ? {} : { tenantId: value.tenantId as string }),
      providerId: value.providerId as string,
      ...(value.modelOrAgentVersion === undefined ? {} : { modelOrAgentVersion: value.modelOrAgentVersion as string }),
      startedAt: value.startedAt as string,
      ...(value.completedAt === undefined ? {} : { completedAt: value.completedAt as string }),
      status: value.status as ResearchRunStatus,
      ...(value.queryPlanRef === undefined ? {} : { queryPlanRef: value.queryPlanRef as string }),
      toolReceiptRefs: [...value.toolReceiptRefs as string[]],
      artifactRefs: [...value.artifactRefs as string[]],
      candidateRefs: [...value.candidateRefs as string[]],
      sourceUrlsOrIds: [...value.sourceUrlsOrIds as string[]],
      ...(value.costReceiptRef === undefined ? {} : { costReceiptRef: value.costReceiptRef as string }),
      ...(value.parentResearchRunIds === undefined ? {} : { parentResearchRunIds: [...value.parentResearchRunIds as string[]] }),
    }) as ResearchRun,
  };
}
