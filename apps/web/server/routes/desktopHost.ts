import type { Express, Request } from "express";
import { Router } from "express";
import { eq } from "drizzle-orm";

import {
  buildDesktopLocalRootPolicy,
  buildDesktopOffboardingPlan,
  buildDesktopRolloutGateStates,
  buildDesktopWorkspaceProfile,
  buildManagedDesktopHostPolicySnapshot,
  type BuildManagedDesktopHostPolicySnapshotInput,
} from "../services/desktopPolicyService";
import {
  buildDesktopAsymmetricProofDigest,
  buildDesktopRuntimeTokenBinding,
  createDesktopEnrollmentChallenge,
  verifyDesktopAsymmetricEnrollmentProof,
  verifyDesktopEnrollmentProof,
} from "../services/deviceEnrollmentService";
import {
  DesktopDeviceRegistryError,
  disableDesktopDevice,
  getDesktopDeviceByIdForTenant,
  listDesktopDevicesForActor,
  listTenantDesktopDevicesForActor,
  queueDesktopDeviceAction,
  queueDesktopRootAction,
  recordDesktopDeviceHeartbeat,
  registerDesktopDevice,
  summarizeDesktopDeviceRecord,
  updateDesktopDevicePolicyOverrides,
} from "../services/desktopDeviceRegistryService";
import {
  buildDesktopAgencyCatalogItem,
  buildDesktopAgencyPackEnvelope,
  buildDesktopSkillCatalogItem,
  buildDesktopSkillPackageEnvelope,
  resolveDesktopPublishedSkillTrustClass,
  resolveDesktopPublishedSkillVersion,
} from "../services/desktopPackageRegistryService";
import { evaluateDesktopManagedRollout } from "../services/desktopRolloutGates";
import {
  resolveConfiguredDesktopTrustedSigners,
  type DesktopUpdateDescriptor,
  verifyDesktopUpdateDescriptor,
} from "../services/desktopUpdateService";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import {
  getAvailableSkillsAsync,
  getSkillByIdAsync,
} from "../services/skillRegistry";
import type { SignedDesktopPackageEnvelope } from "../services/packageSigningService";
import {
  buildRevocationFeedSnapshot,
  resolveConfiguredDesktopRevocationFeed,
  type DesktopRevocationFeedSnapshot,
} from "../services/revocationFeedService";
import { buildAgencyDocumentFromRows } from "../services/agencyBuilderDocument";
import { sdk } from "../_core/sdk";
import {
  DESKTOP_HOST_PROTOCOL_VERSION,
  desktopDeviceActionRequestSchema,
  desktopDeviceActionResponseSchema,
  desktopDeviceControlPlaneStateSchema,
  desktopDeviceHeartbeatPayloadSchema,
  desktopDeviceDisableRequestSchema,
  desktopDevicePolicyOverrideRequestSchema,
  desktopDevicePolicyOverrideResponseSchema,
  desktopDeviceRegistrationPayloadSchema,
  desktopEnrollmentChallengeRequestSchema,
  desktopEnrollmentVerifyRequestSchema,
  desktopPackageCatalogResponseSchema,
  desktopRootActionRequestSchema,
} from "../../shared/desktopHost";
import { getDb } from "../db";
import {
  agencies,
  agencyAgents,
  agencyCommunicationFlows,
  agencySubgraphs,
} from "../../drizzle/schema";

export interface DesktopHostRouteDeps {
  resolvePolicy: (input: {
    tenantId: string;
    deviceId: string;
  }) => Promise<BuildManagedDesktopHostPolicySnapshotInput>;
  resolvePackageEnvelope: (input: {
    tenantId: string;
    packageId: string;
  }) => Promise<SignedDesktopPackageEnvelope | null>;
  resolveRevocationFeed: (input: {
    tenantId: string;
  }) => Promise<DesktopRevocationFeedSnapshot>;
  resolveTrustedSigners?: () => Promise<
    ReturnType<typeof resolveConfiguredDesktopTrustedSigners>
  >;
}

