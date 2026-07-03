import { describe, expect, it } from "vitest";

import {
  DEFAULT_AGE_SAFETY_POLICY,
  DEFAULT_JURISDICTION_PRESETS,
  STRICT_UNKNOWN_COUNTRY_PRESET,
  calculateAgeOnDate,
  classifyAgeBand,
  evaluateAgeSafetyPolicy,
  normalizeCountryCode,
  normalizeTenantId,
  resolveJurisdictionPreset,
  type AgeSafetyPolicy,
} from "../ageSafetyPolicy";

describe("ageSafetyPolicy foundation", () => {
  const now = new Date("2026-07-02T00:00:00.000Z");

  it("calculates calendar age using birthday boundaries", () => {
    expect(calculateAgeOnDate("2008-07-02", now)).toBe(18);
    expect(calculateAgeOnDate("2008-07-03", now)).toBe(17);
    expect(calculateAgeOnDate("2014-07-02", now)).toBe(12);
    expect(calculateAgeOnDate("2014-07-03", now)).toBe(11);
  });

  it("handles leap-day users with calendar dates", () => {
    expect(calculateAgeOnDate("2012-02-29", new Date("2026-02-28T12:00:00.000Z"))).toBe(13);
    expect(calculateAgeOnDate("2012-02-29", new Date("2026-03-01T00:00:00.000Z"))).toBe(14);
  });

  it("classifies unknown, child, teen, and adult bands", () => {
    expect(classifyAgeBand(null, now)).toBe("unknown");
    expect(classifyAgeBand("2015-01-01", now)).toBe("child");
    expect(classifyAgeBand("2010-01-01", now)).toBe("teen");
    expect(classifyAgeBand("2000-01-01", now)).toBe("adult");
  });

  it("normalizes country and tenant identifiers conservatively", () => {
    expect(normalizeCountryCode(" th ")).toBe("TH");
    expect(normalizeCountryCode("usa")).toBeNull();
    expect(normalizeTenantId(42)).toBe("42");
    expect(normalizeTenantId(" tenant-1 ")).toBe("tenant-1");
    expect(normalizeTenantId(" ")).toBeNull();
  });

  it("resolves supported jurisdiction presets and strict fallback", () => {
    expect(resolveJurisdictionPreset("US", DEFAULT_JURISDICTION_PRESETS, now).id).toBe("US_COPPA_DEFAULT");
    expect(resolveJurisdictionPreset("TH", DEFAULT_JURISDICTION_PRESETS, now).id).toBe("TH_DEFAULT");
    expect(resolveJurisdictionPreset("DE", DEFAULT_JURISDICTION_PRESETS, now).id).toBe("EU_EEA_DEFAULT");
    expect(resolveJurisdictionPreset("ZZ", DEFAULT_JURISDICTION_PRESETS, now).id).toBe("STRICT_UNKNOWN_COUNTRY");
  });

  it("fails closed when presets are stale or unapproved", () => {
    const stale = {
      ...DEFAULT_JURISDICTION_PRESETS[0],
      nextReviewDueAt: "2026-01-01",
    };
    const draft = {
      ...DEFAULT_JURISDICTION_PRESETS[1],
      legalReviewStatus: "draft" as const,
    };
    expect(resolveJurisdictionPreset("US", [stale], now).id).toBe("STRICT_UNKNOWN_COUNTRY");
    expect(resolveJurisdictionPreset("TH", [draft], now).id).toBe("STRICT_UNKNOWN_COUNTRY");
  });

  it("treats unknown profiles as child-enforced and requires profile in enforce mode", () => {
    const policy: AgeSafetyPolicy = {
      ...DEFAULT_AGE_SAFETY_POLICY,
      rolloutMode: "enforce_all",
      adultOnlyServiceMode: false,
    };
    const decision = evaluateAgeSafetyPolicy({
      actor: { actorKind: "human_user", dateOfBirth: null, countryCode: "US" },
      surface: "chat",
      action: "submit_prompt",
      now,
      policy,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.effect).toBe("require_profile");
    expect(decision.actualAgeBand).toBe("unknown");
    expect(decision.enforcementAgeBand).toBe("child");
    expect(decision.reasonCode).toBe("safety_profile_required");
  });

  it("records would-block decisions in observe mode without blocking", () => {
    const policy: AgeSafetyPolicy = {
      ...DEFAULT_AGE_SAFETY_POLICY,
      rolloutMode: "observe",
    };
    const decision = evaluateAgeSafetyPolicy({
      actor: { actorKind: "human_user", dateOfBirth: "2018-01-01", countryCode: "US" },
      surface: "media_image",
      action: "submit_prompt",
      now,
      policy,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.wouldBlock).toBe(true);
    expect(decision.reasonCode).toBe("age_policy_media_general_teen_observe");
  });

  it("allows scoped protected-surface unlock for overridable media rules", () => {
    const policy: AgeSafetyPolicy = {
      ...DEFAULT_AGE_SAFETY_POLICY,
      rolloutMode: "enforce_all",
      adultOnlyServiceMode: false,
    };
    const decision = evaluateAgeSafetyPolicy({
      actor: {
        actorKind: "human_user",
        dateOfBirth: "2018-01-01",
        countryCode: "US",
        protectedSurfaceScopes: ["age-policy:temporary-adult"],
      },
      surface: "media_image",
      action: "submit_prompt",
      protectedSurfaceScope: "age-policy:temporary-adult",
      now,
      policy,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("age_policy_media_general_teen_pin_unlocked");
  });

  it("keeps policy decisions redacted and replayable", () => {
    const decision = evaluateAgeSafetyPolicy({
      actor: { actorKind: "human_user", dateOfBirth: "2000-01-01", countryCode: "ZZ" },
      surface: "settings_security",
      action: "read",
      now,
      policy: { ...DEFAULT_AGE_SAFETY_POLICY, rolloutMode: "enforce_all", adultOnlyServiceMode: false },
      jurisdictionPreset: STRICT_UNKNOWN_COUNTRY_PRESET,
    });

    expect(decision.jurisdictionPresetId).toBe("STRICT_UNKNOWN_COUNTRY");
    expect(decision.metadata.policySnapshotHash).toMatch(/^[0-9a-f]+$/);
    expect(JSON.stringify(decision)).not.toContain("2000-01-01");
  });
});
