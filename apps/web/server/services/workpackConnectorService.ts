import {
  type ConnectorMap,
  type ConnectorIntrospection,
  type ConnectorScopePosture,
  type ConnectorValidationStatus,
  type SideEffectClass,
  connectorMapSchema,
  connectorIntrospectionSchema,
} from "../../shared/workpackContracts";
import {
  createWorkpackId,
  getWorkpackDetail,
  listWorkpackDetailsByTenant,
  saveWorkpackVersion,
  updateWorkpackVersion,
} from "./workpackPersistence";
import { compileWorkpackExecutionPlan } from "./workpackCompilerService";
import { normalizeWorkpackException } from "./workpackExceptionService";

type ConnectorMetadata = {
  connectorKey: string;
  connectorFamily: string;
  availableFields: string[];
  fieldTypes: Record<string, string>;
  grantedScopes: string[];
  expiresAt?: string | null;
  schemaVersion?: string;
  supportsIdempotency?: boolean;
  status?: "healthy" | "stale" | "unavailable";
  source?: "manual" | "desktop_host" | "managed_runtime";
  collectedAt?: string;
  sourceDeviceId?: string | null;
};

export interface ConnectorValidationResult {
  connectorMaps: ConnectorMap[];
  blocked: boolean;
  stale: boolean;
  summary: {
    validatedCount: number;
    blockedCount: number;
    staleCount: number;
    scopePosture: ConnectorScopePosture[];
  };
}

const DEFAULT_REQUIRED_FIELDS = ["record_id", "status", "summary"];
const READ_SCOPE_SUFFIX = ":read";
const WRITE_SCOPE_SUFFIX = ":write";

const CONNECTOR_FIELD_TEMPLATES: Record<string, Pick<ConnectorMetadata, "availableFields" | "fieldTypes">> = {
  erp: {
    availableFields: ["record_id", "status", "summary", "amount", "currency", "approval_state"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      amount: "number",
      currency: "string",
      approval_state: "string",
    },
  },
  spreadsheet: {
    availableFields: ["record_id", "status", "summary", "tab_name", "row_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      tab_name: "string",
      row_id: "number",
    },
  },
  email: {
    availableFields: ["record_id", "status", "summary", "recipient", "subject"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      recipient: "string",
      subject: "string",
    },
  },
  vendor_portal: {
    availableFields: ["record_id", "status", "summary", "quote_total", "vendor_name"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      quote_total: "number",
      vendor_name: "string",
    },
  },
  crm: {
    availableFields: ["record_id", "status", "summary", "account_id", "opportunity_stage"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      account_id: "string",
      opportunity_stage: "string",
    },
  },
  helpdesk: {
    availableFields: ["record_id", "status", "summary", "ticket_id", "priority"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      ticket_id: "string",
      priority: "string",
    },
  },
  knowledge_base: {
    availableFields: ["record_id", "status", "summary", "article_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      article_id: "string",
    },
  },
  chat: {
    availableFields: ["record_id", "status", "summary", "thread_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      thread_id: "string",
    },
  },
  calendar: {
    availableFields: ["record_id", "status", "summary", "event_id", "start_at"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      event_id: "string",
      start_at: "date",
    },
  },
  docs: {
    availableFields: ["record_id", "status", "summary", "doc_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      doc_id: "string",
    },
  },
  hris: {
    availableFields: ["record_id", "status", "summary", "employee_id", "policy_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      employee_id: "string",
      policy_id: "string",
    },
  },
};

function nowIso(): string {
  return new Date().toISOString();
}

function highestSideEffectClass(classes: SideEffectClass[]): SideEffectClass {
  if (classes.includes("financial")) return "financial";
  if (classes.includes("irreversible")) return "irreversible";
  if (classes.includes("privileged")) return "privileged";
  if (classes.includes("external_write")) return "external_write";
  if (classes.includes("bounded_write")) return "bounded_write";
  return "read_only";
}

function requiredScopesForFamily(family: string, sideEffectClass: SideEffectClass): string[] {
  const baseRead = `${family}${READ_SCOPE_SUFFIX}`;
  const baseWrite = `${family}${WRITE_SCOPE_SUFFIX}`;
  if (sideEffectClass === "read_only") return [baseRead];
  if (sideEffectClass === "financial") return [baseRead, baseWrite, `${family}:approve`];
  return [baseRead, baseWrite];
}

function deriveWriteMode(sideEffectClass: SideEffectClass): ConnectorMap["writeMode"] {
  if (sideEffectClass === "read_only") return "safe_retry";
  if (sideEffectClass === "financial" || sideEffectClass === "irreversible" || sideEffectClass === "privileged") {
    return "blocked";
  }
  return "safe_retry";
}

