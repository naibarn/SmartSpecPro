import { z } from "zod";

import {
  WORKER_RUNTIME_PROTOCOL_VERSION,
  workerProtocolCompatibilitySchema,
  workerRuntimeTypeSchema,
} from "./workerRuntime";

export const DESKTOP_HOST_PROTOCOL_VERSION = "2026-04-08";
export const DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE = "desktop_zeroclaw_managed";

export const desktopPackageTrustClassValues = [
  "built_in_verified",
  "org_verified",
  "local_unverified",
  "project_local",
] as const;

export const desktopPackageStateValues = [
  "trusted",
  "restricted",
  "quarantined",
  "blocked",
  "revoked",
  "requires_review",
  "incompatible",
] as const;

export const runSurfaceLabelValues = ["web", "desktop"] as const;
export const runRuntimeLabelValues = [
  "platform_skill",
  "pi",
  "agency_swarm",
  "cloud_agent",
  "openclaw_gateway",
] as const;
export const runLocalityLabelValues = [
  "local",
  "hybrid",
  "server",
  "external",
] as const;
export const runWorkspaceLabelValues = [
  "local_workspace",
  "cloud_workspace",
  "none",
] as const;

export const desktopHostFeatureFlagKeys = [
  "desktopHostEnabled",
  "desktopAdvancedLocalMode",
  "desktopPackageSync",
  "desktopAgencyRuntime",
  "desktopWorkerProjection",
] as const;

export const desktopEnrollmentTokenUseValues = [
  "desktop_bootstrap",
  "desktop_refresh",
  "desktop_runtime",
] as const;

export const desktopEnrollmentChallengePurposeValues = [
  "bootstrap",
  "refresh",
  "rekey",
] as const;

export const desktopEnrollmentProofKindValues = [
  "shared_secret_sha256",
  "ed25519_signature",
] as const;

export const desktopRootWritebackModeValues = [
  "read_search_only",
  "managed_output_only",
  "user_confirmed_root_write",
  "advanced_local_override",
] as const;

export const desktopStorageProtectionValues = [
  "os_protected",
  "encrypted_at_rest",
  "best_effort",
] as const;

export const desktopDeviceAttestationModeValues = [
  "software_pkcs8",
  "os_protected",
  "os_keychain",
  "os_attested",
  "hardware_attested",
] as const;

export const desktopParserIsolationModeValues = [
  "none",
  "python_subprocess_bounded",
] as const;
export const desktopParserPdfExtractorValues = [
  "internal_heuristic",
  "pdftotext",
] as const;
export const desktopParserOcrProviderValues = [
  "none",
  "tesseract",
] as const;
export const desktopPackageSyncStatusValues = [
  "idle",
  "syncing",
  "ready",
  "degraded",
  "error",
  "revoked",
] as const;
export const desktopManagedActionTypeValues = [
  "reindex_root",
  "purge_root_derived_store",
  "revoke_root",
  "cleanup_device",
  "force_reauth",
  "revoke_runtime_tokens",
  "cancel_active_runs",
  "quarantine_device",
  "resume_device_access",
] as const;
export const desktopManagedActionStatusValues = [
  "queued",
  "acknowledged",
] as const;
export const desktopCatalogPackageTypeValues = [
  "skill_package",
  "agency_pack",
  "hybrid_pack",
  "tooling_pack",
  "runtime_support_pack",
] as const;
export const desktopCatalogRuntimeDestinationValues = [
  "pi",
  "agency_swarm",
  "desktop_host",
  "hybrid",
] as const;

export const desktopDeviceHealthStatusValues = [
  "online",
  "offline",
  "unhealthy",
  "disabled",
] as const;

export const desktopDeviceAccessStateValues = [
  "active",
  "reauth_required",
  "quarantined",
  "disabled",
] as const;

export const desktopDevicePresenceStatusValues = [
  "online",
  "stale",
  "offline",
  "disabled",
] as const;

export const desktopWorkspaceNetworkClassValues = [
  "gateway_only",
  "server_only",
  "approved_connectors_only",
  "approved_public_web",
  "unrestricted_advanced_local",
] as const;

export const desktopWorkspaceProfileValues = [
  "standard_managed",
  "advanced_local",
  "indexing_worker",
  "connector_helper",
  "pi_sidecar_managed",
  "agency_swarm_managed",
] as const;

export const desktopRunSelectionValues = [
  "platform_skill",
  "pi",
  "agency_swarm",
  "openclaw_gateway",
  "cloud_agent",
] as const;

export const desktopRunReasonValues = [
  "explicit_user_choice",
  "deterministic_skill",
  "local_file_heavy",
  "connector_orchestration",
  "multi_agent_complexity",
  "gateway_policy_required",
  "runtime_unavailable",
  "degraded_offline",
] as const;

export const desktopConnectorActionValues = [
  "send_message",
  "read_message",
  "fetch_attachment",
  "register_trigger",
  "read_channel_metadata",
  "post_response",
] as const;

