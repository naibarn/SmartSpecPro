import { describe, expect, it, vi } from "vitest";
import { inspectBindingReadiness } from "./bindings";

describe("runtime binding readiness profiles", () => {
  it("accepts the production Queue profile without provisioning unrelated job Containers", () => {
    const queueProfile = inspectBindingReadiness({
      CLOUDFLARE_ACTIVATION: "enabled",
      CLOUDFLARE_ENVIRONMENT: "production",
      CLOUDFLARE_JOB_TRANSPORT: "queues",
      HYPERDRIVE: { connectionString: "postgres://target-placeholder" },
      JOB_QUEUE: { send: vi.fn() },
    });

    expect(queueProfile).toMatchObject({
      activation: "enabled",
      transport: "queues",
      ready: true,
      selectedMissing: [],
    });
    expect(queueProfile.missing).toContain("JOB_CONTAINERS");
    expect(queueProfile.missing).toContain("JOB_WORKFLOW");
  });
});
