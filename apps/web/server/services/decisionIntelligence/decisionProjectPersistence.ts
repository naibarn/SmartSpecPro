import { and, asc, desc, eq } from "drizzle-orm";
import { decisionAnalysisRuns, decisionProjects } from "../../../drizzle/schema";
import { getDb } from "../../db";

export type DecisionProjectStatus = "draft" | "collecting_evidence" | "analyzing" | "waiting_user" | "monitoring" | "closed";
export type DecisionAnalysisRunStatus = "queued" | "running" | "completed" | "partial" | "failed" | "cancelled";

export interface DecisionProjectAuthority {
  /** Trusted server-side identity, resolved from authentication rather than request JSON. */
  readonly tenantId: string;
  readonly ownerPrincipalId: string;
}

export interface DecisionProjectPayload {
  readonly version: string;
  readonly domainRefs: readonly string[];
  readonly geographyRefs?: readonly string[];
  readonly geometryRefs?: readonly string[];
  readonly goal: string;
}

export interface DecisionAnalysisSnapshot {
  readonly version: string;
  readonly decisionTemplateVersion: string;
  readonly decisionInputRef: string;
  readonly dataRequirementRefs: readonly string[];
  readonly evidenceBindingRefs: readonly string[];
  readonly sourceEvidenceReceiptRefs: readonly string[];
  readonly queryRefs: readonly string[];
  readonly geometryRefs: readonly string[];
  readonly transformationRefs: readonly string[];
  readonly calculationVersion: string;
  readonly modelProviderVersions: readonly string[];
  readonly assumptionRefs: readonly string[];
  readonly unresolvedConflictRefs: readonly string[];
  readonly missingEvidenceRefs: readonly string[];
  readonly outputArtifactRefs: readonly string[];
  readonly costAttributionRef: string;
  readonly policyContextRef: string;
  readonly analysisAsOf: string;
}

export interface DecisionProjectRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly ownerPrincipalId: string;
  readonly title: string;
  readonly status: DecisionProjectStatus;
  readonly projectJson: DecisionProjectPayload;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DecisionAnalysisRunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly runNumber: number;
  readonly status: DecisionAnalysisRunStatus;
  readonly researchRequestId: string | null;
  readonly snapshotJson: DecisionAnalysisSnapshot;
  readonly createdAt: Date;
}

export interface DecisionProjectPersistenceQuery {
  insertProject(input: {
    readonly tenantId: string;
    readonly ownerPrincipalId: string;
    readonly title: string;
    readonly status: DecisionProjectStatus;
    readonly projectJson: DecisionProjectPayload;
  }): Promise<DecisionProjectRecord | undefined>;
  listProjects(scope: DecisionProjectAuthority): Promise<readonly DecisionProjectRecord[]>;
  findProject(scope: DecisionProjectAuthority & { readonly projectId: string }): Promise<DecisionProjectRecord | undefined>;
  updateProjectStatus(input: DecisionProjectAuthority & { readonly projectId: string; readonly status: DecisionProjectStatus }): Promise<DecisionProjectRecord | undefined>;
  listAnalysisRuns(scope: { readonly tenantId: string; readonly projectId: string }): Promise<readonly DecisionAnalysisRunRecord[]>;
  appendAnalysisRunAtomically(input: {
    readonly analysisRunId: string;
    readonly tenantId: string;
    readonly projectId: string;
    readonly ownerPrincipalId: string;
    readonly status: DecisionAnalysisRunStatus;
    readonly researchRequestId?: string;
    readonly snapshotJson: DecisionAnalysisSnapshot;
  }): Promise<{ readonly created: boolean; readonly run: DecisionAnalysisRunRecord } | undefined>;
}

export interface DecisionProjectPersistenceDependencies {
  /** Test seam only. Production resolves the private Drizzle query adapter. */
  readonly query?: DecisionProjectPersistenceQuery;
}

const PROJECT_STATUSES = new Set<DecisionProjectStatus>(["draft", "collecting_evidence", "analyzing", "waiting_user", "monitoring", "closed"]);
const ANALYSIS_RUN_STATUSES = new Set<DecisionAnalysisRunStatus>(["queued", "running", "completed", "partial", "failed", "cancelled"]);
const PERSISTED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,35}$/;
const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_PROJECT_JSON_BYTES = 65_536;
const MAX_ANALYSIS_SNAPSHOT_BYTES = 262_144;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function fail(code: string): never {
  throw new Error(code);
}

function asProjectRecord(value: unknown): DecisionProjectRecord {
  return value as DecisionProjectRecord;
}

function asRunRecord(value: unknown): DecisionAnalysisRunRecord {
  return value as DecisionAnalysisRunRecord;
}