export const desktopHighRiskActionValues = [
  "delete_file",
  "overwrite_root_file",
  "outbound_connector_message",
  "shell_exec",
  "privileged_mount",
  "unrestricted_network",
  "install_local_unverified_package",
  "publish_trust_tainted_output",
] as const;

export const desktopApprovalDecisionValues = [
  "allow",
  "confirm",
  "deny",
] as const;

export const desktopRolloutGateValues = [
  "device_binding_ready",
  "signed_packages_enforced",
  "signed_updates_enforced",
  "managed_file_roots_default",
  "pi_gateway_only",
  "agency_gateway_only",
  "offboarding_cleanup_ready",
] as const;

export const desktopPackageTrustClassSchema = z.enum(desktopPackageTrustClassValues);
export const desktopPackageStateSchema = z.enum(desktopPackageStateValues);
export const runSurfaceLabelSchema = z.enum(runSurfaceLabelValues);
export const runRuntimeLabelSchema = z.enum(runRuntimeLabelValues);
export const runLocalityLabelSchema = z.enum(runLocalityLabelValues);
export const runWorkspaceLabelSchema = z.enum(runWorkspaceLabelValues);
export const desktopEnrollmentTokenUseSchema = z.enum(desktopEnrollmentTokenUseValues);
export const desktopEnrollmentChallengePurposeSchema = z.enum(
  desktopEnrollmentChallengePurposeValues,
);
export const desktopEnrollmentProofKindSchema = z.enum(
  desktopEnrollmentProofKindValues,
);
export const desktopRootWritebackModeSchema = z.enum(desktopRootWritebackModeValues);
export const desktopStorageProtectionSchema = z.enum(desktopStorageProtectionValues);
export const desktopDeviceAttestationModeSchema = z.enum(
  desktopDeviceAttestationModeValues,
);
export const desktopParserIsolationModeSchema = z.enum(
  desktopParserIsolationModeValues,
);
export const desktopParserPdfExtractorSchema = z.enum(
  desktopParserPdfExtractorValues,
);
export const desktopParserOcrProviderSchema = z.enum(
  desktopParserOcrProviderValues,
);
export const desktopPackageSyncStatusSchema = z.enum(
  desktopPackageSyncStatusValues,
);
export const desktopManagedActionTypeSchema = z.enum(
  desktopManagedActionTypeValues,
);
export const desktopManagedActionStatusSchema = z.enum(
  desktopManagedActionStatusValues,
);
export const desktopCatalogPackageTypeSchema = z.enum(
  desktopCatalogPackageTypeValues,
);
export const desktopCatalogRuntimeDestinationSchema = z.enum(
  desktopCatalogRuntimeDestinationValues,
);
export const desktopDeviceHealthStatusSchema = z.enum(desktopDeviceHealthStatusValues);
export const desktopDeviceAccessStateSchema = z.enum(desktopDeviceAccessStateValues);
export const desktopDevicePresenceStatusSchema = z.enum(desktopDevicePresenceStatusValues);
export const desktopWorkspaceNetworkClassSchema = z.enum(
  desktopWorkspaceNetworkClassValues,
);
export const desktopWorkspaceProfileNameSchema = z.enum(
  desktopWorkspaceProfileValues,
);
export const desktopRunSelectionSchema = z.enum(desktopRunSelectionValues);
export const desktopRunReasonSchema = z.enum(desktopRunReasonValues);
export const desktopConnectorActionSchema = z.enum(desktopConnectorActionValues);
export const desktopHighRiskActionSchema = z.enum(desktopHighRiskActionValues);
export const desktopApprovalDecisionSchema = z.enum(desktopApprovalDecisionValues);
export const desktopRolloutGateSchema = z.enum(desktopRolloutGateValues);

export const desktopHostFeatureFlagsSchema = z.object({
  desktopHostEnabled: z.boolean().default(false),
  desktopAdvancedLocalMode: z.boolean().default(false),
  desktopPackageSync: z.boolean().default(false),
  desktopAgencyRuntime: z.boolean().default(false),
  desktopWorkerProjection: z.boolean().default(false),
});

export const desktopHostTransportSchema = z.object({
  preferredTransport: z.literal("http").default("http"),
  mcpFallbackAllowed: z.boolean().default(true),
});

