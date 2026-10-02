import { describe, expect, it } from "vitest";
import { resolveGeoName, searchGeoNames } from "../../packages/shared/src/geo/geoNames";

describe("resolveGeoName", () => {
  it.each([
    ["พระนครศรีอยุธยา", "TH-PLACE-AYUTTHAYA"],
    ["Pasak Jolasid Dam", "TH-PLACE-PASAK-JOLASID-DAM"],
    ["เขื่อนป่าสักชลสิทธิ์", "TH-PLACE-PASAK-JOLASID-DAM"],
    ["Suvarnabhumi Airport", "TH-PLACE-SUVARNABHUMI-AIRPORT"],
    ["ท่าอากาศยานสุวรรณภูมิ", "TH-PLACE-SUVARNABHUMI-AIRPORT"],
  ])("resolves exact alias %s to a stable internal ID", (query, canonicalId) => {
    expect(resolveGeoName(query).candidates.map(candidate => candidate.canonicalId)).toContain(canonicalId);
  });

  it("normalizes Unicode and whitespace without silently selecting ambiguous names", () => {
    expect(resolveGeoName("  กรุงเทพมหานคร ").status).toBe("found");
    expect(resolveGeoName("Ayutthaya").status).toBe("ambiguous");
    expect(resolveGeoName("unknown place").status).toBe("not_found");
    expect(resolveGeoName("x".repeat(300)).status).toBe("invalid_query");
  });

  it("returns bounded typed suggestions while locale remains independent from geography", () => {
    expect(searchGeoNames("เขื่อนป่าสัก", {
      kinds: ["dam"],
      admin1Code: "TH-16",
      locale: "en",
      limit: 1,
    })).toMatchObject({
      status: "found",
      candidates: [{ canonicalId: "TH-PLACE-PASAK-JOLASID-DAM", kind: "dam", admin1Code: "TH-16" }],
    });

    expect(searchGeoNames("Ayutthaya", { kinds: ["airport"] }).status).toBe("not_found");
    expect(searchGeoNames("Bangkok", { locale: "ar" }).candidates[0]?.canonicalId).toBe("TH-PLACE-BANGKOK");
  });

  it("does not expand aliases or silently select a truncated ambiguous result", () => {
    expect(resolveGeoName("Ayutthaya", { limit: 1 }).status).toBe("ambiguous");
    expect(searchGeoNames("Ayut", { limit: 1 })).toMatchObject({
      status: "ambiguous",
      candidates: [{ canonicalId: "TH-PLACE-AYUTTHAYA" }],
    });
    expect(searchGeoNames("unknown", { limit: 99 }).status).toBe("not_found");
  });
});
