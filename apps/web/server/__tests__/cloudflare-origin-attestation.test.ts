import { describe, expect, it } from "vitest";
import { isValidCloudflareOriginAttestation } from "../_core/cloudflareOriginAttestation";

describe("Cloudflare origin attestation", () => {
  it("accepts only the configured Worker credential", () => {
    expect(isValidCloudflareOriginAttestation("worker-secret", "worker-secret")).toBe(true);
    expect(isValidCloudflareOriginAttestation("attacker-secret", "worker-secret")).toBe(false);
    expect(isValidCloudflareOriginAttestation("worker-secret", undefined)).toBe(false);
    expect(isValidCloudflareOriginAttestation(undefined, "worker-secret")).toBe(false);
  });
});
