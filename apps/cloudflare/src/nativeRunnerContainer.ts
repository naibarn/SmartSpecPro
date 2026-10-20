import { isCloudflareMediaProbeImage } from "../../../packages/shared/src/cloudflareMediaProbe";
import type { CanonicalJobEnvelope, CloudflareContainerBinding } from "./contracts";
import { CONTAINER_MEDIA_PROBE_CONTRACT, MAX_CONTAINER_PROBE_RESULT_BYTES, containerProbeScope,
  validateContainerProbeInput, validateContainerProbeResult, type ContainerProbeInput, type ContainerProbeResult } from "./containerMediaProbeContract";
import { buildRunnerContainerEnvironment, runnerContainerInstanceId, validateRunnerContainerAssignment, type RunnerContainerAssignment } from "./runnerContainer";

export type RunnerContainerRecord = { instanceId: string; scopeDigest: string; image: string; released: boolean; expiresAt: string };
type Storage = { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
type NativeContainer = Pick<Container, "running" | "images" | "inspect" | "start" | "destroy" | "getTcpPort" | "setInactivityTimeout">;
const RECORD_KEY = "canonical-runner-assignment";
export function isPinnedRunnerImage(value: string | undefined): value is string { return isCloudflareMediaProbeImage(value); }

/** Private DO lifecycle only. The existing scheduler owns admission/lease and
 * execution. No caller-selected command, image, egress or public start route. */
export class NativeRunnerContainerController {
  constructor(private readonly container: NativeContainer, private readonly storage: Storage, private readonly approvedImage: string) {}

  private image() {
    if (!isPinnedRunnerImage(this.approvedImage) || this.container.images.runner !== this.approvedImage) {
      throw new Error("RUNNER_CONTAINER_APPROVED_IMAGE_REQUIRED");
    }
    return this.approvedImage;
  }

  async start(assignment: RunnerContainerAssignment, beforeBoot?: () => Promise<void>) {
    validateRunnerContainerAssignment(assignment);
    const deadline = Date.parse(assignment.expiresAt ?? "");
    if (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now()+600_000) throw new Error("RUNNER_CONTAINER_DEADLINE_REQUIRED");
    if (assignment.resourceProfile !== "small") throw new Error("RUNNER_CONTAINER_RESOURCE_PROFILE_NOT_ADMITTED");
    const image = this.image(), instanceId = runnerContainerInstanceId(assignment);
    const scope = { instanceId, tenantId: assignment.tenantId, attemptId: assignment.attemptId, leaseId: assignment.leaseId,
      fencingVersion: assignment.fencingVersion, workspaceRef: assignment.workspaceRef, artifactRefs: assignment.artifactRefs,
      resourceProfile: assignment.resourceProfile, contractVersion: assignment.envelope.contract_version,
      businessAttempt: assignment.envelope.business_attempt, dispatchId: assignment.envelope.dispatch_id, dedupeKey: assignment.envelope.dedupe_key, expiresAt: assignment.expiresAt };
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(scope))));
    const scopeDigest = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
    const previous = await this.storage.get<RunnerContainerRecord>(RECORD_KEY);
    if (previous && (previous.instanceId !== instanceId || previous.scopeDigest !== scopeDigest || previous.image !== image || previous.released)) {
      throw new Error("RUNNER_CONTAINER_ASSIGNMENT_CONFLICT");
    }
    if (this.container.running && !previous) throw new Error("RUNNER_CONTAINER_UNOWNED_INSTANCE");
    if (this.container.running) {
      const provider = await this.container.inspect();
      if (!provider || provider.image !== image || provider.labels.scope !== scopeDigest) throw new Error("RUNNER_CONTAINER_PROVIDER_SCOPE_MISMATCH");
    }
    // Durable intent precedes the provider mutation; a lost response can only
    // reconcile the same assignment/image, never adopt an unknown instance.
    if (!previous) await this.storage.put(RECORD_KEY, { instanceId, scopeDigest, image, released: false, expiresAt: assignment.expiresAt! });
    await beforeBoot?.();
    if (!this.container.running) {
      this.container.start({ image, enableInternet: false, instance: "lite",
        env: { ...buildRunnerContainerEnvironment({ ...assignment, runnerId: `container:${assignment.envelope.job_id}` }),
          SAH_RUNNER_HEALTH_PORT: "8787", SAH_RUNNER_TENANT_ID: assignment.tenantId,
          SAH_RUNNER_FENCING_VERSION: String(assignment.fencingVersion), SAH_RUNNER_EXPIRES_AT_MS: String(deadline) }, labels: { scope: scopeDigest } });
    }
    await this.container.setInactivityTimeout(60_000);
    return { id: instanceId, status: "starting" };
  }

  async inspect(instanceId: string, deadline = Date.now() + 2000) {
    const record = await this.storage.get<RunnerContainerRecord>(RECORD_KEY);
    if (!record || record.instanceId !== instanceId) return null;
    if (Date.parse(record.expiresAt) <= Date.now()) { await this.stop(instanceId); return { id: instanceId, status: "stopped" }; }
    if (record.released) return { id: instanceId, status: "stopped" };
    if (!this.container.running) return { id: instanceId, status: "stopped" };
    const provider = await this.container.inspect();
    if (!provider || provider.image !== record.image || provider.labels.scope !== record.scopeDigest) {
      throw new Error("RUNNER_CONTAINER_PROVIDER_SCOPE_MISMATCH");
    }
    const response = await this.container.getTcpPort(8787).fetch("http://runner.internal/health/runner", { signal: AbortSignal.timeout(Math.max(1, Math.min(2000, deadline - Date.now()))) });
    if (!response.ok || (Number(response.headers.get("content-length")) > 1024)) throw new Error("RUNNER_CONTAINER_HEALTH_UNAVAILABLE");
    const text = await response.text(); if (text.length > 1024) throw new Error("RUNNER_CONTAINER_HEALTH_UNAVAILABLE");
    const body = JSON.parse(text);
    if (body?.state !== "ready" || body?.profile !== "shared_container") throw new Error("RUNNER_CONTAINER_HEALTH_UNAVAILABLE");
    return { id: instanceId, status: "ready", capabilities: Array.isArray(body.capabilities) ? body.capabilities : [] };
  }

  async probeMedia(assignment: RunnerContainerAssignment, input: ContainerProbeInput, prepare: (action: () => Promise<void>) => Promise<void> = action => action()): Promise<ContainerProbeResult> {
    // Private RPC must follow an already-admitted, alarm-protected start.
    await prepare(async () => {
      const record = await this.storage.get<RunnerContainerRecord>(RECORD_KEY);
      if (!record || record.instanceId !== runnerContainerInstanceId(assignment) || record.released) throw new Error("RUNNER_CONTAINER_ASSIGNMENT_CONFLICT");
      await validateContainerProbeInput(input);
      await this.start(assignment); // Recheck ownership under the short DO concurrency gate.
    });
    const deadline = Date.parse(assignment.expiresAt!);
    const bootDeadline = Math.min(deadline, Date.now() + 10_000);
    let ready = false;
    for (let attempt = 0; attempt < 40 && Date.now() < bootDeadline; attempt++) {
      try {
        const health = await this.inspect(runnerContainerInstanceId(assignment), bootDeadline);
        ready = health?.status === "ready" && health.capabilities?.includes(CONTAINER_MEDIA_PROBE_CONTRACT) === true;
      } catch { /* bounded boot/readiness retry */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (!ready || Date.now() >= deadline) throw new Error("CONTAINER_PROBE_NOT_READY");
    const response = await this.container.getTcpPort(8787).fetch("http://runner.internal/v1/media/probe", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ contractVersion: CONTAINER_MEDIA_PROBE_CONTRACT, scope: containerProbeScope(assignment), input }),
      signal: AbortSignal.timeout(Math.min(32_000, Math.max(1, deadline-Date.now()))),
    });
    if (!response.ok || Number(response.headers.get("content-length")) > MAX_CONTAINER_PROBE_RESULT_BYTES || !response.body) {
      await response.body?.cancel(); throw new Error("CONTAINER_PROBE_EXECUTION_UNAVAILABLE");
    }
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let body = "", size = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_CONTAINER_PROBE_RESULT_BYTES) { await reader.cancel(); throw new Error("CONTAINER_PROBE_RESULT_TOO_LARGE"); }
        body += decoder.decode(part.value, { stream: true });
      }
      body += decoder.decode();
    } finally { reader.releaseLock(); }
    return validateContainerProbeResult(JSON.parse(body), assignment, input.checksumSha256);
  }

  async stop(instanceId: string) {
    const record = await this.storage.get<RunnerContainerRecord>(RECORD_KEY);
    if (!record || record.instanceId !== instanceId) throw new Error("RUNNER_CONTAINER_ASSIGNMENT_CONFLICT");
    if (record.released) return;
    await this.container.destroy();
    await this.storage.put(RECORD_KEY, { ...record, released: true });
  }
  async expire() {
    const record = await this.storage.get<RunnerContainerRecord>(RECORD_KEY);
    if (record && !record.released && Date.parse(record.expiresAt) <= Date.now()) await this.stop(record.instanceId);
  }
}

