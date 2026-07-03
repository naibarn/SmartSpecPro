import { describe, expect, it } from "vitest";

import {
  buildSafetyProfilePreferences,
  buildSafetyProfileRequiredError,
  getEffectiveSafetyProfileFromPrefs,
  validateSafetyProfileInput,
} from "./ageSafetyProfileService";

describe("ageSafetyProfileService", () => {
  const now = new Date("2026-07-02T00:00:00.000Z");

  it("validates and normalizes DOB and residence country", () => {
    const result = validateSafetyProfileInput({ dateOfBirth: "2000-01-02", countryOfResidence: " th " }, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.countryOfResidence).toBe("TH");
      expect(result.preset.id).toBe("TH_DEFAULT");
    }
  });

  it("rejects unsupported country with structured error", () => {
    const result = validateSafetyProfileInput({ dateOfBirth: "2000-01-02", countryOfResidence: "ZZ" }, now);
    expect(result).toEqual({ ok: false, code: "country_profile_invalid", missingFields: [] });
  });

  it("builds versioned preferences without using locale or billing country", () => {
    const prefs = buildSafetyProfilePreferences(
      { displayLocale: "th", billingCountry: "US" },
      { dateOfBirth: "2000-01-02", countryOfResidence: "TH" },
      now,
    );
    expect(prefs.safetyProfile?.countryOfResidence).toBe("TH");
    expect(prefs.safetyProfile?.jurisdictionPresetId).toBe("TH_DEFAULT");
    expect(prefs.safetyProfile?.profileVersion).toBe(1);
    expect(prefs.displayLocale).toBe("th");
  });

  it("derives an effective profile and child-enforces unknown users", () => {
    const profile = getEffectiveSafetyProfileFromPrefs({}, now);
    expect(profile.complete).toBe(false);
    expect(profile.actualAgeBand).toBe("unknown");
    expect(profile.enforcementAgeBand).toBe("child");
    expect(profile.missingFields).toEqual(["dateOfBirth", "countryOfResidence"]);
  });

  it("returns non-browser profile errors with next allowed route", () => {
    const profile = getEffectiveSafetyProfileFromPrefs({ safetyProfile: { dateOfBirth: "2000-01-02" } }, now);
    expect(buildSafetyProfileRequiredError(profile)).toMatchObject({
      code: "country_profile_invalid",
      missingFields: ["countryOfResidence"],
      nextAllowedRoute: "/settings/security",
    });
  });
});