export function createDesktopHostRouter(deps: DesktopHostRouteDeps): Router {
  const router = Router();

  router.get("/policy/:tenantId/:deviceId", async (req, res) => {
    try {
      const policyInput = await deps.resolvePolicy({
        tenantId: req.params.tenantId,
        deviceId: req.params.deviceId,
      });
      res.json(buildManagedDesktopHostPolicySnapshot(policyInput));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_build_policy_snapshot",
      });
    }
  });

  router.get("/packages/:tenantId/:packageId", async (req, res) => {
    try {
      const envelope = await deps.resolvePackageEnvelope({
        tenantId: req.params.tenantId,
        packageId: req.params.packageId,
      });
      if (!envelope) {
        res.status(404).json({ error: "package_not_found" });
        return;
      }

      res.json(envelope);
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "failed_to_resolve_package",
      });
    }
  });

  router.get("/revocations/:tenantId", async (req, res) => {
    try {
      const snapshot = await deps.resolveRevocationFeed({
        tenantId: req.params.tenantId,
      });
      res.json(buildRevocationFeedSnapshot(snapshot));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_resolve_revocation_feed",
      });
    }
  });

  router.post("/local-files/root-policy", async (req, res) => {
    try {
      res.json(buildDesktopLocalRootPolicy(req.body ?? {}));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_build_root_policy",
      });
    }
  });

  router.post("/workspace-profile", async (req, res) => {
    try {
      res.json(buildDesktopWorkspaceProfile(req.body ?? {}));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_build_workspace_profile",
      });
    }
  });

  router.post("/offboarding-plan", async (req, res) => {
    try {
      res.json(buildDesktopOffboardingPlan(req.body ?? {}));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_build_offboarding_plan",
      });
    }
  });

  router.post("/rollout/evaluate", async (req, res) => {
    try {
      res.json(evaluateDesktopManagedRollout(req.body ?? {}));
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "failed_to_evaluate_rollout",
      });
    }
  });

  router.post("/security/update-verify", async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        descriptor?: unknown;
        allowDowngrade?: boolean;
      };
      const trustedSigners = deps.resolveTrustedSigners
        ? await deps.resolveTrustedSigners()
        : resolveConfiguredDesktopTrustedSigners();
      res.json(
        verifyDesktopUpdateDescriptor({
          descriptor: coerceDesktopUpdateDescriptor(body.descriptor ?? body),
          trustedSigners,
          allowDowngrade: body.allowDowngrade,
        })
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "failed_to_verify_update",
      });
    }
  });

  return router;
}

function coerceDesktopUpdateDescriptor(
  value: unknown
): DesktopUpdateDescriptor {
  const descriptor =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  if (!descriptor) {
    throw new Error("desktop update descriptor is required");
  }

  const currentVersion =
    typeof descriptor.currentVersion === "string"
      ? descriptor.currentVersion.trim()
      : "";
  const bundleVersion =
    typeof descriptor.bundleVersion === "string"
      ? descriptor.bundleVersion.trim()
      : "";
  const signerId =
    typeof descriptor.signerId === "string" ? descriptor.signerId.trim() : "";
  const signatureSha256 =
    typeof descriptor.signatureSha256 === "string"
      ? descriptor.signatureSha256.trim()
      : "";

  if (!currentVersion || !bundleVersion || !signerId || !signatureSha256) {
    throw new Error("desktop update descriptor is missing required fields");
  }

  return {
    currentVersion,
    bundleVersion,
    signerId,
    signatureSha256,
  };
}

function resolveDesktopPackageSigner() {
  const signerSecret =
    process.env.DESKTOP_PACKAGE_SIGNER_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "desktop-host-dev-signer-secret"
      : null);
  if (!signerSecret) {
    throw new Error("desktop package signer secret is not configured");
  }

  return {
    signerId:
      process.env.DESKTOP_PACKAGE_SIGNER_ID ?? "desktop-host-dev-signer",
    keyVersion:
      process.env.DESKTOP_PACKAGE_SIGNER_KEY_VERSION ??
      DESKTOP_HOST_PROTOCOL_VERSION,
    signerSecret,
  };
}

function extractTenantIdFromDesktopHostPath(pathname: string): string | null {
  if (pathname.startsWith("/policy/")) {
    return pathname.match(/^\/policy\/([^/]+)\/[^/]+$/)?.[1] ?? null;
  }
  if (pathname.startsWith("/packages/")) {
    return pathname.match(/^\/packages\/([^/]+)\/[^/]+$/)?.[1] ?? null;
  }
  if (pathname.startsWith("/revocations/")) {
    return pathname.match(/^\/revocations\/([^/]+)$/)?.[1] ?? null;
  }
  return null;
}