function defaultQuery(): DecisionProjectPersistenceQuery {
  const database: any = getDb();
  return {
    async insertProject(input) {
      const rows = await database.insert(decisionProjects).values(input).returning();
      return rows[0] && asProjectRecord(rows[0]);
    },
    async listProjects(scope) {
      const rows = await database.select().from(decisionProjects)
        .where(and(eq(decisionProjects.tenantId, scope.tenantId), eq(decisionProjects.ownerPrincipalId, scope.ownerPrincipalId)))
        .orderBy(desc(decisionProjects.updatedAt), asc(decisionProjects.id));
      return rows.map(asProjectRecord);
    },
    async findProject(scope) {
      const rows = await database.select().from(decisionProjects)
        .where(and(eq(decisionProjects.id, scope.projectId), eq(decisionProjects.tenantId, scope.tenantId), eq(decisionProjects.ownerPrincipalId, scope.ownerPrincipalId)))
        .limit(1);
      return rows[0] && asProjectRecord(rows[0]);
    },
    async updateProjectStatus(input) {
      const rows = await database.update(decisionProjects).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(decisionProjects.id, input.projectId), eq(decisionProjects.tenantId, input.tenantId), eq(decisionProjects.ownerPrincipalId, input.ownerPrincipalId)))
        .returning();
      return rows[0] && asProjectRecord(rows[0]);
    },
    async listAnalysisRuns(scope) {
      const rows = await database.select().from(decisionAnalysisRuns)
        .where(and(eq(decisionAnalysisRuns.tenantId, scope.tenantId), eq(decisionAnalysisRuns.projectId, scope.projectId)))
        .orderBy(asc(decisionAnalysisRuns.runNumber));
      return rows.map(asRunRecord);
    },
    async appendAnalysisRunAtomically(input) {
      return database.transaction(async (tx: any) => {
        const projects = await tx.select({ id: decisionProjects.id }).from(decisionProjects)
          .where(and(
            eq(decisionProjects.id, input.projectId),
            eq(decisionProjects.tenantId, input.tenantId),
            eq(decisionProjects.ownerPrincipalId, input.ownerPrincipalId),
          ))
          .for("update")
          .limit(1);
        if (!projects[0]) return undefined;

        const existingRows = await tx.select().from(decisionAnalysisRuns)
          .where(eq(decisionAnalysisRuns.id, input.analysisRunId))
          .limit(1);
        const existing = existingRows[0] && asRunRecord(existingRows[0]);
        if (existing) {
          const matches = existing.tenantId === input.tenantId && existing.projectId === input.projectId && existing.status === input.status &&
            existing.researchRequestId === (input.researchRequestId ?? null) &&
            canonicalJson(existing.snapshotJson) === canonicalJson(input.snapshotJson);
          if (!matches) throw new Error("DECISION_ANALYSIS_RUN_REPLAY_CONFLICT");
          return { created: false, run: existing };
        }

        const previous = await tx.select({ runNumber: decisionAnalysisRuns.runNumber }).from(decisionAnalysisRuns)
          .where(and(eq(decisionAnalysisRuns.tenantId, input.tenantId), eq(decisionAnalysisRuns.projectId, input.projectId)));
        const runNumber = previous.reduce((highest: number, run: { runNumber: number }) => Math.max(highest, run.runNumber), 0) + 1;
        const rows = await tx.insert(decisionAnalysisRuns).values({
          id: input.analysisRunId,
          tenantId: input.tenantId,
          projectId: input.projectId,
          runNumber,
          status: input.status,
          researchRequestId: input.researchRequestId,
          snapshotJson: input.snapshotJson,
        }).returning();
        return rows[0] ? { created: true, run: asRunRecord(rows[0]) } : undefined;
      });
    },
  };
}

function byteLength(value: unknown, tooLargeCode: string, invalidCode: string): number {
  try {
    const encoded = JSON.stringify(value);
    if (typeof encoded !== "string") return fail(invalidCode);
    const size = Buffer.byteLength(encoded, "utf8");
    return size;
  } catch {
    return fail(invalidCode);
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
}

function isRef(value: unknown): value is string {
  return typeof value === "string" && REF.test(value);
}

function references(value: unknown, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value) && value.length <= 128 && (allowEmpty || value.length > 0) && value.every(isRef) && new Set(value).size === value.length;
}

function validateAuthority(authority: DecisionProjectAuthority): void {
  if (!PERSISTED_ID.test(authority.tenantId) || !PRINCIPAL_ID.test(authority.ownerPrincipalId)) fail("DECISION_PROJECT_AUTHORITY_INVALID");
}

