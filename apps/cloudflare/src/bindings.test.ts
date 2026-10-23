import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { inspectBindingReadiness } from "./bindings";

describe("runtime binding readiness profiles", () => {
  it("enables the isolated staging Worker while production remains fail-closed", () => {
    const staging = JSON.parse(readFileSync(new URL("../wrangler.staging.jsonc", import.meta.url), "utf8"));
    const production = JSON.parse(readFileSync(new URL("../wrangler.production.jsonc", import.meta.url), "utf8"));

    expect(staging.vars.CLOUDFLARE_ACTIVATION).toBe("enabled");
    expect(production.vars.CLOUDFLARE_ACTIVATION).toBe("disabled");
  });

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