export const desktopRuntimeTokenBindingSchema = z.object({
  tenantId: z.string().min(1),
  deviceId: z.string().min(1),
  runtimeScope: z.enum(["desktop_runtime", "desktop_refresh"]),
  challengeId: z.string().min(1),
  deviceKeyVersion: z.number().int().positive(),
  proofSha256: z.string().regex(/^[a-f0-9]{64}$/),
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const desktopEnrollmentChallengeSchema = z.object({
  challengeId: z.string().min(1),
  tenantId: z.string().min(1),
  deviceId: z.string().min(1),
  purpose: desktopEnrollmentChallengePurposeSchema,
  deviceKeyVersion: z.number().int().positive(),
  nonce: z.string().min(1),
  devicePublicKeyDigest: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.string().datetime(),
  issuedAtEpochMs: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  expiresAtEpochMs: z.number().int().positive(),
  challengeSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const desktopEnrollmentChallengeRequestSchema = z.object({
  deviceId: z.string().min(1),
  devicePublicKeyPem: z.string().min(1),
  purpose: desktopEnrollmentChallengePurposeSchema.default("bootstrap"),
  deviceKeyVersion: z.number().int().positive().default(1),
  ttlSeconds: z.number().int().positive().max(3600).default(300),
});

export const desktopEnrollmentVerifyRequestSchema = z
  .object({
    proofKind: desktopEnrollmentProofKindSchema.default("ed25519_signature"),
    challenge: desktopEnrollmentChallengeSchema,
    devicePublicKeyPem: z.string().min(1),
    runtimeScope: z.enum(["desktop_runtime", "desktop_refresh"]).default("desktop_runtime"),
    signatureBase64: z.string().min(1).nullable().optional().default(null),
    proofSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional().default(null),
    deviceSharedSecret: z.string().min(1).nullable().optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.proofKind === "ed25519_signature" && !value.signatureBase64) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["signatureBase64"],
        message: "signatureBase64 is required for ed25519_signature verification",
      });
    }
    if (
      value.proofKind === "shared_secret_sha256"
      && (!value.proofSha256 || !value.deviceSharedSecret)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["proofSha256"],
        message: "proofSha256 and deviceSharedSecret are required for shared_secret_sha256 verification",
      });
    }
  });

export const desktopEnrollmentVerifyResponseSchema = z.object({
  verified: z.boolean(),
  proofKind: desktopEnrollmentProofKindSchema,
  challengeId: z.string().min(1),
  deviceId: z.string().min(1),
  runtimeBinding: desktopRuntimeTokenBindingSchema.nullable().optional().default(null),
});

export const desktopDeviceIdentitySchema = z.object({
  deviceId: z.string().min(1),
  keyAlgorithm: z.string().min(1),
  keyVersion: z.number().int().positive(),
  publicKeyPem: z.string().min(1),
  publicKeyDigestSha256: z.string().regex(/^[a-f0-9]{64}$/),
  secretId: z.string().min(1),
  attestationMode: desktopDeviceAttestationModeSchema.default("software_pkcs8"),
  secretStorage: z.enum(["file_store", "os_keychain", "windows_dpapi"]).default("file_store"),
  storageProtection: desktopStorageProtectionSchema.default("best_effort"),
  storageProvider: z.string().min(1).default("filesystem"),
  osAttested: z.boolean().default(false),
  hardwareBacked: z.boolean().default(false),
  attestationProvider: z.string().min(1).default("derived_runtime"),
  attestationEvidenceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional()
    .default(null),
  attestationClaims: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().nullable().optional().default(null),
});

export const desktopDeviceIdentityCapabilitySchema = z.object({
  keyAlgorithm: z.string().min(1).default("ed25519"),
  keyVersion: z.number().int().positive().default(1),
  publicKeyDigestSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional()
    .default(null),
  attestationMode: desktopDeviceAttestationModeSchema.default("software_pkcs8"),
  secretStorage: z.enum(["file_store", "os_keychain", "windows_dpapi"]).default("file_store"),
  storageProtection: desktopStorageProtectionSchema.default("best_effort"),
  storageProvider: z.string().min(1).default("filesystem"),
  osAttested: z.boolean().default(false),
  hardwareBacked: z.boolean().default(false),
  attestationProvider: z.string().min(1).default("derived_runtime"),
  attestationEvidenceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .optional()
    .default(null),
  attestationClaims: z.array(z.string().min(1)).default([]),
  proofKind: desktopEnrollmentProofKindSchema.default("ed25519_signature"),
});

export const desktopLocalFileParserCapabilitySchema = z.object({
  enabled: z.boolean().default(false),
  isolationMode: desktopParserIsolationModeSchema.default("none"),
  supportedFormats: z.array(z.string().min(1)).default([]),
  maxInputBytes: z.number().int().positive().default(8_388_608),
  timeoutMs: z.number().int().positive().default(8_000),
  ocrEnabled: z.boolean().default(false),
  pdfExtractor: desktopParserPdfExtractorSchema.default("internal_heuristic"),
  ocrProvider: desktopParserOcrProviderSchema.default("none"),
  renderBackend: z.string().min(1).default("none"),
  officeRenderer: z.string().min(1).default("none"),
  renderedPreviewFormats: z.array(z.string().min(1)).default([]),
  complexDocumentSupport: z
    .enum(["text_extraction_only", "rendering_without_ocr", "ocr_rendering"])
    .default("text_extraction_only"),
  macroInspectionSupported: z.boolean().default(false),
  embeddedMediaInspectionSupported: z.boolean().default(false),
  layoutAnalysisMode: z.enum(["none", "basic_structural", "page_segmented"]).default("none"),
  multiPageRenderingSupported: z.boolean().default(false),
  maxRenderedPages: z.number().int().nonnegative().default(0),
  ocrLayoutMode: z.enum(["plain_text", "page_segmented"]).default("plain_text"),
  fullRenderingSupported: z.boolean().default(false),
  activeContentExecutionAllowed: z.boolean().default(false),
});

