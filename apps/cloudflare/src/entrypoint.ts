import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createCloudflareWorker } from "./index";
import type { CanonicalJobEnvelope, CloudflareEnvironment } from "./contracts";
import { runCanonicalWorkflow } from "./workflowRuntime";
import { createSpec260EvidenceRetentionSweep } from "./spec260BackgroundWork";
import { normalizeNativeEnvironment } from "./nativeEnvironment";
import { createCanonicalControlPlaneHandler } from "./controlPlaneHandler";
import { createCanonicalControlPlaneProxyRepository } from "./canonicalControlPlaneProxy";
import { executeCanonicalJob } from "./canonicalExecution";
export { CanonicalRunnerContainer } from "./runnerContainerEntrypoint";
export { ApplicationHttpBridge, StagingNodeHttpContainer, StagingPythonHttpContainer } from "./applicationHttpContainerEntrypoint";

export class CanonicalJobWorkflow extends WorkflowEntrypoint<CloudflareEnvironment, CanonicalJobEnvelope> {
  async run(event: Readonly<WorkflowEvent<CanonicalJobEnvelope>>, step: WorkflowStep) {
    return runCanonicalWorkflow(event.payload, normalizeNativeEnvironment(this.env), step);
  }
}

// Exporting the class does not create a resource or activate any consumer.
// Account bindings remain owned by the approved deployment configuration.
const queueHandler = createCanonicalControlPlaneHandler({ repository: createCanonicalControlPlaneProxyRepository, execute: executeCanonicalJob });
const worker = createCloudflareWorker(queueHandler, undefined, undefined, createSpec260EvidenceRetentionSweep(), undefined, undefined, undefined, { workflowHandlerConfigured: true });
export default {
  fetch: (request: Request, env: CloudflareEnvironment) => worker.fetch(request, normalizeNativeEnvironment(env)),
  queue: (batch: Parameters<typeof worker.queue>[0], env: CloudflareEnvironment) => worker.queue(batch, normalizeNativeEnvironment(env)),
  scheduled: (event: Parameters<typeof worker.scheduled>[0], env: CloudflareEnvironment) => worker.scheduled(event, normalizeNativeEnvironment(env)),
};