export type NativeRunnerContainerStub = {
  startRunner(assignment: RunnerContainerAssignment): Promise<{ id: string; status: string }>;
  inspectRunner(instanceId: string): Promise<{ id: string; status: string } | null>;
  stopRunner(instanceId: string): Promise<void>;
  probeMedia?(assignment: RunnerContainerAssignment, input: ContainerProbeInput): Promise<ContainerProbeResult>;
};
export type NativeRunnerContainerNamespace = { idFromName(name: string): unknown; get(id: unknown): NativeRunnerContainerStub };

/** Map the actual DurableObject namespace API to the existing provider port. */
export function createNativeRunnerContainerBinding(namespace: NativeRunnerContainerNamespace): CloudflareContainerBinding {
  const stub = (id: string) => namespace.get(namespace.idFromName(id));
  return {
    async start({ instanceId, envelope, assignment }) {
      if (!assignment) throw new Error("RUNNER_CONTAINER_ASSIGNMENT_REQUIRED");
      validateRunnerContainerAssignment(assignment);
      if (instanceId !== runnerContainerInstanceId(assignment) || !sameEnvelope(envelope, assignment.envelope)) throw new Error("RUNNER_CONTAINER_ASSIGNMENT_CONFLICT");
      const result = await stub(instanceId).startRunner(assignment);
      if (result?.id !== instanceId) throw new Error("RUNNER_CONTAINER_PROVIDER_SCOPE_MISMATCH");
      return result;
    },
    async find(instanceId) {
      const result = await stub(instanceId).inspectRunner(instanceId);
      if (result && result.id !== instanceId) throw new Error("RUNNER_CONTAINER_PROVIDER_SCOPE_MISMATCH");
      return result;
    },
    stop: instanceId => stub(instanceId).stopRunner(instanceId),
    async probeMedia(assignment, input) {
      validateRunnerContainerAssignment(assignment);
      await validateContainerProbeInput(input);
      const target = stub(runnerContainerInstanceId(assignment));
      if (typeof target.probeMedia !== "function") throw new Error("CONTAINER_PROBE_EXECUTION_UNAVAILABLE");
      const result = await target.probeMedia(assignment, input);
      return validateContainerProbeResult(result, assignment, input.checksumSha256);
    },
  };
}
function sameEnvelope(left: CanonicalJobEnvelope, right: CanonicalJobEnvelope) {
  return left.job_id === right.job_id && left.business_attempt === right.business_attempt && left.attempt_id === right.attempt_id &&
    left.contract_version === right.contract_version && left.dispatch_id === right.dispatch_id && left.dedupe_key === right.dedupe_key;
}
