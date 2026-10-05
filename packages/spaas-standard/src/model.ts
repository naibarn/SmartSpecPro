export const VALIDATION_STAGES = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"] as const;

export type ValidationStage = (typeof VALIDATION_STAGES)[number];

export const STAGE_STATUSES = ["passed", "failed", "not_evaluated"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const VALIDATION_STATUSES = ["valid", "invalid", "needs_context"] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const DIAGNOSTIC_CODES = [
  "MANIFEST_SYNTAX_INVALID", "MANIFEST_DUPLICATE_KEY", "MANIFEST_DOCUMENT_INVALID",
  "MANIFEST_SCHEMA_INVALID", "MANIFEST_API_UNSUPPORTED", "MANIFEST_SCHEMA_UNSUPPORTED",
  "MANIFEST_FEATURE_UNSUPPORTED", "MANIFEST_OPTIONAL_FEATURE_UNSAFE", "MANIFEST_EXTENSION_UNSUPPORTED",
  "MANIFEST_EXTENSION_CONFLICT", "MANIFEST_SECURITY_OVERRIDE", "MANIFEST_LIMIT_EXCEEDED",
  "PACKAGE_PATH_INVALID", "PACKAGE_PATH_COLLISION", "PACKAGE_ENTRY_INVALID", "PACKAGE_LIMIT_EXCEEDED",
  "PACKAGE_REFERENCE_MISSING", "COMPONENT_ID_DUPLICATE", "COMPONENT_KIND_UNKNOWN", "PACKAGE_SECTION_INVALID",
  "DEPENDENCY_INVALID", "DEPENDENCY_DUPLICATE", "DEPENDENCY_SELF_REFERENCE", "DEPENDENCY_VERSION_INVALID", "DEPENDENCY_MUTABLE_REFERENCE", "DEPENDENCY_UNRESOLVED", "DEPENDENCY_CYCLE", "DEPENDENCY_LIMIT_EXCEEDED",
  "SECRET_EMBEDDED", "SECRET_SENSITIVE_PATH", "SECRET_SCAN_LIMIT_EXCEEDED", "SECRET_SCAN_INPUT_INVALID",
  "DIGEST_INPUT_INVALID", "DIGEST_LIMIT_EXCEEDED", "DIGEST_EXCLUSION_UNSUPPORTED",
  "VALIDATION_CONTEXT_MISSING", "VALIDATION_EVIDENCE_INVALID", "VALIDATION_PREREQUISITE_UNMET", "NOT_APPLICABLE", "VALIDATION_EVIDENCE_MISMATCH", "VALIDATION_EVIDENCE_EXPIRED", "VALIDATION_EVIDENCE_UNSUPPORTED",
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type DiagnosticSeverity = "error" | "warning" | "info";

/** A safe, stable finding. `message` must never contain package bytes or matched secret material. */
export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly stage: ValidationStage;
  readonly location: string;
  readonly message: string;
}

export interface PassedStageResult {
  readonly stage: ValidationStage;
  readonly status: "passed";
  readonly mandatory: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface FailedStageResult {
  readonly stage: ValidationStage;
  readonly status: "failed";
  readonly mandatory: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

export interface UnevaluatedStageResult {
  readonly stage: ValidationStage;
  readonly status: "not_evaluated";
  readonly mandatory: boolean;
  readonly reason: string;
  readonly diagnostics: readonly Diagnostic[];
}

export type StageResult = PassedStageResult | FailedStageResult | UnevaluatedStageResult;

type ValidStageResult<S extends ValidationStage> =
  | (PassedStageResult & { readonly stage: S })
  | (UnevaluatedStageResult & { readonly stage: S; readonly mandatory: false });
type AllValidationStages = readonly [
  StageResult & { readonly stage: "V1" },
  StageResult & { readonly stage: "V2" },
  StageResult & { readonly stage: "V3" },
  StageResult & { readonly stage: "V4" },
  StageResult & { readonly stage: "V5" },
  StageResult & { readonly stage: "V6" },
  StageResult & { readonly stage: "V7" },
  StageResult & { readonly stage: "V8" },
];
type AllValidValidationStages = readonly [
  ValidStageResult<"V1">, ValidStageResult<"V2">, ValidStageResult<"V3">, ValidStageResult<"V4">,
  ValidStageResult<"V5">, ValidStageResult<"V6">, ValidStageResult<"V7">, ValidStageResult<"V8">,
];

export interface ValidValidationReport {
  readonly status: "valid";
  readonly profile: string;
  /** Fixed order V1 through V8; mandatory checks cannot be unevaluated or failed. */
  readonly stages: AllValidValidationStages;
  readonly diagnostics: readonly Diagnostic[];
}

export interface InvalidValidationReport {
  readonly status: "invalid";
  readonly profile: string;
  readonly stages: AllValidationStages;
  readonly failedStage: FailedStageResult;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ContextNeededValidationReport {
  readonly status: "needs_context";
  readonly profile: string;
  readonly stages: AllValidationStages;
  readonly missingRequiredStage: UnevaluatedStageResult & { readonly mandatory: true };
  readonly diagnostics: readonly Diagnostic[];
}

export type ValidationReport = ValidValidationReport | InvalidValidationReport | ContextNeededValidationReport;

export interface ManifestExtension {
  readonly namespace: string;
  readonly version: string;
  readonly schema?: string;
  readonly criticality: "required" | "optional" | "advisory" | "security_critical";
  readonly config: Readonly<Record<string, unknown>>;
  readonly fallback?: Readonly<{ policy: string; preservesSemantics: boolean }>;
}

export interface ManifestSupportContext {
  readonly supportedApiVersions: readonly string[];
  readonly supportedSchemaVersions: readonly string[];
  readonly supportedRequiredFeatures: readonly string[];
  readonly supportedOptionalFeatures: readonly string[];
  readonly extensions: readonly {
    readonly namespace: string;
    readonly versions: readonly string[];
    readonly criticalities: readonly ManifestExtension["criticality"][];
  }[];
  /** Additional component types registered by this explicit caller context. */
  readonly supportedComponentTypes?: readonly string[];
}

export interface SpaasManifest {
  readonly apiVersion: string;
  readonly kind: "AIApplication";
  readonly metadata: Readonly<{
    id: string;
    name: string;
    slug: string;
    version: string;
    description?: string;
    labels?: Readonly<Record<string, string>>;
    annotations?: Readonly<Record<string, string>>;
  }>;
  readonly ownership: Readonly<{ ownerType: string; ownerId: string; authors?: readonly string[] }>;
  readonly compatibility: Readonly<{
    minimumPlatformVersion: string;
    manifestSchema: string;
    requiredFeatures?: readonly string[];
    optionalFeatures?: readonly string[];
  }>;
  readonly application: Readonly<Record<string, unknown>>;
  readonly components: readonly Readonly<Record<string, unknown>>[];
  readonly sections?: readonly Readonly<{ name: string; path: string; required?: boolean }>[];
  readonly requires?: Readonly<Record<string, unknown>>;
  readonly security?: Readonly<Record<string, unknown>>;
  readonly privacy?: Readonly<Record<string, unknown>>;
  readonly interop?: Readonly<Record<string, unknown>>;
  readonly extensions?: readonly ManifestExtension[];
  readonly publication?: Readonly<Record<string, unknown>>;
  readonly distribution?: Readonly<Record<string, unknown>>;
  readonly runtime?: Readonly<Record<string, unknown>>;
  readonly hosting?: Readonly<Record<string, unknown>>;
  readonly operations?: Readonly<Record<string, unknown>>;
  readonly tests?: Readonly<Record<string, unknown>>;
  readonly lifecycle?: Readonly<Record<string, unknown>>;
  /** Safe unknown optional values retained separately from trusted core fields. */
  readonly preservedOptional?: Readonly<Record<string, unknown>>;
}

export interface PackageEntry {
  /** Untrusted logical relative name; canonical identity is assigned by the structural validator. */
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly kind: "file";
}

export interface CanonicalPackage {
  readonly manifest: SpaasManifest;
  readonly entries: readonly PackageEntry[];
  readonly dependencies: readonly DependencyEdge[];
  readonly digest?: PackageDigestMetadata;
  readonly provenance: Readonly<{
    schemaVersion: string;
    parserVersion: string;
    normalizationVersion: string;
    profile: string;
  }>;
}

export type DependencyEdge =
  | Readonly<{ kind: "component"; from: string; to: string; required: boolean; versionRange?: string; immutable?: boolean }>
  | Readonly<{ kind: "capability"; from: string; to: string; required: boolean; versionRange?: string }>;

export interface PackageDigestMetadata {
  readonly algorithm: "sha256";
  readonly version: "spaas-package-v1";
  readonly value: string;
  readonly includedPaths: readonly string[];
  readonly excludedPaths: readonly Readonly<{ path: string; reason: string }>[];
}

export interface ManifestParseSuccess {
  readonly ok: true;
  readonly manifest: SpaasManifest;
  /** Context-derived negotiation facts are separate from canonical package semantics/digest input. */
  readonly unexecutedExtensions: readonly Readonly<{ namespace: string; version: string }>[];
}

export interface ManifestParseFailure {
  readonly ok: false;
  readonly diagnostics: readonly Diagnostic[];
}

export type ManifestParseResult = ManifestParseSuccess | ManifestParseFailure;

/** Positive safe integer ceilings. Every ceiling is inclusive; overrides may only lower defaults. */
export interface SpaasValidationLimits {
  /** Maximum UTF-8 manifest bytes. */
  readonly manifestBytes: number;
  /** Maximum nested YAML collections. */
  readonly yamlDepth: number;
  /** Maximum YAML scalar, sequence, and mapping nodes. */
  readonly yamlNodes: number;
  /** Maximum regular package entries. */
  readonly packageEntries: number;
  /** Maximum bytes in one package entry. */
  readonly entryBytes: number;
  /** Maximum aggregate bytes across entries. */
  readonly aggregateBytes: number;
  /** Maximum segments in a canonical relative path. */
  readonly pathDepth: number;
  /** Maximum UTF-8 bytes in one canonical path. */
  readonly pathBytes: number;
  /** Maximum dependency graph vertices. */
  readonly graphNodes: number;
  /** Maximum dependency graph edges. */
  readonly graphEdges: number;
  /** Maximum bytes scanned for embedded secrets. */
  readonly scanBytes: number;
}

export type SpaasValidationLimitOverrides = Partial<SpaasValidationLimits>;

/** Inclusive ceilings; a value equal to the limit is allowed. */
export const DEFAULT_VALIDATION_LIMITS: Readonly<SpaasValidationLimits> = Object.freeze({
  manifestBytes: 4 * 1024 * 1024,
  yamlDepth: 64,
  yamlNodes: 100_000,
  packageEntries: 10_000,
  entryBytes: 32 * 1024 * 1024,
  aggregateBytes: 256 * 1024 * 1024,
  pathDepth: 32,
  pathBytes: 1024,
  graphNodes: 20_000,
  graphEdges: 100_000,
  scanBytes: 64 * 1024 * 1024,
});