function validateProjectPayload(value: unknown): asserts value is DecisionProjectPayload {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail("DECISION_PROJECT_PAYLOAD_INVALID");
  const payload = value as Record<string, unknown>;
  const allowed = ["version", "domainRefs", "geographyRefs", "geometryRefs", "goal"];
  if (!Object.keys(payload).every(key => allowed.includes(key)) || payload.version !== "decision-project-v1" || !references(payload.domainRefs, false) ||
    (payload.geographyRefs !== undefined && !references(payload.geographyRefs)) ||
    (payload.geometryRefs !== undefined && !references(payload.geometryRefs)) ||
    typeof payload.goal !== "string" || !payload.goal.trim() || payload.goal.length > 4_000) {
    fail("DECISION_PROJECT_PAYLOAD_INVALID");
  }
}

function validateProjectInput(input: { readonly authority: DecisionProjectAuthority; readonly title: string; readonly status?: DecisionProjectStatus; readonly projectJson: DecisionProjectPayload }): DecisionProjectStatus {
  validateAuthority(input.authority);
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 200) fail("DECISION_PROJECT_TITLE_INVALID");
  const bytes = byteLength(input.projectJson, "DECISION_PROJECT_PAYLOAD_TOO_LARGE", "DECISION_PROJECT_PAYLOAD_INVALID");
  if (bytes > MAX_PROJECT_JSON_BYTES) fail("DECISION_PROJECT_PAYLOAD_TOO_LARGE");
  validateProjectPayload(input.projectJson);
  const status = input.status ?? "draft";
  if (!PROJECT_STATUSES.has(status)) fail("DECISION_PROJECT_STATUS_INVALID");
  return status;
}

function validateSnapshot(value: unknown): asserts value is DecisionAnalysisSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail("DECISION_ANALYSIS_SNAPSHOT_INVALID");
  const snapshot = value as Record<string, unknown>;
  const required = [
    "version", "decisionTemplateVersion", "decisionInputRef", "dataRequirementRefs", "evidenceBindingRefs", "sourceEvidenceReceiptRefs",
    "queryRefs", "geometryRefs", "transformationRefs", "calculationVersion", "modelProviderVersions", "assumptionRefs",
    "unresolvedConflictRefs", "missingEvidenceRefs", "outputArtifactRefs", "costAttributionRef", "policyContextRef", "analysisAsOf",
  ];
  if (!exactKeys(snapshot, required) || !isRef(snapshot.version) || !isRef(snapshot.decisionTemplateVersion) || !isRef(snapshot.decisionInputRef) ||
    !references(snapshot.dataRequirementRefs) || !references(snapshot.evidenceBindingRefs) || !references(snapshot.sourceEvidenceReceiptRefs) ||
    !references(snapshot.queryRefs) || !references(snapshot.geometryRefs) || !references(snapshot.transformationRefs) || !isRef(snapshot.calculationVersion) ||
    !references(snapshot.modelProviderVersions) || !references(snapshot.assumptionRefs) || !references(snapshot.unresolvedConflictRefs) ||
    !references(snapshot.missingEvidenceRefs) || !references(snapshot.outputArtifactRefs) || !isRef(snapshot.costAttributionRef) ||
    !isRef(snapshot.policyContextRef) || typeof snapshot.analysisAsOf !== "string" || !ISO_INSTANT.test(snapshot.analysisAsOf) ||
    Number.isNaN(Date.parse(snapshot.analysisAsOf)) || new Date(snapshot.analysisAsOf).toISOString() !== snapshot.analysisAsOf) {
    fail("DECISION_ANALYSIS_SNAPSHOT_INVALID");
  }
}

function validateRunInput(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string; readonly analysisRunId: string; readonly status: DecisionAnalysisRunStatus; readonly researchRequestId?: string; readonly snapshotJson: DecisionAnalysisSnapshot }): void {
  validateAuthority(input.authority);
  if (!PERSISTED_ID.test(input.projectId)) fail("DECISION_PROJECT_ID_INVALID");
  if (!PERSISTED_ID.test(input.analysisRunId)) fail("DECISION_ANALYSIS_RUN_ID_INVALID");
  if (!ANALYSIS_RUN_STATUSES.has(input.status)) fail("DECISION_ANALYSIS_RUN_STATUS_INVALID");
  if (input.researchRequestId !== undefined && !PERSISTED_ID.test(input.researchRequestId)) fail("DECISION_ANALYSIS_RESEARCH_REQUEST_INVALID");
  const bytes = byteLength(input.snapshotJson, "DECISION_ANALYSIS_SNAPSHOT_TOO_LARGE", "DECISION_ANALYSIS_SNAPSHOT_INVALID");
  if (bytes > MAX_ANALYSIS_SNAPSHOT_BYTES) fail("DECISION_ANALYSIS_SNAPSHOT_TOO_LARGE");
  validateSnapshot(input.snapshotJson);
}

