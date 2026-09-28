import { describe, expect, it } from "vitest";
import {
  applyMediaArtifactProjection,
  classifyMediaArtifactFailure,
  ProviderResultError,
} from "./mediaTaskArtifactService";

describe("media task artifact failure classification", () => {
  it("keeps provider failures authoritative", () => {
    expect(
      classifyMediaArtifactFailure(
        new ProviderResultError("provider expired", "expired"),
      ),
    ).toBe("expired");
  });

  it("marks a successful provider download as available after a storage failure", () => {
    expect(classifyMediaArtifactFailure(new Error("R2 unavailable"), true)).toBe(
      "available",
    );
  });

  it("does not call a generic storage failure a provider failure", () => {
    expect(classifyMediaArtifactFailure(new Error("R2 unavailable"))).toBe(
      "unknown",
    );
  });

  it("keeps a temporary provider fallback when the ledger projection is unavailable", () => {
    const projected = applyMediaArtifactProjection(
      {
        id: "task-1",
        status: "completed",
        resultUrl: "https://provider.example/temporary.png",
        resultData: {},
      } as never,
      [],
    );

    expect(projected.resultUrl).toBeUndefined();
    expect(projected.artifacts?.[0]).toMatchObject({
      providerOriginalUrl: "https://provider.example/temporary.png",
      availabilityStatus: "provider_fallback",
    });
  });
});