export const desktopDeviceAttestationSupportSchema = z.object({
  enabled: z.boolean().default(true),
  evidenceSource: z
    .enum(["derived_runtime", "runtime_override", "env_json", "helper"])
    .default("derived_runtime"),
  helperConfigured: z.boolean().default(false),
  helperReachable: z.boolean().default(false),
  helperPath: z.string().min(1).nullable().optional().default(null),
  defaultMode: desktopDeviceAttestationModeSchema.default("software_pkcs8"),
  providerHint: z.string().min(1).default("derived_runtime"),
  supportedModes: z.array(desktopDeviceAttestationModeSchema).default([]),
  notes: z.array(z.string().min(1)).default([]),
});

export const desktopManagedActionSchema = z.object({
  actionId: z.string().min(1),
  actionType: desktopManagedActionTypeSchema,
  status: desktopManagedActionStatusSchema.default("queued"),
  rootId: z.string().min(1).nullable().optional().default(null),
  requestedAt: z.string().datetime(),
  note: z.string().min(1).nullable().optional().default(null),
});

export const desktopPackageSyncStateSchema = z.object({
  syncStatus: desktopPackageSyncStatusSchema.default("idle"),
  lastSyncAt: z.string().datetime().nullable().optional().default(null),
  lastError: z.string().min(1).nullable().optional().default(null),
  syncedPackageIds: z.array(z.string().min(1)).default([]),
  packageCount: z.number().int().nonnegative().default(0),
  lastRevocationCheckAt: z.string().datetime().nullable().optional().default(null),
});

export const desktopCapabilitySnapshotSchema = z.object({
  deviceIdentity: desktopDeviceIdentityCapabilitySchema.nullable().optional().default(null),
  deviceAttestationSupport: desktopDeviceAttestationSupportSchema
    .nullable()
    .optional()
    .default(null),
  localFileService: desktopLocalFileParserCapabilitySchema
    .nullable()
    .optional()
    .default(null),
});

export const desktopLocalRootSchema = z.object({
  rootId: z.string().min(1),
  name: z.string().min(1),
  absolutePath: z.string().min(1),
  writebackMode: desktopRootWritebackModeSchema.default("read_search_only"),
  indexingEnabled: z.boolean().default(true),
  previewEnabled: z.boolean().default(true),
  vectorIndexEnabled: z.boolean().default(false),
  deniedByDefault: z.boolean().default(false),
  denialReason: z.string().min(1).nullable().optional().default(null),
});

export const desktopDerivedStorePolicySchema = z.object({
  storageProtection: desktopStorageProtectionSchema.default("os_protected"),
  previewCacheTtlDays: z.number().int().nonnegative().default(30),
  snippetCacheTtlDays: z.number().int().nonnegative().default(30),
  fullTextIndexEnabled: z.boolean().default(true),
  vectorIndexEnabled: z.boolean().default(false),
  purgeOnRootRemoval: z.boolean().default(true),
  purgeOnOffboarding: z.boolean().default(true),
});

export const desktopOffboardingPlanSchema = z.object({
  deviceId: z.string().min(1),
  revokeTokensImmediately: z.literal(true).default(true),
  blockNewRuns: z.literal(true).default(true),
  invalidatePackageCache: z.boolean().default(true),
  purgeDerivedStores: z.boolean().default(true),
  cleanupOnNextContact: z.boolean().default(true),
  packageCachePaths: z.array(z.string().min(1)).default([]),
  localRootIds: z.array(z.string().min(1)).default([]),
});

export const desktopDeviceDisableRequestSchema = z.object({
  reason: z.string().min(1).nullable().optional().default(null),
  cleanupOnNextContact: z.boolean().default(true),
  packageCachePaths: z.array(z.string().min(1)).default([]),
  localRoots: z.array(desktopLocalRootSchema).default([]),
});

export const desktopWorkspaceMountSchema = z.object({
  mountType: z.enum(["project_workspace", "local_root", "output_cache", "package_cache", "connector_socket"]),
  sourcePath: z.string().min(1),
  targetPath: z.string().min(1),
  readOnly: z.boolean().default(true),
});

export const desktopWorkspaceProfileSchema = z.object({
  profileName: desktopWorkspaceProfileNameSchema,
  networkClass: desktopWorkspaceNetworkClassSchema,
  cpuLimit: z.number().positive().max(64).nullable().optional().default(null),
  memoryMb: z.number().int().positive().max(262144).nullable().optional().default(null),
  mounts: z.array(desktopWorkspaceMountSchema).default([]),
  outputDirectoryName: z.string().min(1).default("outputs"),
  connectorSidecarAllowed: z.boolean().default(false),
  writebackMode: desktopRootWritebackModeSchema.default("read_search_only"),
});

export const desktopCapabilityManifestSchema = z.object({
  capabilities: z.array(z.string().min(1)).default([]),
  networkEgressClass: desktopWorkspaceNetworkClassSchema.default("gateway_only"),
  requiresSecrets: z.boolean().default(false),
  allowsLocalProcessSpawn: z.boolean().default(false),
  allowsConnectorActions: z.array(desktopConnectorActionSchema).default([]),
});