/**
 * Tenant/owner-scoped repository. The default query is a Drizzle adapter; an
 * injected query exists only to make repository behavior deterministic in tests.
 */
export function createDecisionProjectPersistence(dependencies: DecisionProjectPersistenceDependencies = {}) {
  const query = dependencies.query ?? defaultQuery();
  return {
    async createProject(input: { readonly authority: DecisionProjectAuthority; readonly title: string; readonly status?: DecisionProjectStatus; readonly projectJson: DecisionProjectPayload }): Promise<DecisionProjectRecord> {
      const status = validateProjectInput(input);
      const created = await query.insertProject({ tenantId: input.authority.tenantId, ownerPrincipalId: input.authority.ownerPrincipalId, title: input.title.trim(), status, projectJson: input.projectJson });
      if (!created) fail("DECISION_PROJECT_CREATE_FAILED");
      return created;
    },
    async listProjects(input: { readonly authority: DecisionProjectAuthority }): Promise<readonly DecisionProjectRecord[]> {
      validateAuthority(input.authority);
      return query.listProjects(input.authority);
    },
    async getProject(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string }): Promise<DecisionProjectRecord | undefined> {
      validateAuthority(input.authority);
      if (!PERSISTED_ID.test(input.projectId)) fail("DECISION_PROJECT_ID_INVALID");
      return query.findProject({ ...input.authority, projectId: input.projectId });
    },
    async updateProjectStatus(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string; readonly status: DecisionProjectStatus }): Promise<DecisionProjectRecord | undefined> {
      validateAuthority(input.authority);
      if (!PERSISTED_ID.test(input.projectId)) fail("DECISION_PROJECT_ID_INVALID");
      if (!PROJECT_STATUSES.has(input.status)) fail("DECISION_PROJECT_STATUS_INVALID");
      return query.updateProjectStatus({ ...input.authority, projectId: input.projectId, status: input.status });
    },
    async appendAnalysisRun(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string; readonly analysisRunId: string; readonly status: DecisionAnalysisRunStatus; readonly researchRequestId?: string; readonly snapshotJson: DecisionAnalysisSnapshot }): Promise<{ readonly created: boolean; readonly run: DecisionAnalysisRunRecord }> {
      validateRunInput(input);
      const result = await query.appendAnalysisRunAtomically({
        analysisRunId: input.analysisRunId,
        tenantId: input.authority.tenantId,
        ownerPrincipalId: input.authority.ownerPrincipalId,
        projectId: input.projectId,
        status: input.status,
        researchRequestId: input.researchRequestId,
        snapshotJson: input.snapshotJson,
      });
      if (!result) fail("DECISION_PROJECT_NOT_FOUND");
      return result;
    },
    async listAnalysisRuns(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string }): Promise<readonly DecisionAnalysisRunRecord[]> {
      validateAuthority(input.authority);
      if (!PERSISTED_ID.test(input.projectId)) fail("DECISION_PROJECT_ID_INVALID");
      const project = await query.findProject({ ...input.authority, projectId: input.projectId });
      if (!project) return [];
      return query.listAnalysisRuns({ tenantId: input.authority.tenantId, projectId: project.id });
    },
  };
}

export async function createDecisionProject(input: { readonly authority: DecisionProjectAuthority; readonly title: string; readonly status?: DecisionProjectStatus; readonly projectJson: DecisionProjectPayload }): Promise<DecisionProjectRecord> {
  return createDecisionProjectPersistence().createProject(input);
}

export async function listDecisionProjects(input: { readonly authority: DecisionProjectAuthority }): Promise<readonly DecisionProjectRecord[]> {
  return createDecisionProjectPersistence().listProjects(input);
}

export async function getDecisionProject(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string }): Promise<DecisionProjectRecord | undefined> {
  return createDecisionProjectPersistence().getProject(input);
}

export async function updateDecisionProjectStatus(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string; readonly status: DecisionProjectStatus }): Promise<DecisionProjectRecord | undefined> {
  return createDecisionProjectPersistence().updateProjectStatus(input);
}

export async function appendDecisionAnalysisRun(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string; readonly analysisRunId: string; readonly status: DecisionAnalysisRunStatus; readonly researchRequestId?: string; readonly snapshotJson: DecisionAnalysisSnapshot }): Promise<{ readonly created: boolean; readonly run: DecisionAnalysisRunRecord }> {
  return createDecisionProjectPersistence().appendAnalysisRun(input);
}

export async function listDecisionAnalysisRuns(input: { readonly authority: DecisionProjectAuthority; readonly projectId: string }): Promise<readonly DecisionAnalysisRunRecord[]> {
  return createDecisionProjectPersistence().listAnalysisRuns(input);
}
