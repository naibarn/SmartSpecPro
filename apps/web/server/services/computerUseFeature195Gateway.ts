import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";

import type { TrpcContext } from "../_core/context";
import type { LiveBrowserRunnerExecutionRequest } from "../../shared/liveBrowser";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { resolveComputerUseRoute } from "./computerUseCapabilityRouting";
import { defaultRunnerGateway } from "./runnerGateway";
import { assertP213CertificationDescriptor, type P213CertificationDescriptor } from "./p213CertificationApproval";

function requestError(message: string): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message });
}

function assertSafeFixtureUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (!value.startsWith("https://smartaihub.app/")) {
    requestError("Computer Use certification fixture must be hosted by SmartAIHub");
  }
  return value;
}

/**
 * The producer boundary for P213. It resolves the current Runner capability
 * before admitting one ordinary Feature 195 worker_jobs record. No browser,
 * Playwright, or Runner adapter is callable from this Web/API path.
 */
export async function createCanonicalComputerUseBrowserJob(
  ctx: Pick<TrpcContext, "tenantId" | "user">,
  input: LiveBrowserRunnerExecutionRequest,
  options: {
    certificationDescriptor?: P213CertificationDescriptor;
    fixtureUrlOverride?: string;
    expectedSuccessCondition?: Record<string, unknown>;
  } = {},
): Promise<{
  jobId: string;
  created: boolean;
  traceId: string;
  computerUseRunId: string;
  route: "localRunner";
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
}> {
  if (!ctx.tenantId || !ctx.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authenticated tenant context is required" });
  }
  const tenantId = ctx.tenantId;
  if (options.certificationDescriptor) {
    assertP213CertificationDescriptor(options.certificationDescriptor, { tenantId, requesterId: ctx.user.id });
  }
  const node = await defaultRunnerGateway.getStatus({
    runnerId: input.runnerId,
    tenantId,
    profile: "local_device",
    nodeKind: "local_device",
    deviceId: null,
    ownerUserId: ctx.user.id,
    runnerSessionId: null,
  });
  if (node.ownerUserId !== ctx.user.id) requestError("Runner is not owned by the authenticated user");

  const snapshot = node.currentSnapshot;
  const browser = snapshot?.computerUse?.browser;
  const manifest = browser?.manifest;
  const fresh = Boolean(snapshot && Date.parse(snapshot.expiresAt) > Date.now());
  const ready = Boolean(
    node.profile === "local_device" &&
      node.trustState === "trusted" &&
      node.status === "online" &&
      !node.revokedAt &&
      node.activeSessionId &&
      snapshot?.runnerSessionId === node.activeSessionId &&
      snapshot.capabilitySnapshotId &&
      node.currentSnapshotRevision &&
      fresh &&
      browser?.availabilityState === "available" &&
      browser.authState === "authenticated" &&
      browser.probeState === "ready" &&
      manifest?.runnerSessionId === node.activeSessionId &&
      manifest.capabilitySnapshotId === snapshot.capabilitySnapshotId &&
      manifest.authorizationEvidenceRef,
  );
  const route = resolveComputerUseRoute({
    snapshot: {
      structured: { ready: false, reasonCode: "STRUCTURED_NOT_CONFIGURED", costClass: "low" },
      semantic: { ready: false, reasonCode: "SEMANTIC_NOT_CONFIGURED", costClass: "medium" },
      localRunner: {
        ready,
        reasonCode: ready ? "LOCAL_RUNNER_BROWSER_READY" : "LOCAL_RUNNER_BROWSER_NOT_READY",
        costClass: "high",
      },
      visual: { ready: false, reasonCode: "VISUAL_NOT_CONFIGURED", costClass: "high" },
    },
    policy: "allowed",
    required: input.action === "type" ? "type" : input.action === "click" ? "click" : "submit",
  });
  if (route.decision !== "routed" || route.route !== "localRunner") {
    requestError(`Computer Use localRunner is not ready (${route.reasonCode})`);
  }
  if (!snapshot || !node.activeSessionId || !node.currentSnapshotRevision || !manifest?.authorizationEvidenceRef) {
    requestError("Fresh authorized Runner capability snapshot is required");
  }
  if (input.operation === "observe" && input.action !== "none") {
    requestError("Observe operations cannot carry an action");
  }
  if (input.action !== "none" && (!input.targetId || !input.selector)) {
    requestError("Bounded target and selector are required for browser actions");
  }
  const fixtureUrl = assertSafeFixtureUrl(options.fixtureUrlOverride ?? input.fixtureUrl);
  const traceId = randomUUID();
  const computerUseRunId = randomUUID();
  const decisionGoal = input.action === "none"
    ? "observe page"
    : `${input.action} ${input.targetId ?? input.selector ?? "target"}`;
  const requestedActionFamily = input.action === "click"
    ? "click"
    : input.action === "type"
      ? "type"
      : input.action === "none"
        ? "click"
        : "click";
  const job = await createControlPlaneJob({
    context: {
      tenantId,
      actorType: "user",
      actorId: ctx.user.id,
      authorizationScope: "computer-use.browser.execute",
      correlationId: traceId,
      idempotencyKey: input.idempotencyKey,
    },
    definition: {
      contractVersion: "feature-186-v1",
      jobType: "computer_use.browser",
      executionClass: "external",
      input: {
        traceId,
        computerUseRunId,
        runnerId: input.runnerId,
        runnerSessionId: node.activeSessionId,
        capabilitySnapshotId: snapshot.capabilitySnapshotId,
        capabilitySnapshotRevision: node.currentSnapshotRevision,
        authorizationGrantRef: manifest.authorizationEvidenceRef,
        ...(input.projectRef ? { projectRef: input.projectRef } : {}),
        ...(input.workspaceRef ? { workspaceRef: input.workspaceRef } : {}),
        payload: {
          // Semantic mode carries intent only. The request action/target is
          // never an executable Runner authority; the backend must derive an
          // action from the fresh observation and DecisionProvider.
          semanticIntent: {
            goal: decisionGoal,
            requestedActionFamily,
            ...(input.targetId ? { targetHint: input.targetId } : {}),
            ...(input.selector ? { selectorHint: input.selector } : {}),
            ...(input.text !== undefined ? { text: input.text } : {}),
          },
          ...(options.certificationDescriptor ? { p213Certification: options.certificationDescriptor } : {}),
          ...(fixtureUrl ? { fixtureUrl } : {}),
          ...(options.expectedSuccessCondition ? { expectedSuccessCondition: options.expectedSuccessCondition } : {}),
          requiresIndependentVerification: true,
          decisionRequest: {
            requestedProvider: "rules",
            goal: decisionGoal,
            maxCandidates: 32,
            allowedActionFamilies: input.action === "click"
              ? ["click"]
              : input.action === "type"
                ? ["type"]
                : ["click", "type", "select", "scroll", "press_key", "wait"],
          },
          verification: {
            required: true,
            verifier: "spec208-independent-v1",
            mode: "post_observation",
          },
          correlation: { traceId, computerUseRunId },
        },
      },
      idempotencyKey: input.idempotencyKey,
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 0,
        maxDelayMs: 0,
        jitter: "none",
        deadlineMs: 10 * 60_000,
        allowedErrorClasses: [],
      },
      timeoutPolicy: { softTimeoutMs: 2 * 60_000, hardTimeoutMs: 10 * 60_000 },
      requiredCapabilities: {
        route: "localRunner",
        executionKind: "computer_use.browser",
        adapterId: "browser.v1",
        capabilitySnapshotId: snapshot.capabilitySnapshotId,
        capabilitySnapshotRevision: node.currentSnapshotRevision,
      },
    },
    createOptions: { admissionMode: "durable_queue", runtimeType: "node_job_worker" },
  });
  return {
    ...job,
    traceId,
    computerUseRunId,
    route: "localRunner",
    runnerId: input.runnerId,
    runnerSessionId: node.activeSessionId,
    capabilitySnapshotId: snapshot.capabilitySnapshotId,
    capabilitySnapshotRevision: node.currentSnapshotRevision,
  };
}