export const desktopApprovalRuleSchema = z.object({
  action: desktopHighRiskActionSchema,
  decision: desktopApprovalDecisionSchema,
  rationale: z.string().min(1),
});

export const desktopRunLabelsSchema = z.object({
  surface: runSurfaceLabelSchema,
  runtime: runRuntimeLabelSchema,
  locality: runLocalityLabelSchema,
  workspace: runWorkspaceLabelSchema,
  trustClass: desktopPackageTrustClassSchema,
});

export const desktopRunSelectionResultSchema = z.object({
  selectedRuntime: desktopRunSelectionSchema,
  reason: desktopRunReasonSchema,
  labels: desktopRunLabelsSchema,
  sidecarBoundaryRequired: z.boolean().default(false),
  transport: desktopHostTransportSchema.default({}),
});

export const desktopDeviceRunSummarySchema = z.object({
  reportedAt: z.string().datetime(),
  selection: desktopRunSelectionResultSchema,
});

export const desktopRolloutGateStateSchema = z.object({
  gate: desktopRolloutGateSchema,
  satisfied: z.boolean(),
  reason: z.string().min(1),
});

export const desktopHostPolicySnapshotSchema = z.object({
  policyVersion: z.string().min(1),
  tenantId: z.string().min(1),
  deviceId: z.string().min(1),
  fetchedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  trustFreshnessTtlSeconds: z.number().int().positive(),
  featureFlags: desktopHostFeatureFlagsSchema,
  localRoots: z.array(desktopLocalRootSchema).default([]),
  derivedStorePolicy: desktopDerivedStorePolicySchema.default({}),
  workspaceProfiles: z.array(desktopWorkspaceProfileSchema).default([]),
  approvalRules: z.array(desktopApprovalRuleSchema).default([]),
  rolloutGates: z.array(desktopRolloutGateStateSchema).default([]),
  workerProjectionRuntimeType: z
    .literal(DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE)
    .nullable()
    .optional()
    .default(null),
  tokenPolicy: z
    .object({
      protocolVersion: z.string().min(1).default(DESKTOP_HOST_PROTOCOL_VERSION),
      bootstrapTokenUse: z.literal("desktop_bootstrap").default("desktop_bootstrap"),
      refreshTokenUse: z.literal("desktop_refresh").default("desktop_refresh"),
      runtimeTokenUse: z.literal("desktop_runtime").default("desktop_runtime"),
    })
    .default({}),
  transport: desktopHostTransportSchema.default({}),
});

export const desktopHostProtocolCompatibilitySchema =
  workerProtocolCompatibilitySchema.extend({
    protocolVersion: z.string().min(1).default(DESKTOP_HOST_PROTOCOL_VERSION),
    minServerProtocolVersion: z
      .string()
      .min(1)
      .nullable()
      .optional()
      .default(WORKER_RUNTIME_PROTOCOL_VERSION),
  });

export const desktopDevicePlatformSchema = z.object({
  os: z.enum(["macos", "windows", "linux"]),
  osVersion: z.string().min(1).nullable().optional().default(null),
  arch: z.string().min(1),
  appVersion: z.string().min(1),
});

export const desktopDeviceOwnerSchema = z.object({
  userId: z.string().min(1).nullable().optional().default(null),
  name: z.string().min(1).nullable().optional().default(null),
  email: z.string().email().nullable().optional().default(null),
});

export const desktopDevicePresenceSchema = z.object({
  status: desktopDevicePresenceStatusSchema.default("offline"),
  staleAfterSeconds: z.number().int().positive().default(300),
  lastSeenAgeSeconds: z.number().int().nonnegative().nullable().optional().default(null),
  reportedAt: z.string().datetime().nullable().optional().default(null),
});

export const desktopDevicePolicyOverridesSchema = z.object({
  allowAdvancedLocalMode: z.boolean().nullable().optional().default(null),
  allowPackageSync: z.boolean().nullable().optional().default(null),
  allowAgencyRuntime: z.boolean().nullable().optional().default(null),
  allowWorkerProjection: z.boolean().nullable().optional().default(null),
  maxLocalRoots: z.number().int().positive().nullable().optional().default(null),
  outputWritebackMode: desktopRootWritebackModeSchema
    .nullable()
    .optional()
    .default(null),
});

