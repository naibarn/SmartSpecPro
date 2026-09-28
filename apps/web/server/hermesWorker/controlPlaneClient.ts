/**
 * Feature 135 — Hermes Grok media worker (section 07): typed HTTP client for
 * the worker control plane, mirroring the desktop Worker App's Rust client
 * (`apps/worker-app/src-tauri/src/worker_control_plane.rs`) shapes exactly —
 * this worker speaks the SAME endpoints as an ordinary external worker (see
 * `server/routes/workerRuntime.ts`).
 *
 * Credential model: the pairing script (`scripts/pair-hermes-worker.ts`)
 * performs the ONE-TIME `/api/workers/register` call and hands the operator
 * a `refreshToken` (persisted as `HERMES_WORKER_TOKEN` in the unit's
 * `EnvironmentFile`). This client never persists tokens to disk — it holds
 * short-lived `executionToken`/`uploadToken` in memory, minted via
 * `/api/workers/connect/refresh` at first use and re-minted once on any 401
 * (mirroring the Rust client's refresh-and-retry, spec §6.1). No device-proof
 * headers are sent — the worker is registered WITHOUT a `deviceBinding`
 * (server-side controlled headless worker), so the server's
 * `assertDeviceProof` short-circuits (see `workerAuthService.ts`).
 *
 * No `db` import — see `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import {
  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
  WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
  WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
  WORKER_RUNTIME_PROTOCOL_VERSION,
} from "../../shared/workerRuntime";

export class HermesControlPlaneError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HermesControlPlaneError";
    this.status = status;
    this.code = code;
  }
}

export interface HermesRegisterInput {
  displayName: string;
  externalReference: string;
  runtimeVersion: string;
  machineId?: string | null;
  machineName?: string | null;
  maxConcurrentJobs: number;
  /** Only `true` once the local doctor gate (`provisionHermes`) passed. */
  doctorOk: boolean;
  hermesVersion: string;
  hermesReason?: string;
}

export interface HermesTokenSet {
  executionToken: string;
  uploadToken: string;
  refreshToken: string;
}

export interface HermesRegisterResult {
  created: boolean;
  workerId: string;
  tokens: HermesTokenSet;
}

interface HermesRegisterResponse {
  created: boolean;
  workerId?: string;
  worker?: { id?: string };
  tokens: HermesTokenSet;
}

export interface HermesReferenceUrl {
  assetId: string;
  url: string;
  expiresAt: string;
}

export interface HermesClaimedJob {
  id: string;
  jobType: string;
  tenantId: string;
  inputJson: Record<string, unknown>;
  instructionsJson: Record<string, unknown>;
  capabilityRequirementsJson: Record<string, unknown>;
  retryPolicyJson: Record<string, unknown> | null;
  timeoutSeconds: number | null;
  leaseOwnerToken: string;
  leaseExpiresAt: string | null;
  assignmentAttempt?: string | null;
  referenceUrls?: HermesReferenceUrl[];
  [key: string]: unknown;
}

export interface HermesClaimResult {
  job: HermesClaimedJob | null;
  queueDepth: number;
}

export interface HermesArtifactInitPayload {
  artifactType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  leaseOwnerToken: string;
  assignmentAttempt?: string | null;
}

export interface HermesArtifactInitResult {
  key: string;
  method: string;
  storageRef: string;
  uploadUrl?: string | null;
}

export interface HermesArtifactCompletePayload {
  artifactType: string;
  storageRef: string;
  checksumSha256: string;
  sizeBytes: number;
  contentType?: string | null;
  metadataJson?: Record<string, unknown>;
  leaseOwnerToken: string;
  assignmentAttempt?: string | null;
}

export interface HermesArtifactCompleteResult {
  created: boolean;
  artifact: Record<string, unknown>;
}

export interface HermesJobEventPayload {
  eventType: string;
  payloadJson?: Record<string, unknown>;
  leaseOwnerToken: string;
  assignmentAttempt?: string | null;
  sequenceNumber?: number | null;
}

export interface HermesJobEventResult {
  accepted: boolean;
  replayed: boolean;
  job: unknown;
}