async function resolveDesktopAgencyPackageEnvelope(input: {
  tenantId: string;
  packageId: string;
}): Promise<SignedDesktopPackageEnvelope | null> {
  let db;
  try {
    db = getDb();
  } catch {
    return null;
  }

  const [agency] = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      tenantId: agencies.tenantId,
      documentVersion: agencies.documentVersion,
      defaultEngine: agencies.defaultEngine,
      compileMode: agencies.compileMode,
      compatibilityMode: agencies.compatibilityMode,
    })
    .from(agencies)
    .where(eq(agencies.id, input.packageId))
    .limit(1);

  if (
    !agency ||
    (agency.tenantId !== input.tenantId && agency.tenantId !== "__system__")
  ) {
    return null;
  }

  const [agentRows, flowRows, subgraphRows] = await Promise.all([
    db
      .select({
        id: agencyAgents.id,
        name: agencyAgents.name,
        description: agencyAgents.description,
        instructions: agencyAgents.instructions,
        nodeType: agencyAgents.nodeType,
        model: agencyAgents.model,
        isEntryPoint: agencyAgents.isEntryPoint,
        isOptional: agencyAgents.isOptional,
        position: agencyAgents.position,
        nodeConfig: agencyAgents.nodeConfig,
        outputSchema: agencyAgents.outputSchema,
        examples: agencyAgents.examples,
        parallelToolCalls: agencyAgents.parallelToolCalls,
        maxTurns: agencyAgents.maxTurns,
        subgraphId: agencyAgents.subgraphId,
        engineHint: agencyAgents.engineHint,
        runtimeConfig: agencyAgents.runtimeConfig,
      })
      .from(agencyAgents)
      .where(eq(agencyAgents.agencyId, input.packageId)),
    db
      .select({
        fromAgentId: agencyCommunicationFlows.fromAgentId,
        toAgentId: agencyCommunicationFlows.toAgentId,
        flowType: agencyCommunicationFlows.flowType,
        flowConfig: agencyCommunicationFlows.flowConfig,
      })
      .from(agencyCommunicationFlows)
      .where(eq(agencyCommunicationFlows.agencyId, input.packageId)),
    db
      .select({
        id: agencySubgraphs.subgraphKey,
        name: agencySubgraphs.name,
        engine: agencySubgraphs.engine,
        entryNodeIds: agencySubgraphs.entryNodeIds,
        exitNodeIds: agencySubgraphs.exitNodeIds,
        nodeIds: agencySubgraphs.nodeIds,
        boundaryPolicy: agencySubgraphs.boundaryPolicy,
      })
      .from(agencySubgraphs)
      .where(eq(agencySubgraphs.agencyId, input.packageId)),
  ]);

  const agentNames = new Map(agentRows.map(row => [row.id, row.name]));
  const document = buildAgencyDocumentFromRows({
    agency: {
      name: agency.name,
      documentVersion: agency.documentVersion,
      defaultEngine: agency.defaultEngine,
      compileMode: agency.compileMode,
      compatibilityMode: agency.compatibilityMode,
    },
    nodes: agentRows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      instructions: row.instructions ?? undefined,
      nodeType: row.nodeType ?? undefined,
      model: row.model ?? undefined,
      isEntryPoint: row.isEntryPoint ?? undefined,
      isOptional: row.isOptional ?? undefined,
      position: (row.position as { x: number; y: number } | null) ?? undefined,
      nodeConfig:
        (row.nodeConfig as Record<string, unknown> | null) ?? undefined,
      outputSchema:
        (row.outputSchema as Record<string, unknown> | null) ?? undefined,
      examples:
        (row.examples as Array<
          Array<{ role: "user" | "assistant"; content: string }>
        >) ?? undefined,
      parallelToolCalls: row.parallelToolCalls ?? undefined,
      maxTurns: row.maxTurns ?? undefined,
      subgraphId: row.subgraphId ?? undefined,
      engineHint:
        (row.engineHint as "agency_swarm" | "adk2" | null) ?? undefined,
      runtimeConfig:
        (row.runtimeConfig as Record<string, unknown> | null) ?? undefined,
    })),
    edges: flowRows.map(row => ({
      fromAgentName: agentNames.get(row.fromAgentId) ?? row.fromAgentId,
      toAgentName: agentNames.get(row.toAgentId) ?? row.toAgentId,
      flowType: row.flowType ?? undefined,
      flowConfig:
        (row.flowConfig as Record<string, unknown> | null) ?? undefined,
    })),
    subgraphs: subgraphRows.map(row => ({
      id: row.id,
      name: row.name,
      engine: row.engine as "agency_swarm" | "adk2",
      entryNodeIds: row.entryNodeIds ?? [],
      exitNodeIds: row.exitNodeIds ?? [],
      nodeIds: row.nodeIds ?? [],
      boundaryPolicy:
        (row.boundaryPolicy as Record<string, unknown> | null) ?? null,
    })),
  });

  return buildDesktopAgencyPackEnvelope({
    agencyId: agency.id,
    version: `${Math.max(document.documentVersion, 1)}.0.0`,
    trustClass:
      agency.tenantId === "__system__" ? "built_in_verified" : "org_verified",
    topology: document as unknown as Record<string, unknown>,
    instructions: {
      agencyName: document.name,
      agents: document.nodes.map(node => ({
        id: node.id ?? null,
        name: node.name,
        instructions: node.instructions ?? null,
      })),
    },
    capabilityManifest: {
      defaultEngine: document.defaultEngine,
      subgraphs: document.subgraphs.map(subgraph => ({
        id: subgraph.id,
        engine: subgraph.engine,
        nodeIds: subgraph.nodeIds,
      })),
    },
    policyDescriptor: {
      compileMode: document.settings.compileMode,
      compatibilityMode: document.settings.compatibilityMode,
      traceLevel: document.settings.traceLevel,
    },
    signer: resolveDesktopPackageSigner(),
  });
}