function buildDraftMap(input: {
  workpackId: string;
  versionId: string;
  connectorFamily: string;
  sideEffectClass: SideEffectClass;
}): ConnectorMap {
  const fieldTemplate = CONNECTOR_FIELD_TEMPLATES[input.connectorFamily];
  const effectiveSideEffectClass = input.sideEffectClass;
  const defaultFields = fieldTemplate?.availableFields ?? DEFAULT_REQUIRED_FIELDS;
  return connectorMapSchema.parse({
    id: createWorkpackId("conn"),
    workpackId: input.workpackId,
    versionId: input.versionId,
    connectorKey: `${input.connectorFamily}_primary`,
    connectorFamily: input.connectorFamily,
    requiredScopes: requiredScopesForFamily(input.connectorFamily, effectiveSideEffectClass),
    optionalScopes: [],
    grantedScopes: [],
    fieldMappings: defaultFields.slice(0, Math.max(DEFAULT_REQUIRED_FIELDS.length, 3)).map((field) => ({
      sourceField: field,
      targetField: field,
      required: true,
      sideEffectClass: effectiveSideEffectClass,
    })),
    validationStatus: "draft",
    scopePosture: "missing",
    idempotencySupported: effectiveSideEffectClass === "read_only",
    writeMode: deriveWriteMode(effectiveSideEffectClass),
    missingFields: defaultFields,
    driftedFields: [],
    samplePayload: {},
    lastValidatedAt: null,
    expiresAt: null,
  });
}

async function ensureConnectorMaps(workpackId: string): Promise<ConnectorMap[]> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  if (!detail.version.executionPlan) {
    await compileWorkpackExecutionPlan({ workpackId });
  }
  const refreshed = await getWorkpackDetail(workpackId);
  if (!refreshed) {
    throw new Error(`Unknown workpack after compile: ${workpackId}`);
  }
  if (refreshed.version.connectorMaps.length > 0) {
    return refreshed.version.connectorMaps;
  }

  const families = new Map<string, SideEffectClass[]>();
  for (const step of refreshed.version.executionPlan?.steps ?? refreshed.playbook.steps) {
    for (const family of step.requiredConnectorFamilies) {
      const existing = families.get(family) ?? [];
      existing.push(step.sideEffectClass);
      families.set(family, existing);
    }
  }

  const connectorMaps = Array.from(families.entries()).map(([family, classes]) => buildDraftMap({
    workpackId: refreshed.workpack.id,
    versionId: refreshed.version.id,
    connectorFamily: family,
    sideEffectClass: highestSideEffectClass(classes),
  }));

  await saveWorkpackVersion({
    ...refreshed.version,
    connectorMaps,
  });

  return connectorMaps;
}

async function selectLatestTenantIntrospections(workpackId: string): Promise<Record<string, ConnectorIntrospection>> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  const latestByFamily = new Map<string, ConnectorIntrospection>();
  const allDetails = await listWorkpackDetailsByTenant(detail.workpack.tenantId);
  for (const candidate of allDetails) {
    for (const introspection of candidate.version.connectorIntrospections ?? []) {
      const existing = latestByFamily.get(introspection.connectorFamily);
      if (!existing || introspection.collectedAt > existing.collectedAt) {
        latestByFamily.set(introspection.connectorFamily, introspection);
      }
    }
  }
  return Object.fromEntries(latestByFamily.entries());
}

function metadataToIntrospection(tenantId: string, connectorFamily: string, metadata: Partial<ConnectorMetadata>): ConnectorIntrospection {
  return connectorIntrospectionSchema.parse({
    id: createWorkpackId("cin"),
    tenantId,
    connectorKey: metadata.connectorKey ?? `${connectorFamily}_primary`,
    connectorFamily,
    availableFields: metadata.availableFields ?? [],
    fieldTypes: metadata.fieldTypes ?? {},
    grantedScopes: metadata.grantedScopes ?? [],
    expiresAt: metadata.expiresAt ?? null,
    schemaVersion: metadata.schemaVersion ?? null,
    supportsIdempotency: metadata.supportsIdempotency ?? false,
    status: metadata.status ?? "unavailable",
    source: metadata.source ?? "manual",
    collectedAt: metadata.collectedAt ?? nowIso(),
    sourceDeviceId: metadata.sourceDeviceId ?? null,
  });
}

export async function refreshConnectorIntrospections(input: {
  workpackId: string;
  metadataByFamily: Record<string, Partial<ConnectorMetadata>>;
}): Promise<ConnectorIntrospection[]> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  const refreshed = Object.entries(input.metadataByFamily).map(([connectorFamily, metadata]) => (
    metadataToIntrospection(detail.workpack.tenantId, connectorFamily, metadata)
  ));
  const mergedByFamily = new Map<string, ConnectorIntrospection>();
  for (const introspection of detail.version.connectorIntrospections ?? []) {
    mergedByFamily.set(introspection.connectorFamily, introspection);
  }
  for (const introspection of refreshed) {
    mergedByFamily.set(introspection.connectorFamily, introspection);
  }
  await updateWorkpackVersion(detail.version.id, (version) => ({
    ...version,
    connectorIntrospections: Array.from(mergedByFamily.values()).sort((left, right) => right.collectedAt.localeCompare(left.collectedAt)),
  }));
  return refreshed;
}