export interface HermesControlPlaneClient {
  register(input: { bearerToken: string; payload: HermesRegisterInput }): Promise<HermesRegisterResult>;
  heartbeat(input: {
    freeDiskBytes: number;
    activeJobIds: string[];
    status?: string;
    /** Best-effort capability observability (spec §6.1 fallback path — see
     *  code review FIX 4): the server's `recordWorkerHeartbeat` merges this
     *  into `worker.capabilitiesJson.runtimeMetadata` (NOT the top-level
     *  `capabilitiesJson.hermesMedia` block the admission-time doctor/
     *  min-version gate actually reads — that block is set ONLY at
     *  `register()` time). Included here for admin-panel visibility of the
     *  worker's LIVE doctor state between (re-)registrations; never relied
     *  on for gating. */
    runtimeMetadataJson?: Record<string, unknown>;
  }): Promise<void>;
  claim(input: { capabilityHints?: string[] }): Promise<HermesClaimResult>;
  postEvent(jobId: string, event: HermesJobEventPayload): Promise<HermesJobEventResult>;
  initArtifact(jobId: string, payload: HermesArtifactInitPayload): Promise<HermesArtifactInitResult>;
  completeArtifact(jobId: string, payload: HermesArtifactCompletePayload): Promise<HermesArtifactCompleteResult>;
  refreshReferenceUrls(
    jobId: string,
    params: { leaseOwnerToken: string; assignmentAttempt?: string | null },
  ): Promise<HermesReferenceUrl[]>;
}

export interface HermesControlPlaneClientConfig {
  baseUrl: string;
  workerId: string;
  /** The long-lived (7d) refresh token — never logged. */
  refreshToken: string;
  fetchImpl?: typeof fetch;
  /** Seeds the in-memory execution/upload pair so tests (and a warm
   *  restart within the same process) can skip an extra refresh round-trip. */
  initialTokens?: { executionToken: string; uploadToken: string };
  /** Persist every rotated refresh token before the client relies on the
   * short-lived execution/upload pair. Required by restartable headless
   * workers because the refresh endpoint revokes the previous token. */
  persistRefreshToken?: (refreshToken: string) => Promise<void>;
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const errorField = body.error as Record<string, unknown> | undefined;
    const code = (errorField?.code as string | undefined) ?? (body.code as string | undefined) ?? "unknown_error";
    const message =
      (errorField?.message as string | undefined) ?? (body.message as string | undefined) ?? response.statusText;
    return { code, message };
  } catch {
    return { code: "unknown_error", message: response.statusText };
  }
}

