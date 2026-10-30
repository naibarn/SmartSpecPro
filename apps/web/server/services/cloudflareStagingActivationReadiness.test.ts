import { describe, expect, it } from "vitest";
import { cloudflareStagingActivationBlocker, cloudflareStagingOriginConfigurationBlocker } from "./cloudflareStagingActivationReadiness";

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

  it("requires both preconfigured runtime and control-plane secrets before creating a deployment grant", () => {
    expect(cloudflareStagingActivationBlocker({
      workflowExecution: "emergency-intake",
      jobTransport: "queues",
      nativeResources: { privateDatabase: {} },
      workflowRuntimeTokenConfigured: true,
      controlPlaneTokenConfigured: false,
    })).toBe("STAGING_WORKFLOW_RUNTIME_SECRETS_REQUIRED");
  });

  it("accepts Queues without requiring Workflow, Container, or Worker App bindings", () => {
    expect(cloudflareStagingActivationBlocker({
      workflowExecution: "emergency-intake",
      jobTransport: "queues",
      nativeResources: { privateDatabase: { hyperdriveRef: "existing-db" } },
    })).toBeNull();
  });

  it("accepts a verified Full HTTP profile without inheriting M3 Queue or private DB lease gates", () => {
    expect(cloudflareStagingActivationBlocker({
      applicationHttp: { traffic: "staging-full-http-v1" },
      applicationSecretsConfigured: true,
    })).toBeNull();
    expect(cloudflareStagingActivationBlocker({
      applicationHttp: { traffic: "staging-full-http-v1" },
      applicationSecretsConfigured: false,
    })).toBe("STAGING_ACTIVATION_PROFILE_REQUIRED");
  });

  it("surfaces a precise private database receipt blocker without exposing provider details", () => {
    expect(cloudflareStagingOriginConfigurationBlocker(
      Object.assign(new Error("internal detail"), { diagnosticCode: "PRIVATE_DATABASE_PROVISION_RECEIPT_DENIED" }),
    )).toBe("STAGING_PRIVATE_DATABASE_RECEIPT_INVALID");
    expect(cloudflareStagingOriginConfigurationBlocker(
      Object.assign(new Error("internal detail"), { diagnosticCode: "CLOUDFLARE_NATIVE_PROVISION_RECEIPT_DENIED" }),
    )).toBe("STAGING_NATIVE_RESOURCE_RECEIPT_INVALID");
    expect(cloudflareStagingOriginConfigurationBlocker(new Error("sensitive internal detail")))
      .toBe("STAGING_ORIGIN_CONFIGURATION_UNAVAILABLE");
  });
});
