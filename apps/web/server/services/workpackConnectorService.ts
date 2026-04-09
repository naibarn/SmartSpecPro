import {
  type ConnectorMap,
  type ConnectorScopePosture,
  type ConnectorValidationStatus,
  type SideEffectClass,
  connectorMapSchema,
} from "../../shared/workpackContracts";
import { createWorkpackId, getWorkpackDetail, saveWorkpackVersion, updateWorkpackVersion } from "./workpackPersistence";
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

const DEFAULT_CONNECTOR_METADATA: Record<string, ConnectorMetadata> = {
  erp: {
    connectorKey: "erp_primary",
    connectorFamily: "erp",
    availableFields: ["record_id", "status", "summary", "amount", "currency", "approval_state"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      amount: "number",
      currency: "string",
      approval_state: "string",
    },
    grantedScopes: ["erp:read", "erp:write", "erp:approve"],
    supportsIdempotency: true,
    status: "healthy",
  },
  spreadsheet: {
    connectorKey: "spreadsheet_primary",
    connectorFamily: "spreadsheet",
    availableFields: ["record_id", "status", "summary", "tab_name", "row_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      tab_name: "string",
      row_id: "number",
    },
    grantedScopes: ["spreadsheet:read", "spreadsheet:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  email: {
    connectorKey: "email_primary",
    connectorFamily: "email",
    availableFields: ["record_id", "status", "summary", "recipient", "subject"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      recipient: "string",
      subject: "string",
    },
    grantedScopes: ["email:read", "email:write", "email:send"],
    supportsIdempotency: false,
    status: "healthy",
  },
  vendor_portal: {
    connectorKey: "vendor_portal_primary",
    connectorFamily: "vendor_portal",
    availableFields: ["record_id", "status", "summary", "quote_total", "vendor_name"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      quote_total: "number",
      vendor_name: "string",
    },
    grantedScopes: ["vendor_portal:read", "vendor_portal:write"],
    supportsIdempotency: false,
    status: "healthy",
  },
  crm: {
    connectorKey: "crm_primary",
    connectorFamily: "crm",
    availableFields: ["record_id", "status", "summary", "account_id", "opportunity_stage"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      account_id: "string",
      opportunity_stage: "string",
    },
    grantedScopes: ["crm:read", "crm:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  helpdesk: {
    connectorKey: "helpdesk_primary",
    connectorFamily: "helpdesk",
    availableFields: ["record_id", "status", "summary", "ticket_id", "priority"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      ticket_id: "string",
      priority: "string",
    },
    grantedScopes: ["helpdesk:read", "helpdesk:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  knowledge_base: {
    connectorKey: "knowledge_base_primary",
    connectorFamily: "knowledge_base",
    availableFields: ["record_id", "status", "summary", "article_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      article_id: "string",
    },
    grantedScopes: ["knowledge_base:read"],
    supportsIdempotency: true,
    status: "healthy",
  },
  chat: {
    connectorKey: "chat_primary",
    connectorFamily: "chat",
    availableFields: ["record_id", "status", "summary", "thread_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      thread_id: "string",
    },
    grantedScopes: ["chat:read", "chat:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  calendar: {
    connectorKey: "calendar_primary",
    connectorFamily: "calendar",
    availableFields: ["record_id", "status", "summary", "event_id", "start_at"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      event_id: "string",
      start_at: "date",
    },
    grantedScopes: ["calendar:read", "calendar:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  docs: {
    connectorKey: "docs_primary",
    connectorFamily: "docs",
    availableFields: ["record_id", "status", "summary", "doc_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      doc_id: "string",
    },
    grantedScopes: ["docs:read", "docs:write"],
    supportsIdempotency: true,
    status: "healthy",
  },
  hris: {
    connectorKey: "hris_primary",
    connectorFamily: "hris",
    availableFields: ["record_id", "status", "summary", "employee_id", "policy_id"],
    fieldTypes: {
      record_id: "string",
      status: "string",
      summary: "string",
      employee_id: "string",
      policy_id: "string",
    },
    grantedScopes: ["hris:read", "hris:write"],
    supportsIdempotency: true,
    status: "healthy",
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
  const defaultMetadata = DEFAULT_CONNECTOR_METADATA[input.connectorFamily];
  const effectiveSideEffectClass =
    defaultMetadata && !defaultMetadata.grantedScopes.includes(`${input.connectorFamily}${WRITE_SCOPE_SUFFIX}`)
      ? "read_only"
      : input.sideEffectClass;
  return connectorMapSchema.parse({
    id: createWorkpackId("conn"),
    workpackId: input.workpackId,
    versionId: input.versionId,
    connectorKey: `${input.connectorFamily}_primary`,
    connectorFamily: input.connectorFamily,
    requiredScopes: requiredScopesForFamily(input.connectorFamily, effectiveSideEffectClass),
    optionalScopes: [],
    grantedScopes: [],
    fieldMappings: DEFAULT_REQUIRED_FIELDS.map((field) => ({
      sourceField: field,
      targetField: field,
      required: true,
      sideEffectClass: effectiveSideEffectClass,
    })),
    validationStatus: "draft",
    scopePosture: "missing",
    idempotencySupported: effectiveSideEffectClass === "read_only",
    writeMode: deriveWriteMode(effectiveSideEffectClass),
    missingFields: DEFAULT_REQUIRED_FIELDS,
    driftedFields: [],
    lastValidatedAt: null,
    expiresAt: null,
  });
}

function ensureConnectorMaps(workpackId: string): ConnectorMap[] {
  const detail = getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  if (!detail.version.executionPlan) {
    compileWorkpackExecutionPlan({ workpackId });
  }
  const refreshed = getWorkpackDetail(workpackId);
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

  saveWorkpackVersion({
    ...refreshed.version,
    connectorMaps,
  });

  return connectorMaps;
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

function maybeEmitValidationExceptions(workpackId: string, connectorMaps: ConnectorMap[], runId?: string | null): void {
  const detail = getWorkpackDetail(workpackId);
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

    normalizeWorkpackException({
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

export function validateConnectorMaps(input: {
  workpackId: string;
  metadataByFamily?: Record<string, Partial<ConnectorMetadata>>;
  runId?: string | null;
  emitExceptions?: boolean;
}): ConnectorValidationResult {
  const detail = getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const connectorMaps = ensureConnectorMaps(input.workpackId);
  const validatedMaps = connectorMaps.map((connectorMap) => {
    const metadata = {
      ...DEFAULT_CONNECTOR_METADATA[connectorMap.connectorFamily],
      ...(input.metadataByFamily?.[connectorMap.connectorFamily] ?? {}),
    };
    return validateAgainstMetadata(connectorMap, metadata);
  });

  updateWorkpackVersion(detail.version.id, (version) => ({
    ...version,
    connectorMaps: validatedMaps,
  }));

  if (input.emitExceptions !== false) {
    maybeEmitValidationExceptions(input.workpackId, validatedMaps, input.runId);
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

export function getConnectorStudioView(workpackId: string): ConnectorValidationResult & {
  workpackTitle: string;
  versionId: string;
} {
  const detail = getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }
  const validation = validateConnectorMaps({ workpackId, emitExceptions: false });
  return {
    ...validation,
    workpackTitle: detail.workpack.title,
    versionId: detail.version.id,
  };
}