export const desktopRegisteredDeviceSummarySchema = z.object({
  deviceId: z.string().min(1),
  displayName: z.string().min(1),
  machineName: z.string().min(1).nullable().optional().default(null),
  healthStatus: desktopDeviceHealthStatusSchema,
  accessState: desktopDeviceAccessStateSchema.default("active"),
  platform: desktopDevicePlatformSchema,
  enrolledAt: z.string().datetime().nullable().optional().default(null),
  lastSeenAt: z.string().datetime().nullable().optional().default(null),
  owner: desktopDeviceOwnerSchema.default({}),
  presence: desktopDevicePresenceSchema.default({}),
  workerProjectionEnabled: z.boolean().default(false),
  projectedWorkerRuntimeType: workerRuntimeTypeSchema.nullable().optional().default(null),
  warningFlags: z.array(z.string()).default([]),
  capabilities: desktopCapabilitySnapshotSchema.default({}),
  localRoots: z.array(desktopLocalRootSchema).default([]),
  packageCachePaths: z.array(z.string().min(1)).default([]),
  packageSyncState: desktopPackageSyncStateSchema.default({}),
  pendingActions: z.array(desktopManagedActionSchema).default([]),
  currentWorkspaceProfile: desktopWorkspaceProfileSchema
    .nullable()
    .optional()
    .default(null),
  lastRunSummary: desktopDeviceRunSummarySchema
    .nullable()
    .optional()
    .default(null),
  policyVersion: z.string().min(1).nullable().optional().default(null),
  policyExpiresAt: z.string().datetime().nullable().optional().default(null),
  policyOverrides: desktopDevicePolicyOverridesSchema.default({}),
});

export const desktopHostDeviceStatusResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  devices: z.array(desktopRegisteredDeviceSummarySchema).default([]),
});

export const desktopDeviceDisableResponseSchema = z.object({
  device: desktopRegisteredDeviceSummarySchema,
  disabledAt: z.string().datetime(),
  offboardingPlan: desktopOffboardingPlanSchema,
});

export const desktopDeviceRegistrationPayloadSchema = z
  .object({
    compatibility: desktopHostProtocolCompatibilitySchema,
    tenantId: z.string().min(1),
    userId: z.union([z.string().min(1), z.number().int().positive()]),
    deviceId: z.string().min(1),
    displayName: z.string().min(1),
    machineName: z.string().min(1).nullable().optional().default(null),
    platform: desktopDevicePlatformSchema,
    workerProjectionEnabled: z.boolean().default(false),
    projectedWorkerRuntimeType: workerRuntimeTypeSchema
      .nullable()
      .optional()
      .default(null),
    capabilitiesJson: z.record(z.string(), z.unknown()).default({}),
    healthSummaryJson: z.record(z.string(), z.unknown()).default({}),
    warningFlagsJson: z.array(z.string()).default([]),
    localRoots: z.array(desktopLocalRootSchema).default([]),
    packageCachePaths: z.array(z.string().min(1)).default([]),
    packageSyncState: desktopPackageSyncStateSchema.default({}),
    currentWorkspaceProfile: desktopWorkspaceProfileSchema
      .nullable()
      .optional()
      .default(null),
    lastRunSummary: desktopDeviceRunSummarySchema
      .nullable()
      .optional()
      .default(null),
    pendingActions: z.array(desktopManagedActionSchema).default([]),
  })
  .superRefine((value, ctx) => {
    const expectedRuntimeType = resolveDesktopWorkerProjectionRuntimeType(
      value.workerProjectionEnabled,
    );

    if (value.workerProjectionEnabled && value.projectedWorkerRuntimeType !== expectedRuntimeType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectedWorkerRuntimeType"],
        message: `worker projection must resolve to ${DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE}`,
      });
    }

    if (!value.workerProjectionEnabled && value.projectedWorkerRuntimeType !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectedWorkerRuntimeType"],
        message: "projected worker runtime type must be null when projection is disabled",
      });
    }
  });

export const desktopDeviceHeartbeatPayloadSchema = z.object({
  compatibility: desktopHostProtocolCompatibilitySchema,
  capabilitiesJson: z.record(z.string(), z.unknown()).default({}),
  healthSummaryJson: z.record(z.string(), z.unknown()).default({}),
  warningFlagsJson: z.array(z.string()).default([]),
  policyCursor: z.string().min(1).nullable().optional().default(null),
  localRoots: z.array(desktopLocalRootSchema).default([]),
  packageCachePaths: z.array(z.string().min(1)).default([]),
  packageSyncState: desktopPackageSyncStateSchema.default({}),
  currentWorkspaceProfile: desktopWorkspaceProfileSchema
    .nullable()
    .optional()
    .default(null),
  lastRunSummary: desktopDeviceRunSummarySchema
    .nullable()
    .optional()
    .default(null),
  acknowledgedActionIds: z.array(z.string().min(1)).default([]),
});

export const desktopRootActionRequestSchema = z.object({
  actionType: z.enum([
    "reindex_root",
    "purge_root_derived_store",
    "revoke_root",
  ]),
  note: z.string().min(1).nullable().optional().default(null),
});

export const desktopRootActionResponseSchema = z.object({
  device: desktopRegisteredDeviceSummarySchema,
  action: desktopManagedActionSchema,
});

export const desktopDeviceActionRequestSchema = z.object({
  actionType: z.enum([
    "force_reauth",
    "revoke_runtime_tokens",
    "cancel_active_runs",
    "quarantine_device",
    "resume_device_access",
  ]),
  note: z.string().min(1).nullable().optional().default(null),
});

export const desktopDeviceActionResponseSchema = z.object({
  device: desktopRegisteredDeviceSummarySchema,
  action: desktopManagedActionSchema,
});

export const desktopDevicePolicyOverrideRequestSchema = z.object({
  overrides: desktopDevicePolicyOverridesSchema.partial().default({}),
  note: z.string().min(1).nullable().optional().default(null),
});