export async function updateConnectorMapFields(input: {
  workpackId: string;
  connectorMapId: string;
  fieldMappings?: ConnectorMap["fieldMappings"];
  samplePayload?: Record<string, unknown>;
}): Promise<ConnectorMap> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }
  let updatedMap: ConnectorMap | null = null;
  await updateWorkpackVersion(detail.version.id, (version) => ({
    ...version,
    connectorMaps: version.connectorMaps.map((connectorMap) => {
      if (connectorMap.id !== input.connectorMapId) {
        return connectorMap;
      }
      updatedMap = connectorMapSchema.parse({
        ...connectorMap,
        fieldMappings: input.fieldMappings ?? connectorMap.fieldMappings,
        samplePayload: input.samplePayload ?? connectorMap.samplePayload,
      });
      return updatedMap;
    }),
  }));
  if (!updatedMap) {
    throw new Error(`Unknown connector map: ${input.connectorMapId}`);
  }
  return updatedMap;
}

function validateAgainstMetadata(
  connectorMap: ConnectorMap,
  metadata: ConnectorMetadata | undefined,
): ConnectorMap {
  const lastValidatedAt = nowIso();
  if (!metadata || metadata.status === "unavailable") {
    return {
      ...connectorMap,
      validationStatus: "blocked",
      scopePosture: "missing",
      missingFields: connectorMap.fieldMappings.map((mapping) => mapping.targetField),
      driftedFields: [],
      lastValidatedAt,
      expiresAt: null,
      grantedScopes: [],
    };
  }

  const missingFields = connectorMap.fieldMappings
    .filter((mapping) => mapping.required && !metadata.availableFields.includes(mapping.targetField))
    .map((mapping) => mapping.targetField);

  const driftedFields = connectorMap.fieldMappings
    .filter((mapping) => mapping.required && metadata.availableFields.includes(mapping.targetField) && !metadata.fieldTypes[mapping.targetField])
    .map((mapping) => mapping.targetField);

  const missingScopes = connectorMap.requiredScopes.filter((scope) => !metadata.grantedScopes.includes(scope));
  const overBroadScopes = metadata.grantedScopes.some((scope) => scope.startsWith(`${connectorMap.connectorFamily}:`))
    && connectorMap.requiredScopes.every((scope) => !scope.endsWith(":approve"))
    && metadata.grantedScopes.some((scope) => scope.endsWith(":approve"));

  let scopePosture: ConnectorScopePosture = "sufficient";
  if (missingScopes.length > 0) {
    scopePosture = "missing";
  } else if (overBroadScopes) {
    scopePosture = "over_broad";
  } else if (metadata.grantedScopes.length === connectorMap.requiredScopes.length) {
    scopePosture = "narrow";
  }

  let validationStatus: ConnectorValidationStatus = "validated";
  if (metadata.status === "stale" || missingFields.length > 0 || driftedFields.length > 0) {
    validationStatus = metadata.status === "stale" ? "stale" : "blocked";
  }
  if (missingScopes.length > 0) {
    validationStatus = "blocked";
  }
  return {
    ...connectorMap,
    connectorKey: metadata.connectorKey,
    grantedScopes: metadata.grantedScopes,
    scopePosture,
    validationStatus,
    idempotencySupported: metadata.supportsIdempotency ?? false,
    writeMode: connectorMap.writeMode === "safe_retry" && metadata.supportsIdempotency === false
      ? "blocked"
      : connectorMap.writeMode,
    missingFields,
    driftedFields,
    lastValidatedAt,
    expiresAt: metadata.expiresAt ?? null,
  };
}

