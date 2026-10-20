import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createCloudflareWorker } from "./index";
import type { CanonicalJobEnvelope, CloudflareEnvironment } from "./contracts";
import { runCanonicalWorkflow } from "./workflowRuntime";
import { createSpec260EvidenceRetentionSweep } from "./spec260BackgroundWork";

export class CanonicalJobWorkflow extends WorkflowEntrypoint<CloudflareEnvironment, CanonicalJobEnvelope> {
  async run(event: Readonly<WorkflowEvent<CanonicalJobEnvelope>>, step: WorkflowStep) {
    return runCanonicalWorkflow(event.payload, this.env, step);
  }
}

// Exporting the class does not create a resource or activate any consumer.
// Account bindings remain owned by the approved deployment configuration.
export default createCloudflareWorker(undefined, undefined, undefined, createSpec260EvidenceRetentionSweep(), undefined, undefined, undefined, { workflowHandlerConfigured: true });