export const desktopDevicePolicyOverrideResponseSchema = z.object({
  device: desktopRegisteredDeviceSummarySchema,
  policySnapshot: desktopHostPolicySnapshotSchema,
});

export const desktopPackageCatalogItemSchema = z.object({
  packageId: z.string().min(1),
  name: z.string().min(1),
  packageType: desktopCatalogPackageTypeSchema,
  runtimeDestination: desktopCatalogRuntimeDestinationSchema,
  trustClass: desktopPackageTrustClassSchema,
  state: desktopPackageStateSchema,
  version: z.string().min(1),
  signerId: z.string().min(1),
  signerKeyVersion: z.string().min(1),
  summary: z.string().min(1).nullable().optional().default(null),
  availableOnDesktop: z.boolean().default(true),
  source: z.enum(["skill_registry", "agency_registry", "built_in"]).default("skill_registry"),
});

export const desktopPackageCatalogResponseSchema = z.object({
  generatedAt: z.string().datetime(),
  packages: z.array(desktopPackageCatalogItemSchema).default([]),
});

export const desktopDeviceControlPlaneStateSchema = z.object({
  device: desktopRegisteredDeviceSummarySchema,
  policySnapshot: desktopHostPolicySnapshotSchema,
});

export const desktopHostSupersessionMatrix = {
  "004-desktop-app": {
    status: "compatibility_only",
    note: "Legacy localhost proxy remains migration-only until Desktop Host reaches rollout parity.",
  },
  "070-local-client-llm-mode": {
    status: "active_alignment",
    note: "Locality labels must remain truthful; server-assisted runs must surface as hybrid.",
  },
  "071-openclaw-external-runtime-integration": {
    status: "active_alignment",
    note: "Worker fabric compatibility remains available through desktop_zeroclaw_managed projection.",
  },
  "072-claw-worker-platform-access": {
    status: "active_alignment",
    note: "Desktop Host uses HTTP-first and MCP-second transport posture for platform access.",
  },
  "073-claw-worker-platform-access-hardening": {
    status: "compatibility_only",
    note: "Desktop Host owns stricter device-bound policy snapshots instead of reusing legacy bootstrap assumptions.",
  },
  "074-claw-worker-mcp-platform-completion": {
    status: "active_alignment",
    note: "MCP remains secondary to HTTP for Desktop Host and internal runtimes.",
  },
} as const;

export type DesktopPackageTrustClass = z.infer<typeof desktopPackageTrustClassSchema>;
export type DesktopPackageState = z.infer<typeof desktopPackageStateSchema>;
export type RunSurfaceLabel = z.infer<typeof runSurfaceLabelSchema>;
export type RunRuntimeLabel = z.infer<typeof runRuntimeLabelSchema>;
export type RunLocalityLabel = z.infer<typeof runLocalityLabelSchema>;
export type RunWorkspaceLabel = z.infer<typeof runWorkspaceLabelSchema>;
export type DesktopEnrollmentTokenUse = z.infer<typeof desktopEnrollmentTokenUseSchema>;
export type DesktopEnrollmentChallengePurpose = z.infer<
  typeof desktopEnrollmentChallengePurposeSchema
>;
export type DesktopEnrollmentProofKind = z.infer<
  typeof desktopEnrollmentProofKindSchema
>;
export type DesktopRootWritebackMode = z.infer<typeof desktopRootWritebackModeSchema>;
export type DesktopStorageProtection = z.infer<typeof desktopStorageProtectionSchema>;
export type DesktopDeviceAttestationMode = z.infer<
  typeof desktopDeviceAttestationModeSchema
>;
export type DesktopParserIsolationMode = z.infer<
  typeof desktopParserIsolationModeSchema
>;
export type DesktopPackageSyncStatus = z.infer<
  typeof desktopPackageSyncStatusSchema
>;
export type DesktopManagedActionType = z.infer<
  typeof desktopManagedActionTypeSchema
>;
export type DesktopManagedActionStatus = z.infer<
  typeof desktopManagedActionStatusSchema
>;
export type DesktopDeviceHealthStatus = z.infer<typeof desktopDeviceHealthStatusSchema>;
export type DesktopDeviceAccessState = z.infer<typeof desktopDeviceAccessStateSchema>;
export type DesktopDevicePresenceStatus = z.infer<typeof desktopDevicePresenceStatusSchema>;
export type DesktopWorkspaceNetworkClass = z.infer<
  typeof desktopWorkspaceNetworkClassSchema
>;
export type DesktopWorkspaceProfileName = z.infer<
  typeof desktopWorkspaceProfileNameSchema