export function createControlPlaneClient(cfg: HermesControlPlaneClientConfig): HermesControlPlaneClient {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  let executionToken = cfg.initialTokens?.executionToken ?? null;
  let uploadToken = cfg.initialTokens?.uploadToken ?? null;
  let refreshToken = cfg.refreshToken;
  let refreshInFlight: Promise<void> | null = null;

  async function refreshTokens(): Promise<void> {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        const response = await fetchImpl(`${cfg.baseUrl}/api/workers/connect/refresh`, {
          method: "POST",
          headers: { authorization: `Bearer ${refreshToken}`, "content-type": "application/json" },
          body: "{}",
        });
        if (!response.ok) {
          const { code, message } = await parseErrorBody(response);
          throw new HermesControlPlaneError(response.status, code, message);
        }
        const body = (await response.json()) as { tokens: HermesTokenSet };
        refreshToken = body.tokens.refreshToken;
        await cfg.persistRefreshToken?.(refreshToken);
        executionToken = body.tokens.executionToken;
        uploadToken = body.tokens.uploadToken;
      })().finally(() => {
        refreshInFlight = null;
      });
    }
    return refreshInFlight;
  }

  async function ensureToken(kind: "execution" | "upload"): Promise<string> {
    const current = kind === "execution" ? executionToken : uploadToken;
    if (current) return current;
    await refreshTokens();
    const refreshed = kind === "execution" ? executionToken : uploadToken;
    if (!refreshed) {
      throw new HermesControlPlaneError(401, "worker_auth_invalid", "Failed to obtain a Hermes worker access token");
    }
    return refreshed;
  }

  async function request<T>(
    kind: "execution" | "upload" | "bearer",
    method: "GET" | "POST",
    path: string,
    body: unknown,
    explicitBearer?: string,
  ): Promise<T> {
    const doFetch = async (bearer: string): Promise<Response> =>
      fetchImpl(`${cfg.baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

    const bearer = kind === "bearer" ? explicitBearer! : await ensureToken(kind === "upload" ? "upload" : "execution");
    let response = await doFetch(bearer);

    if (response.status === 401 && kind !== "bearer") {
      // One token-refresh-and-retry, mirroring the Rust client.
      if (kind === "execution") executionToken = null;
      if (kind === "upload") uploadToken = null;
      await refreshTokens();
      const retryBearer = await ensureToken(kind === "upload" ? "upload" : "execution");
      response = await doFetch(retryBearer);
    }

    if (!response.ok) {
      const { code, message } = await parseErrorBody(response);
      throw new HermesControlPlaneError(response.status, code, message);
    }
    return (await response.json()) as T;
  }

  return {
    async register({ bearerToken, payload }) {
      // Wire shape matches `shared/workerRuntime.ts`'s
      // `workerRegistrationPayloadSchema` — `capabilitiesJson.hermesMedia`
      // only advertises `advertised: true` once the local doctor gate
      // (`provisionHermes`) has actually passed (spec §6.2).
      const body = {
        compatibility: {
          protocolVersion: WORKER_RUNTIME_PROTOCOL_VERSION,
          runtimeVersion: payload.runtimeVersion,
          runtimeFamilySchemaVersion: WORKER_RUNTIME_FAMILY_SCHEMA_VERSION,
          runtimeProfileSchemaVersion: WORKER_RUNTIME_PROFILE_SCHEMA_VERSION,
        },
        runtimeType: "hermes_agent_gateway",
        workerMode: "per_user",
        displayName: payload.displayName,
        externalReference: payload.externalReference,
        runtimeMode: "external_managed",
        machineId: payload.machineId ?? null,
        machineName: payload.machineName ?? null,
        capabilitiesJson: {
          maxConcurrentJobs: payload.maxConcurrentJobs,
          hermesMedia: {
            capability: "hermes-media-generation",
            advertised: payload.doctorOk,
            reason: payload.doctorOk ? (payload.hermesReason ?? null) : (payload.hermesReason ?? "hermes doctor gate did not pass"),
            hermesVersion: payload.hermesVersion,
          },
        },
        runtimeMetadataJson: {
          hermesVersion: payload.hermesVersion,
          profileName: "smartspec-shared",
          profileLabel: "SmartSpec shared Grok media",
          profilePurpose: "Tenant-scoped Grok image and video generation",
          apiServerEnabled: false,
          terminalBackend: "subprocess",
          hostPlatform: process.platform,
          hostExecutionMode: "systemd",
        },
      };
      const result = await request<HermesRegisterResponse>(
        "bearer",
        "POST",
        "/api/workers/register",
        body,
        bearerToken,
      );
      const workerId = result.workerId ?? result.worker?.id;
      if (!workerId) {
        throw new HermesControlPlaneError(
          502,
          "worker_registration_invalid_response",
          "Worker registration response did not include a worker id",
        );
      }
      return {
        created: result.created,
        workerId,
        tokens: result.tokens,
      };
    },

    async heartbeat({ freeDiskBytes, activeJobIds, status, runtimeMetadataJson }) {
      await request<unknown>("execution", "POST", `/api/workers/${cfg.workerId}/heartbeat`, {
        compatibility: { runtimeVersion: "0.1.0" },
        runtimeType: "hermes_agent_gateway",
        status: status ?? "online",
        currentJobCount: activeJobIds.length,
        queueDepth: 0,
        freeDiskBytes,
        ...(runtimeMetadataJson ? { runtimeMetadataJson } : {}),
      });
    },

    async claim({ capabilityHints }) {
      return request<HermesClaimResult>("execution", "POST", `/api/workers/${cfg.workerId}/jobs/claim`, {
        maxJobs: 1,
        capabilityHints: capabilityHints ?? [HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY],
      });
    },

    async postEvent(jobId, event) {
      return request<HermesJobEventResult>("execution", "POST", `/api/worker-jobs/${jobId}/events`, event);
    },

    async initArtifact(jobId, payload) {
      return request<HermesArtifactInitResult>("upload", "POST", `/api/worker-jobs/${jobId}/artifacts/init-upload`, payload);
    },

    async completeArtifact(jobId, payload) {
      return request<HermesArtifactCompleteResult>("upload", "POST", `/api/worker-jobs/${jobId}/artifacts/complete`, payload);
    },

    async refreshReferenceUrls(jobId, params) {
      const result = await request<{ referenceUrls: HermesReferenceUrl[] }>(
        "execution",
        "POST",
        `/api/worker-jobs/${jobId}/references/urls`,
        params,
      );
      return result.referenceUrls;
    },
  };
}
