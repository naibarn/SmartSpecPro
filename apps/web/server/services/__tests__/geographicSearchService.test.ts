import { describe, expect, it, vi } from "vitest";
import { createGeographicSearchService } from "../geographicSearchService";

describe("geographicSearchService", () => {
  it("returns canonical curated results with explicit limited coverage and no upstream claim", () => {
    const result = createGeographicSearchService().search({
      query: "เขื่อนป่าสัก",
      locale: "en",
      countryCode: "TH",
      admin1Code: "TH-16",
      kinds: ["dam"],
      limit: 1,
    });

    expect(result).toMatchObject({
      status: "ok",
      coverage: "curated-limited",
      provenance: { catalog: "spec262-curated-thai-place-aliases", upstream: null },
      results: [{
        canonicalRef: "TH-PLACE-PASAK-JOLASID-DAM",
        kind: "dam",
        jurisdiction: { countryCode: "TH", admin1Code: "TH-16" },
      }],
    });
  });

  it("keeps alias matching independent from requested locale and reports ambiguity", () => {
    const service = createGeographicSearchService();

    expect(service.search({ query: "Ayutthaya", locale: "ar", limit: 1 })).toMatchObject({
      status: "ambiguous",
      coverage: "curated-limited",
      results: [{ canonicalRef: "TH-PLACE-AYUTTHAYA" }],
    });
  });

  it.each([
    [{ query: "Bangkok", countryCode: "US" }],
    [{ query: "Bangkok", admin1Code: "TH-10;DROP" }],
    [{ query: "Bangkok", kinds: ["unknown"] }],
    [{ query: "Bangkok", limit: 13 }],
    [{ query: "x".repeat(121) }],
  ])("rejects invalid query or jurisdiction/type hints without invoking the catalog: %o", input => {
    const catalog = vi.fn();
    const result = createGeographicSearchService({ searchCatalog: catalog }).search(input);

    expect(result).toEqual({ status: "invalid_request", coverage: "curated-limited", results: [], provenance: { catalog: "spec262-curated-thai-place-aliases", upstream: null } });
    expect(catalog).not.toHaveBeenCalled();
  });

  it("bounds an injected catalog result to the validated request limit", () => {
    const catalog = vi.fn(() => ({
      status: "ambiguous" as const,
      candidates: Array.from({ length: 3 }, (_, index) => ({
        canonicalId: `TH-PLACE-${index}`,
        kind: "city" as const,
        countryCode: "TH" as const,
        names: { en: `Place ${index}`, th: `สถานที่ ${index}` },
      })),
    }));

    const result = createGeographicSearchService({ searchCatalog: catalog }).search({ query: "place", limit: 2 });

    expect(catalog).toHaveBeenCalledWith("place", { limit: 2, locale: undefined, kinds: undefined, admin1Code: undefined });
    expect(result).toMatchObject({ status: "ambiguous", results: [{ canonicalRef: "TH-PLACE-0" }, { canonicalRef: "TH-PLACE-1" }] });
    expect(result.results).toHaveLength(2);
  });
});