async function maybeEmitValidationExceptions(workpackId: string, connectorMaps: ConnectorMap[], runId?: string | null): Promise<void> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) return;
  for (const connectorMap of connectorMaps) {
    if (connectorMap.validationStatus === "validated") continue;

    let reasonCategory: Parameters<typeof normalizeWorkpackException>[0]["reasonCategory"] = "connector_auth";
    let reasonCode = "connector_mapping_blocked";
    let title = `Connector ${connectorMap.connectorFamily} is blocked`;
    let summary = `Connector ${connectorMap.connectorFamily} failed validation`;

    if (connectorMap.missingFields.length > 0 || connectorMap.driftedFields.length > 0) {
      reasonCategory = "schema_mismatch";
      reasonCode = connectorMap.missingFields.length > 0 ? "connector_missing_fields" : "connector_schema_drift";
      summary = connectorMap.missingFields.length > 0
        ? `Missing mapped fields: ${connectorMap.missingFields.join(", ")}`
        : `Schema drift detected: ${connectorMap.driftedFields.join(", ")}`;
    } else if (connectorMap.scopePosture === "missing") {
      reasonCategory = "connector_auth";
      reasonCode = "connector_scope_missing";
      summary = `Connector ${connectorMap.connectorFamily} is missing one or more required scopes`;
    } else if (connectorMap.scopePosture === "over_broad") {
      reasonCategory = "policy_boundary";
      reasonCode = "connector_scope_over_broad";
      summary = `Connector ${connectorMap.connectorFamily} has broader permissions than declared`;
    } else if (!connectorMap.idempotencySupported && connectorMap.writeMode === "safe_retry") {
      reasonCategory = "policy_boundary";
      reasonCode = "connector_idempotency_unsupported";
      summary = `Connector ${connectorMap.connectorFamily} cannot preserve the declared retry envelope`;
    } else if (connectorMap.validationStatus === "stale") {
      reasonCategory = "drift";
      reasonCode = "connector_mapping_stale";
      summary = `Connector ${connectorMap.connectorFamily} metadata is stale`;
    }

    await normalizeWorkpackException({
      workpackId,
      versionId: detail.version.id,
      runId,
      reasonCategory,
      riskClass: reasonCategory === "policy_boundary" ? "critical" : reasonCategory === "schema_mismatch" ? "high" : "medium",
      reasonCode,
      title,
      summary,
      remediationPointer: `/workpacks/${workpackId}/connectors`,
      nextAction: "Review connector mapping, scopes, and schema posture in Connector Studio.",
    });
  }
}

export async function validateConnectorMaps(input: {
  workpackId: string;
  metadataByFamily?: Record<string, Partial<ConnectorMetadata>>;
  runId?: string | null;
  emitExceptions?: boolean;
}): Promise<ConnectorValidationResult> {
  const detail = await getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const connectorMaps = await ensureConnectorMaps(input.workpackId);
  const overrideIntrospections = input.metadataByFamily
    ? await refreshConnectorIntrospections({
        workpackId: input.workpackId,
        metadataByFamily: input.metadataByFamily,
      })
    : [];
  const liveTenantIntrospections = {
    ...await selectLatestTenantIntrospections(input.workpackId),
    ...Object.fromEntries(overrideIntrospections.map((introspection) => [introspection.connectorFamily, introspection] as const)),
  };
  const validatedMaps = connectorMaps.map((connectorMap) => {
    const introspection = liveTenantIntrospections[connectorMap.connectorFamily];
    const metadata = introspection
      ? {
          connectorKey: introspection.connectorKey,
          connectorFamily: introspection.connectorFamily,
          availableFields: introspection.availableFields,
          fieldTypes: introspection.fieldTypes,
          grantedScopes: introspection.grantedScopes,
          expiresAt: introspection.expiresAt ?? null,
          schemaVersion: introspection.schemaVersion ?? undefined,
          supportsIdempotency: introspection.supportsIdempotency,
          status: introspection.status,
          source: introspection.source,
          collectedAt: introspection.collectedAt,
          sourceDeviceId: introspection.sourceDeviceId ?? null,
        }
      : undefined;
    return validateAgainstMetadata(connectorMap, metadata);
  });

  await updateWorkpackVersion(detail.version.id, (version) => ({
    ...version,
    connectorMaps: validatedMaps.map((connectorMap) => ({
      ...connectorMap,
      introspectionId: liveTenantIntrospections[connectorMap.connectorFamily]?.id ?? connectorMap.introspectionId ?? null,
    })),
  }));

  if (input.emitExceptions !== false) {
    await maybeEmitValidationExceptions(input.workpackId, validatedMaps, input.runId);
  }

  return {
    connectorMaps: validatedMaps,
    blocked: validatedMaps.some((map) => map.validationStatus === "blocked"),
    stale: validatedMaps.some((map) => map.validationStatus === "stale"),
    summary: {
      validatedCount: validatedMaps.filter((map) => map.validationStatus === "validated").length,
      blockedCount: validatedMaps.filter((map) => map.validationStatus === "blocked").length,
      staleCount: validatedMaps.filter((map) => map.validationStatus === "stale").length,
      scopePosture: Array.from(new Set(validatedMaps.map((map) => map.scopePosture))),
    },
  };
}

export async function getConnectorStudioView(workpackId: string): Promise<ConnectorValidationResult & {
  workpackTitle: string;
  versionId: string;
  introspections: ConnectorIntrospection[];
}> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  const validation = await validateConnectorMaps({ workpackId, emitExceptions: false });
  return {
    ...validation,
    workpackTitle: detail.workpack.title,
    versionId: detail.version.id,
    introspections: detail.version.connectorIntrospections ?? [],
  };
}
