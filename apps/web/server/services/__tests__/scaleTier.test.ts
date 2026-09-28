import { describe, expect, it } from "vitest";
import { applyScaleTier, SCALE_TIERS } from "../scaleTier";

describe("scale tier service contract", () => {
  it("exports the function required by the infrastructure router", () => {
    expect(typeof applyScaleTier).toBe("function");
  });

  it("keeps Cloudflare apply inside the deployment boundary", async () => {
    const result = await applyScaleTier("starter", "cloudflare");

    expect(SCALE_TIERS.starter.id).toBe("starter");
    expect(result).toEqual([{
      step: "cloudflare_deployment_pipeline",
      status: "skipped",
      mode: "cloudflare",
      message: expect.stringContaining("no local runtime mutation was performed"),
    }]);
  });
});