>;
export type DesktopRunSelection = z.infer<typeof desktopRunSelectionSchema>;
export type DesktopRunReason = z.infer<typeof desktopRunReasonSchema>;
export type DesktopConnectorAction = z.infer<typeof desktopConnectorActionSchema>;
export type DesktopHighRiskAction = z.infer<typeof desktopHighRiskActionSchema>;
export type DesktopApprovalDecision = z.infer<typeof desktopApprovalDecisionSchema>;
export type DesktopHostFeatureFlags = z.infer<typeof desktopHostFeatureFlagsSchema>;
export type DesktopHostPolicySnapshot = z.infer<typeof desktopHostPolicySnapshotSchema>;
export type DesktopDeviceRegistrationPayload = z.infer<
  typeof desktopDeviceRegistrationPayloadSchema
>;
export type DesktopDeviceHeartbeatPayload = z.infer<
  typeof desktopDeviceHeartbeatPayloadSchema
>;
export type DesktopDevicePlatform = z.infer<typeof desktopDevicePlatformSchema>;
export type DesktopLocalRoot = z.infer<typeof desktopLocalRootSchema>;
export type DesktopDerivedStorePolicy = z.infer<
  typeof desktopDerivedStorePolicySchema
>;
export type DesktopOffboardingPlan = z.infer<typeof desktopOffboardingPlanSchema>;
export type DesktopDeviceDisableRequest = z.infer<
  typeof desktopDeviceDisableRequestSchema
>;
export type DesktopRuntimeTokenBinding = z.infer<
  typeof desktopRuntimeTokenBindingSchema
>;
export type DesktopEnrollmentChallenge = z.infer<
  typeof desktopEnrollmentChallengeSchema
>;
export type DesktopEnrollmentChallengeRequest = z.infer<
  typeof desktopEnrollmentChallengeRequestSchema
>;
export type DesktopEnrollmentVerifyRequest = z.infer<
  typeof desktopEnrollmentVerifyRequestSchema
>;
export type DesktopEnrollmentVerifyResponse = z.infer<
  typeof desktopEnrollmentVerifyResponseSchema
>;
export type DesktopDeviceIdentity = z.infer<typeof desktopDeviceIdentitySchema>;
export type DesktopDeviceIdentityCapability = z.infer<
  typeof desktopDeviceIdentityCapabilitySchema
>;
export type DesktopLocalFileParserCapability = z.infer<
  typeof desktopLocalFileParserCapabilitySchema
>;
export type DesktopManagedAction = z.infer<typeof desktopManagedActionSchema>;
export type DesktopPackageSyncState = z.infer<
  typeof desktopPackageSyncStateSchema
>;
export type DesktopCapabilitySnapshot = z.infer<
  typeof desktopCapabilitySnapshotSchema
>;
export type DesktopWorkspaceProfile = z.infer<
  typeof desktopWorkspaceProfileSchema
>;
export type DesktopCapabilityManifest = z.infer<
  typeof desktopCapabilityManifestSchema
>;
export type DesktopApprovalRule = z.infer<typeof desktopApprovalRuleSchema>;
export type DesktopRunLabels = z.infer<typeof desktopRunLabelsSchema>;
export type DesktopRunSelectionResult = z.infer<
  typeof desktopRunSelectionResultSchema
>;
export type DesktopDeviceRunSummary = z.infer<
  typeof desktopDeviceRunSummarySchema
>;
export type DesktopRolloutGateState = z.infer<
  typeof desktopRolloutGateStateSchema
>;
export type DesktopDeviceOwner = z.infer<typeof desktopDeviceOwnerSchema>;
export type DesktopDevicePresence = z.infer<typeof desktopDevicePresenceSchema>;
export type DesktopDevicePolicyOverrides = z.infer<
  typeof desktopDevicePolicyOverridesSchema
>;
export type DesktopRegisteredDeviceSummary = z.infer<
  typeof desktopRegisteredDeviceSummarySchema
>;
export type DesktopHostDeviceStatusResponse = z.infer<
  typeof desktopHostDeviceStatusResponseSchema
>;
export type DesktopDeviceDisableResponse = z.infer<
  typeof desktopDeviceDisableResponseSchema
>;
export type DesktopRootActionRequest = z.infer<
  typeof desktopRootActionRequestSchema
>;
export type DesktopRootActionResponse = z.infer<
  typeof desktopRootActionResponseSchema
>;
export type DesktopDeviceActionRequest = z.infer<
  typeof desktopDeviceActionRequestSchema
>;
export type DesktopDeviceActionResponse = z.infer<
  typeof desktopDeviceActionResponseSchema
>;
export type DesktopDevicePolicyOverrideRequest = z.infer<
  typeof desktopDevicePolicyOverrideRequestSchema
>;
export type DesktopDevicePolicyOverrideResponse = z.infer<
  typeof desktopDevicePolicyOverrideResponseSchema
>;
export type DesktopPackageCatalogItem = z.infer<
  typeof desktopPackageCatalogItemSchema
>;
export type DesktopPackageCatalogResponse = z.infer<
  typeof desktopPackageCatalogResponseSchema
>;
export type DesktopDeviceControlPlaneState = z.infer<
  typeof desktopDeviceControlPlaneStateSchema
>;

export function resolveDesktopWorkerProjectionRuntimeType(
  enabled: boolean,
): typeof DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE | null {
  return enabled ? DESKTOP_HOST_WORKER_PROJECTION_RUNTIME_TYPE : null;
}