async function resolveDesktopAgencyCatalogItems(input: {
  tenantId: string;
  revocationFeed: DesktopRevocationFeedSnapshot;
}) {
  let db;
  try {
    db = getDb();
  } catch {
    return [];
  }

  const agenciesForTenant = await db
    .select({
      id: agencies.id,
      tenantId: agencies.tenantId,
      name: agencies.name,
      description: agencies.description,
      documentVersion: agencies.documentVersion,
      isPublished: agencies.isPublished,
      visibility: agencies.visibility,
    })
    .from(agencies);

  return agenciesForTenant
    .filter(
      agency =>
        agency.tenantId === input.tenantId ||
        agency.tenantId === "__system__" ||
        agency.visibility === "public" ||
        agency.isPublished
    )
    .map(agency =>
      buildDesktopAgencyCatalogItem({
        agencyId: agency.id,
        name: agency.name,
        summary: agency.description ?? null,
        version: `${Math.max(agency.documentVersion ?? 1, 1)}.0.0`,
        trustClass:
          agency.tenantId === "__system__"
            ? "built_in_verified"
            : "org_verified",
        signer: resolveDesktopPackageSigner(),
        revocationFeed: input.revocationFeed,
      })
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

export interface RegisterDesktopHostRoutesDeps {
  authenticateRequest?: (req: Request) => Promise<{
    id: string | number;
    currentTenantId?: string | number | null;
    role?: string | null;
  }>;
  getTenantFeatureFlags?: typeof getTenantFeatureFlags;
  getSkillByIdAsync?: typeof getSkillByIdAsync;
  registerDesktopDevice?: typeof registerDesktopDevice;
  recordDesktopDeviceHeartbeat?: typeof recordDesktopDeviceHeartbeat;
  getDesktopDeviceByIdForTenant?: typeof getDesktopDeviceByIdForTenant;
  disableDesktopDevice?: typeof disableDesktopDevice;
  listDesktopDevicesForActor?: typeof listDesktopDevicesForActor;
  listTenantDesktopDevicesForActor?: typeof listTenantDesktopDevicesForActor;
  updateDesktopDevicePolicyOverrides?: typeof updateDesktopDevicePolicyOverrides;
  queueDesktopDeviceAction?: typeof queueDesktopDeviceAction;
  queueDesktopRootAction?: typeof queueDesktopRootAction;
  getAvailableSkillsAsync?: typeof getAvailableSkillsAsync;
  now?: () => Date;
}

export function registerDesktopHostRoutes(
  app: Express,
  deps: RegisterDesktopHostRoutesDeps = {}
): void {
  const authenticateRequest =
    deps.authenticateRequest ?? sdk.authenticateRequest.bind(sdk);
  const getTenantFlags = deps.getTenantFeatureFlags ?? getTenantFeatureFlags;
  const lookupSkill = deps.getSkillByIdAsync ?? getSkillByIdAsync;
  const registerDesktopDeviceImpl =
    deps.registerDesktopDevice ?? registerDesktopDevice;
  const recordDesktopDeviceHeartbeatImpl =
    deps.recordDesktopDeviceHeartbeat ?? recordDesktopDeviceHeartbeat;
  const getDesktopDeviceByIdForTenantImpl =
    deps.getDesktopDeviceByIdForTenant ?? getDesktopDeviceByIdForTenant;
  const disableDesktopDeviceImpl =
    deps.disableDesktopDevice ?? disableDesktopDevice;
  const listDesktopDevicesForActorImpl =
    deps.listDesktopDevicesForActor ?? listDesktopDevicesForActor;
  const listTenantDesktopDevicesForActorImpl =
    deps.listTenantDesktopDevicesForActor ?? listTenantDesktopDevicesForActor;
  const updateDesktopDevicePolicyOverridesImpl =
    deps.updateDesktopDevicePolicyOverrides ??
    updateDesktopDevicePolicyOverrides;
  const queueDesktopDeviceActionImpl =
    deps.queueDesktopDeviceAction ?? queueDesktopDeviceAction;
  const queueDesktopRootActionImpl =
    deps.queueDesktopRootAction ?? queueDesktopRootAction;
  const listAvailableSkillsImpl =
    deps.getAvailableSkillsAsync ?? getAvailableSkillsAsync;
  const now = deps.now ?? (() => new Date());

  const writebackRank: Record<string, number> = {
    read_search_only: 0,
    managed_output_only: 1,
    user_confirmed_root_write: 2,
    advanced_local_override: 3,
  };

  function clampWritebackMode(
    currentMode: string,
    maximumMode: string | null | undefined
  ): string {
    if (
      !maximumMode ||
      writebackRank[maximumMode] == null ||
      writebackRank[currentMode] == null
    ) {
      return currentMode;
    }
    return writebackRank[currentMode] <= writebackRank[maximumMode]
      ? currentMode
      : maximumMode;
  }

  function applyDeviceOverridesToFeatureFlags(
    featureFlags: Awaited<ReturnType<typeof getTenantFlags>>,
    overrides:
      | ReturnType<typeof summarizeDesktopDeviceRecord>["policyOverrides"]
      | null
  ) {
    if (!overrides) {
      return featureFlags;
    }

    return {
      ...featureFlags,
      desktopAdvancedLocalMode:
        featureFlags.desktopAdvancedLocalMode &&
        overrides.allowAdvancedLocalMode !== false,
      desktopPackageSync:
        featureFlags.desktopPackageSync && overrides.allowPackageSync !== false,
      desktopAgencyRuntime:
        featureFlags.desktopAgencyRuntime &&
        overrides.allowAgencyRuntime !== false,
      desktopWorkerProjection:
        featureFlags.desktopWorkerProjection &&
        overrides.allowWorkerProjection !== false,
    };
  }

  async function buildTenantPolicySnapshot(
    tenantId: string,
    deviceId: string,
    workerProjectionEnabled?: boolean
  ): Promise<BuildManagedDesktopHostPolicySnapshotInput> {
    const tenantFeatureFlags = await getTenantFlags(tenantId);
    const device = await getDesktopDeviceByIdForTenantImpl({
      tenantId,
      deviceId,
    }).catch(() => null);
    const timestamp = now();
    const summarizedDevice = device
      ? summarizeDesktopDeviceRecord(device)
      : null;
    const effectiveFeatureFlags = applyDeviceOverridesToFeatureFlags(
      tenantFeatureFlags,
      summarizedDevice?.policyOverrides ?? null
    );
    const localRoots = (summarizedDevice?.localRoots ?? []).map(root => ({
      ...root,
      writebackMode: clampWritebackMode(
        root.writebackMode,
        summarizedDevice?.policyOverrides.outputWritebackMode ?? null
      ) as typeof root.writebackMode,
    }));
    const packageCachePath =
      summarizedDevice?.packageCachePaths[0] ??
      `/workspace/${deviceId}/packages`;
    const workspaceProfile =
      summarizedDevice?.currentWorkspaceProfile ??
      buildDesktopWorkspaceProfile({
        profileName: effectiveFeatureFlags.desktopAdvancedLocalMode
          ? "advanced_local"
          : "pi_sidecar_managed",
        projectWorkspacePath: `/workspace/${deviceId}`,
        packageCachePath,
        localRoots,
        needsConnectorSidecar: effectiveFeatureFlags.desktopAgencyRuntime,
        advancedLocalMode: effectiveFeatureFlags.desktopAdvancedLocalMode,
      });
    const effectiveWorkspaceProfile = {
      ...workspaceProfile,
      writebackMode: clampWritebackMode(
        workspaceProfile.writebackMode,
        summarizedDevice?.policyOverrides.outputWritebackMode ?? null
      ) as typeof workspaceProfile.writebackMode,
    };
    const effectiveWorkerProjectionEnabled =
      Boolean(
        workerProjectionEnabled ?? summarizedDevice?.workerProjectionEnabled
      ) &&
      effectiveFeatureFlags.desktopWorkerProjection &&
      summarizedDevice?.accessState !== "reauth_required" &&
      summarizedDevice?.accessState !== "quarantined" &&
      summarizedDevice?.accessState !== "disabled";

    return {
      tenantId,
      deviceId,
      policyVersion: `desktop-host-policy-${DESKTOP_HOST_PROTOCOL_VERSION}`,
      fetchedAt: timestamp.toISOString(),
      expiresAt: new Date(timestamp.getTime() + 60 * 60 * 1000).toISOString(),
      trustFreshnessTtlSeconds: 3600,
      featureFlags: effectiveFeatureFlags,
      localRoots,
      workerProjectionEnabled: effectiveWorkerProjectionEnabled,
      workspaceProfiles: [effectiveWorkspaceProfile],
      rolloutGates: buildDesktopRolloutGateStates({
        deviceBindingReady: device
          ? effectiveFeatureFlags.desktopHostEnabled &&
            !device.disabledAt &&
            summarizedDevice?.accessState !== "reauth_required" &&
            summarizedDevice?.accessState !== "quarantined"
          : effectiveFeatureFlags.desktopHostEnabled,
        signedPackagesEnforced: effectiveFeatureFlags.desktopPackageSync,
        signedUpdatesEnforced: true,
        managedFileRootsDefault: true,
        piGatewayOnly: effectiveFeatureFlags.desktopHostEnabled,
        agencyGatewayOnly: effectiveFeatureFlags.desktopAgencyRuntime,
        offboardingCleanupReady: true,
      }),
    };
  }

  async function assertDesktopHostEnabled(tenantId: string): Promise<void> {
    const featureFlags = await getTenantFlags(tenantId);
    if (!featureFlags.desktopHostEnabled) {
      throw new DesktopDeviceRegistryError(
        "feature_disabled",
        403,
        "Desktop Host is disabled for this tenant"
      );
    }
  }

  const router = Router();
  router.use(async (req, res, next) => {
    try {
      const user = await authenticateRequest(req);
      const tenantId = user.currentTenantId
        ? String(user.currentTenantId)
        : null;
      if (!tenantId) {
        res.status(403).json({ error: "desktop_host_tenant_required" });
        return;
      }

      const requestedTenantId = extractTenantIdFromDesktopHostPath(req.path);
      if (requestedTenantId && requestedTenantId !== tenantId) {
        res.status(403).json({ error: "desktop_host_tenant_mismatch" });
        return;
      }

      res.locals.desktopHostTenantId = tenantId;
      res.locals.desktopHostUserId = String(user.id);
      res.locals.desktopHostUserRole =
        typeof user.role === "string" ? user.role : null;
      next();
    } catch {
      res.status(401).json({ error: "desktop_host_auth_required" });
    }
  });

  router.post("/devices/register", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
      };
      const payload = desktopDeviceRegistrationPayloadSchema.parse(
        req.body ?? {}
      );
      const result = await registerDesktopDeviceImpl({ actor, payload });
      const policySnapshot = buildManagedDesktopHostPolicySnapshot(
        await buildTenantPolicySnapshot(
          actor.tenantId,
          payload.deviceId,
          Boolean(result.device.workerProjectionEnabled)
        )
      );

      res.status(result.created ? 201 : 200).json({
        ...result,
        policySnapshot,
      });
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "failed_to_register_device",
      });
    }
  });

  router.post("/devices/:deviceId/heartbeat", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
      };
      const payload = desktopDeviceHeartbeatPayloadSchema.parse(req.body ?? {});
      const result = await recordDesktopDeviceHeartbeatImpl({
        actor,
        deviceId: req.params.deviceId,
        payload,
      });
      const policySnapshot = buildManagedDesktopHostPolicySnapshot(
        await buildTenantPolicySnapshot(
          actor.tenantId,
          req.params.deviceId,
          Boolean(result.device.workerProjectionEnabled)
        )
      );

      res.json({
        ...result,
        policySnapshot,
      });
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_record_device_heartbeat",
      });
    }
  });

  router.post("/devices/:deviceId/disable", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      const payload = desktopDeviceDisableRequestSchema.parse(req.body ?? {});
      const result = await disableDesktopDeviceImpl({
        actor,
        deviceId: req.params.deviceId,
        payload,
      });
      res.json(result);
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error ? error.message : "failed_to_disable_device",
      });
    }
  });

  router.get("/devices", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      const featureFlags = await getTenantFlags(actor.tenantId);
      if (!featureFlags.desktopHostEnabled) {
        res.json({
          generatedAt: new Date().toISOString(),
          devices: [],
        });
        return;
      }
      const scope = req.query.scope === "tenant" ? "tenant" : "user";
      const status =
        scope === "tenant"
          ? await listTenantDesktopDevicesForActorImpl({ actor }, { now })
          : await listDesktopDevicesForActorImpl({ actor }, { now });
      res.json(status);
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_list_desktop_devices",
      });
    }
  });

  router.get("/devices/:deviceId/state", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      await assertDesktopHostEnabled(actor.tenantId);

      const device = await getDesktopDeviceByIdForTenantImpl({
        tenantId: actor.tenantId,
        deviceId: req.params.deviceId,
      });
      if (!device) {
        res.status(404).json({ error: "desktop_device_not_found" });
        return;
      }
      if (
        !["admin", "domain_admin", "system_agent"].includes(actor.role ?? "") &&
        device.userId != null &&
        String(device.userId) !== String(actor.userId)
      ) {
        res.status(403).json({ error: "desktop_device_forbidden" });
        return;
      }

      const policySnapshot = buildManagedDesktopHostPolicySnapshot(
        await buildTenantPolicySnapshot(
          actor.tenantId,
          req.params.deviceId,
          Boolean(device.workerProjectionEnabled)
        )
      );
      res.json(
        desktopDeviceControlPlaneStateSchema.parse({
          device: summarizeDesktopDeviceRecord(device),
          policySnapshot,
        })
      );
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_load_device_control_plane_state",
      });
    }
  });

  router.post("/devices/:deviceId/policy-overrides", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      await assertDesktopHostEnabled(actor.tenantId);
      const payload = desktopDevicePolicyOverrideRequestSchema.parse(
        req.body ?? {}
      );
      const device = await updateDesktopDevicePolicyOverridesImpl(
        {
          actor,
          deviceId: req.params.deviceId,
          overrides: payload.overrides,
          note: payload.note,
        },
        { now }
      );
      const policySnapshot = buildManagedDesktopHostPolicySnapshot(
        await buildTenantPolicySnapshot(
          actor.tenantId,
          req.params.deviceId,
          Boolean(device.workerProjectionEnabled)
        )
      );
      res.json(
        desktopDevicePolicyOverrideResponseSchema.parse({
          device,
          policySnapshot,
        })
      );
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_update_device_policy_overrides",
      });
    }
  });

  router.post("/devices/:deviceId/actions", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      await assertDesktopHostEnabled(actor.tenantId);
      const payload = desktopDeviceActionRequestSchema.parse(req.body ?? {});
      const result = await queueDesktopDeviceActionImpl(
        {
          actor,
          deviceId: req.params.deviceId,
          actionType: payload.actionType,
          note: payload.note,
        },
        { now }
      );
      res.json(desktopDeviceActionResponseSchema.parse(result));
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_queue_device_action",
      });
    }
  });

  router.post("/devices/:deviceId/roots/:rootId/actions", async (req, res) => {
    try {
      const actor = {
        tenantId: String(res.locals.desktopHostTenantId || ""),
        userId: String(res.locals.desktopHostUserId || ""),
        role:
          typeof res.locals.desktopHostUserRole === "string"
            ? String(res.locals.desktopHostUserRole)
            : null,
      };
      await assertDesktopHostEnabled(actor.tenantId);
      const payload = desktopRootActionRequestSchema.parse(req.body ?? {});
      const result = await queueDesktopRootActionImpl(
        {
          actor,
          deviceId: req.params.deviceId,
          rootId: req.params.rootId,
          actionType: payload.actionType,
          note: payload.note,
        },
        { now }
      );
      res.json(result);
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_queue_root_action",
      });
    }
  });

  router.get("/packages/catalog", async (_req, res) => {
    try {
      const tenantId = String(res.locals.desktopHostTenantId || "");
      await assertDesktopHostEnabled(tenantId);
      const featureFlags = await getTenantFlags(tenantId);
      if (!featureFlags.desktopPackageSync) {
        res.status(403).json({ error: "desktop_package_sync_disabled" });
        return;
      }

      const revocationFeed = resolveConfiguredDesktopRevocationFeed(
        now().toISOString()
      );
      const signer = resolveDesktopPackageSigner();
      const skills = await listAvailableSkillsImpl();
      const skillItems = skills
        .filter(skill => Boolean(skill.skillFilePath))
        .map(skill =>
          buildDesktopSkillCatalogItem({
            skill,
            signer,
            revocationFeed,
          })
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      const agencyItems = await resolveDesktopAgencyCatalogItems({
        tenantId,
        revocationFeed,
      });

      res.json(
        desktopPackageCatalogResponseSchema.parse({
          generatedAt: now().toISOString(),
          packages: [...skillItems, ...agencyItems],
        })
      );
    } catch (error) {
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_list_desktop_package_catalog",
      });
    }
  });

  router.post("/security/enrollment/challenge", async (req, res) => {
    try {
      const actorTenantId = String(res.locals.desktopHostTenantId || "");
      await assertDesktopHostEnabled(actorTenantId);
      const payload = desktopEnrollmentChallengeRequestSchema.parse(
        req.body ?? {}
      );
      const challenge = createDesktopEnrollmentChallenge({
        tenantId: actorTenantId,
        deviceId: payload.deviceId,
        devicePublicKey: payload.devicePublicKeyPem,
        purpose: payload.purpose,
        deviceKeyVersion: payload.deviceKeyVersion,
        ttlSeconds: payload.ttlSeconds,
      });

      res.status(201).json(challenge);
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_create_enrollment_challenge",
      });
    }
  });

  router.post("/security/enrollment/verify", async (req, res) => {
    try {
      const actorTenantId = String(res.locals.desktopHostTenantId || "");
      await assertDesktopHostEnabled(actorTenantId);
      const payload = desktopEnrollmentVerifyRequestSchema.parse(
        req.body ?? {}
      );
      if (payload.challenge.tenantId !== actorTenantId) {
        res.status(403).json({ error: "desktop_host_tenant_mismatch" });
        return;
      }

      const verified =
        payload.proofKind === "ed25519_signature"
          ? verifyDesktopAsymmetricEnrollmentProof({
              challenge: payload.challenge,
              signatureBase64: payload.signatureBase64 ?? "",
              devicePublicKeyPem: payload.devicePublicKeyPem,
            })
          : verifyDesktopEnrollmentProof({
              challenge: payload.challenge,
              proofSha256: payload.proofSha256 ?? "",
              devicePublicKey: payload.devicePublicKeyPem,
              deviceSharedSecret: payload.deviceSharedSecret ?? "",
            });

      const runtimeBinding = verified
        ? buildDesktopRuntimeTokenBinding({
            tenantId: payload.challenge.tenantId,
            deviceId: payload.challenge.deviceId,
            runtimeScope: payload.runtimeScope,
            challengeId: payload.challenge.challengeId,
            deviceKeyVersion: payload.challenge.deviceKeyVersion,
            proofSha256:
              payload.proofKind === "ed25519_signature"
                ? buildDesktopAsymmetricProofDigest(
                    payload.signatureBase64 ?? ""
                  )
                : (payload.proofSha256 ?? ""),
          })
        : null;

      res.json({
        verified,
        proofKind: payload.proofKind,
        challengeId: payload.challenge.challengeId,
        deviceId: payload.challenge.deviceId,
        runtimeBinding,
      });
    } catch (error) {
      if (error instanceof DesktopDeviceRegistryError) {
        res
          .status(error.statusCode)
          .json({ error: error.code, message: error.message });
        return;
      }
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "failed_to_verify_enrollment_proof",
      });
    }
  });

  router.use(
    createDesktopHostRouter({
      resolvePolicy: ({ tenantId, deviceId }) =>
        buildTenantPolicySnapshot(tenantId, deviceId),
      resolvePackageEnvelope: async ({ tenantId, packageId }) => {
        const featureFlags = await getTenantFlags(tenantId);
        if (!featureFlags.desktopPackageSync) {
          return null;
        }

        const skill = await lookupSkill(packageId);
        if (!skill) {
          return resolveDesktopAgencyPackageEnvelope({ tenantId, packageId });
        }

        return buildDesktopSkillPackageEnvelope({
          skill,
          trustClass: resolveDesktopPublishedSkillTrustClass(skill),
          version: resolveDesktopPublishedSkillVersion(skill),
          signer: resolveDesktopPackageSigner(),
        });
      },
      resolveRevocationFeed: async () =>
        resolveConfiguredDesktopRevocationFeed(now().toISOString()),
      resolveTrustedSigners: async () =>
        resolveConfiguredDesktopTrustedSigners(),
    })
  );

  app.use("/api/desktop-host", router);
}
