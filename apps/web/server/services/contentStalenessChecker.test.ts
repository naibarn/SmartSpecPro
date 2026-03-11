import { describe, it, expect } from "vitest";
import {
  calculateNextRefreshAt,
  isStale,
  findStaleArtifacts,
  type ArtifactStalenessInput,
} from "./contentStalenessChecker";

describe("calculateNextRefreshAt", () => {
  it("adds cadence days to lastVerifiedAt", () => {
    const date = new Date("2026-03-01T00:00:00Z");
    const result = calculateNextRefreshAt(date, 30);
    expect(result.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("handles month boundaries", () => {
    const date = new Date("2026-01-31T00:00:00Z");
    const result = calculateNextRefreshAt(date, 30);
    expect(result.getMonth()).toBe(2); // March
  });
});

describe("isStale", () => {
  const now = new Date("2026-03-11T12:00:00Z");

  it("returns true when past refresh date", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: new Date("2026-02-01T00:00:00Z"),
      refreshCadenceDays: 30,
      status: "active",
    };
    expect(isStale(artifact, now)).toBe(true); // Feb 1 + 30 = Mar 3, now is Mar 11
  });

  it("returns false when before refresh date", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: new Date("2026-03-01T00:00:00Z"),
      refreshCadenceDays: 30,
      status: "active",
    };
    expect(isStale(artifact, now)).toBe(false); // Mar 1 + 30 = Mar 31, now is Mar 11
  });

  it("returns false for archived artifacts", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      refreshCadenceDays: 30,
      status: "archived",
    };
    expect(isStale(artifact, now)).toBe(false);
  });

  it("returns false for already stale artifacts", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      refreshCadenceDays: 30,
      status: "stale",
    };
    expect(isStale(artifact, now)).toBe(false);
  });

  it("returns false when no lastVerifiedAt", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: null,
      refreshCadenceDays: 30,
      status: "active",
    };
    expect(isStale(artifact, now)).toBe(false);
  });

  it("returns false when no refreshCadenceDays", () => {
    const artifact: ArtifactStalenessInput = {
      lastVerifiedAt: new Date("2026-01-01T00:00:00Z"),
      refreshCadenceDays: null,
      status: "active",
    };
    expect(isStale(artifact, now)).toBe(false);
  });
});

describe("findStaleArtifacts", () => {
  const now = new Date("2026-03-11T12:00:00Z");

  it("filters to only stale active artifacts", () => {
    const artifacts: ArtifactStalenessInput[] = [
      { lastVerifiedAt: new Date("2026-01-01"), refreshCadenceDays: 30, status: "active" },
      { lastVerifiedAt: new Date("2026-03-05"), refreshCadenceDays: 30, status: "active" },
      { lastVerifiedAt: new Date("2026-01-01"), refreshCadenceDays: 30, status: "archived" },
    ];
    const stale = findStaleArtifacts(artifacts, now);
    expect(stale).toHaveLength(1);
    expect(stale[0].lastVerifiedAt).toEqual(new Date("2026-01-01"));
  });

  it("returns empty for no stale artifacts", () => {
    const artifacts: ArtifactStalenessInput[] = [
      { lastVerifiedAt: new Date("2026-03-10"), refreshCadenceDays: 30, status: "active" },
    ];
    expect(findStaleArtifacts(artifacts, now)).toHaveLength(0);
  });
});
