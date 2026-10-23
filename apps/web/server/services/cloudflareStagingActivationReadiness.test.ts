import { describe, expect, it } from "vitest";
import { cloudflareStagingActivationBlocker } from "./cloudflareStagingActivationReadiness";

describe("Cloudflare Staging activation preflight", () => {
  it("blocks before policy or job creation when activation is disabled", () => {
    expect(cloudflareStagingActivationBlocker({})).toBe("STAGING_ACTIVATION_PROFILE_REQUIRED");
  });

  it("requires the cost-bounded queue transport", () => {
    expect(cloudflareStagingActivationBlocker({
      workflowExecution: "emergency-intake",
      jobTransport: "workflows",
      nativeResources: { privateDatabase: {} },
    })).toBe("STAGING_QUEUE_TRANSPORT_REQUIRED");
  });

  it("requires the existing private database binding", () => {
    expect(cloudflareStagingActivationBlocker({
      workflowExecution: "emergency-intake",
      jobTransport: "queues",
    })).toBe("STAGING_PRIVATE_DATABASE_BINDING_REQUIRED");
  });

  it("accepts Queues without requiring Workflow, Container, or Worker App bindings", () => {
    expect(cloudflareStagingActivationBlocker({
      workflowExecution: "emergency-intake",
      jobTransport: "queues",
      nativeResources: { privateDatabase: { hyperdriveRef: "existing-db" } },
    })).toBeNull();
  });
});
