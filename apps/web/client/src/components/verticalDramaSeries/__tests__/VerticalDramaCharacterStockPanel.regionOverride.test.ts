import { describe, expect, it } from "vitest";
import {
  buildCharacterRegionOverrideCreateFields,
  buildCharacterRegionOverrideUpdateFields,
  getCharacterRegionBadgeLabel,
  regionOverrideFormFromCharacterData,
  VD_REGION_OVERRIDE_FORM_DEFAULTS,
  type VdRegionOverrideFormState,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterStockPanel";

/**
 * Coverage for the per-character ethnicity/region UI wiring
 * (planning/vd-per-character-ethnicity/plan.md). The server side is DONE and
 * verified separately (204 tests + real-data proof) — this file only tests
 * this panel's own pure form <-> payload conversions: prefill from a
 * character's `data.region`/`data.ethnicityText`, and building the
 * `createCharacter`/`updateCharacter` payload fragments from the draft form,
 * including the "empty stays empty — no accidental default" requirement (user
 * decision: no backfill). A full render test of this ~7000-line panel is
 * impractical (see `VerticalDramaCharacterStockPanel.referencePicker.test.ts`
 * for the established precedent of testing exported pure functions instead).
 */

describe("regionOverrideFormFromCharacterData", () => {
  it("returns the empty/unset defaults for a character with no data at all", () => {
    expect(regionOverrideFormFromCharacterData(undefined)).toEqual(
      VD_REGION_OVERRIDE_FORM_DEFAULTS
    );
    expect(regionOverrideFormFromCharacterData(null)).toEqual(
      VD_REGION_OVERRIDE_FORM_DEFAULTS
    );
    expect(regionOverrideFormFromCharacterData({})).toEqual(
      VD_REGION_OVERRIDE_FORM_DEFAULTS
    );
  });

  it("prefills region from a valid preset key", () => {
    expect(regionOverrideFormFromCharacterData({ region: "western" })).toEqual({
      region: "western",
      ethnicityText: "",
    });
  });

  it("prefills ethnicityText from a free-text override", () => {
    expect(
      regionOverrideFormFromCharacterData({ ethnicityText: "ลูกครึ่งไทย-ญี่ปุ่น" })
    ).toEqual({ region: "", ethnicityText: "ลูกครึ่งไทย-ญี่ปุ่น" });
  });

  it("prefills both together when a character has region AND ethnicityText set", () => {
    expect(
      regionOverrideFormFromCharacterData({
        region: "east_asian",
        ethnicityText: "คนเหนือ",
      })
    ).toEqual({ region: "east_asian", ethnicityText: "คนเหนือ" });
  });

  it("treats an unrecognized/garbage region as unset rather than crashing or guessing a default", () => {
    expect(
      regionOverrideFormFromCharacterData({ region: "atlantis", ethnicityText: 42 })
    ).toEqual({ region: "", ethnicityText: "" });
  });

  it("stays byte-identical (empty) for an existing/blank character — no backfill", () => {
    const legacyCharacterData = { personality: "warm", backstory: "..." };
    expect(regionOverrideFormFromCharacterData(legacyCharacterData)).toEqual(
      VD_REGION_OVERRIDE_FORM_DEFAULTS
    );
  });
});

describe("buildCharacterRegionOverrideCreateFields", () => {
  it("omits both fields (never sends null) when the form is empty", () => {
    const result = buildCharacterRegionOverrideCreateFields(
      VD_REGION_OVERRIDE_FORM_DEFAULTS
    );
    expect(result).toEqual({});
    expect(result).not.toHaveProperty("region");
    expect(result).not.toHaveProperty("ethnicityText");
  });

  it("includes only region when only the dropdown is set", () => {
    const form: VdRegionOverrideFormState = { region: "thai", ethnicityText: "" };
    expect(buildCharacterRegionOverrideCreateFields(form)).toEqual({ region: "thai" });
  });

  it("includes only ethnicityText (trimmed) when only free text is set", () => {
    const form: VdRegionOverrideFormState = {
      region: "",
      ethnicityText: "  ลูกครึ่งไทย-ญี่ปุ่น  ",
    };
    expect(buildCharacterRegionOverrideCreateFields(form)).toEqual({
      ethnicityText: "ลูกครึ่งไทย-ญี่ปุ่น",
    });
  });

  it("includes both when both are set", () => {
    const form: VdRegionOverrideFormState = {
      region: "western",
      ethnicityText: "คนเหนือ",
    };
    expect(buildCharacterRegionOverrideCreateFields(form)).toEqual({
      region: "western",
      ethnicityText: "คนเหนือ",
    });
  });

  it("treats a whitespace-only ethnicityText as empty (omitted)", () => {
    const form: VdRegionOverrideFormState = { region: "", ethnicityText: "   " };
    expect(buildCharacterRegionOverrideCreateFields(form)).toEqual({});
  });
});

describe("buildCharacterRegionOverrideUpdateFields", () => {
  it("sends explicit null,null for an empty form (clears back to series default)", () => {
    expect(
      buildCharacterRegionOverrideUpdateFields(VD_REGION_OVERRIDE_FORM_DEFAULTS)
    ).toEqual({ region: null, ethnicityText: null });
  });

  it("sends the region key plus null ethnicityText when only the dropdown is set", () => {
    const form: VdRegionOverrideFormState = { region: "south_asian", ethnicityText: "" };
    expect(buildCharacterRegionOverrideUpdateFields(form)).toEqual({
      region: "south_asian",
      ethnicityText: null,
    });
  });

  it("sends null region plus the trimmed free text when only free text is set", () => {
    const form: VdRegionOverrideFormState = {
      region: "",
      ethnicityText: "  ลูกครึ่งไทย-ญี่ปุ่น  ",
    };
    expect(buildCharacterRegionOverrideUpdateFields(form)).toEqual({
      region: null,
      ethnicityText: "ลูกครึ่งไทย-ญี่ปุ่น",
    });
  });

  it("sends both together when both are set (server resolves free-text-wins precedence)", () => {
    const form: VdRegionOverrideFormState = {
      region: "middle_eastern",
      ethnicityText: "คนเหนือ",
    };
    expect(buildCharacterRegionOverrideUpdateFields(form)).toEqual({
      region: "middle_eastern",
      ethnicityText: "คนเหนือ",
    });
  });
});

describe("getCharacterRegionBadgeLabel", () => {
  it("returns null for a character with no override set — the roster card shows no chip", () => {
    expect(getCharacterRegionBadgeLabel(undefined, "th")).toBeNull();
    expect(getCharacterRegionBadgeLabel({}, "th")).toBeNull();
  });

  it("returns the Thai preset label when region is set (Thai lang)", () => {
    expect(getCharacterRegionBadgeLabel({ region: "western" }, "th")).toBe("ตะวันตก");
  });

  it("returns the English preset label when region is set (English lang)", () => {
    expect(getCharacterRegionBadgeLabel({ region: "western" }, "en")).toBe("Western");
  });

  it("returns the trimmed free text, and it wins over region, matching server precedence", () => {
    expect(
      getCharacterRegionBadgeLabel(
        { region: "thai", ethnicityText: "  ลูกครึ่งไทย-ญี่ปุ่น  " },
        "th"
      )
    ).toBe("ลูกครึ่งไทย-ญี่ปุ่น");
  });

  it("ignores an unrecognized region value instead of throwing", () => {
    expect(getCharacterRegionBadgeLabel({ region: "atlantis" }, "th")).toBeNull();
  });

  it("treats a whitespace-only ethnicityText as absent and falls through to region", () => {
    expect(
      getCharacterRegionBadgeLabel({ region: "african", ethnicityText: "   " }, "en")
    ).toBe("African");
  });
});
