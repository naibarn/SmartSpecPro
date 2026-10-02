export type GeoNameKind = "province" | "city" | "dam" | "airport";

export interface GeoNameCandidate {
  readonly canonicalId: string;
  readonly kind: GeoNameKind;
  readonly countryCode: "TH";
  readonly admin1Code?: string;
  readonly names: { readonly en: string; readonly th: string };
}

export type GeoNameResolution =
  | { readonly status: "found"; readonly candidates: readonly [GeoNameCandidate] }
  | { readonly status: "ambiguous"; readonly candidates: readonly GeoNameCandidate[] }
  | { readonly status: "not_found" | "invalid_query"; readonly candidates: readonly [] };

export interface GeoNameSearchOptions {
  /** Maximum result count. Results stay deterministically ordered by curated registry order. */
  readonly limit?: number;
  /** A display preference only. Geography matching is intentionally locale-independent. */
  readonly locale?: string;
  /** Restrict suggestions to canonical feature kinds supplied by the caller. */
  readonly kinds?: readonly GeoNameKind[];
  /** Restrict suggestions to a known canonical first-level administrative code. */
  readonly admin1Code?: string;
}

type GeoNameRecord = GeoNameCandidate & { readonly aliases: readonly string[] };

// Curated internal stable IDs; these records are not a claim of complete national gazetteer coverage.
const THAI_PLACES: readonly GeoNameRecord[] = [
  { canonicalId: "TH-PLACE-AYUTTHAYA", kind: "province", countryCode: "TH", admin1Code: "TH-14", names: { en: "Phra Nakhon Si Ayutthaya Province", th: "จังหวัดพระนครศรีอยุธยา" }, aliases: ["Ayutthaya", "Phra Nakhon Si Ayutthaya", "พระนครศรีอยุธยา", "อยุธยา"] },
  { canonicalId: "TH-PLACE-AYUTTHAYA-CITY", kind: "city", countryCode: "TH", admin1Code: "TH-14", names: { en: "Ayutthaya city", th: "เมืองพระนครศรีอยุธยา" }, aliases: ["Ayutthaya", "Ayutthaya city", "เกาะเมืองอยุธยา"] },
  { canonicalId: "TH-PLACE-BANGKOK", kind: "province", countryCode: "TH", admin1Code: "TH-10", names: { en: "Bangkok", th: "กรุงเทพมหานคร" }, aliases: ["Bangkok", "Krung Thep Maha Nakhon", "กรุงเทพมหานคร", "กรุงเทพฯ"] },
  { canonicalId: "TH-PLACE-PASAK-JOLASID-DAM", kind: "dam", countryCode: "TH", admin1Code: "TH-16", names: { en: "Pasak Jolasid Dam", th: "เขื่อนป่าสักชลสิทธิ์" }, aliases: ["Pasak Jolasid Dam", "Pa Sak Jolasid Dam", "เขื่อนป่าสักชลสิทธิ์", "เขื่อนป่าสักฯ"] },
  { canonicalId: "TH-PLACE-SUVARNABHUMI-AIRPORT", kind: "airport", countryCode: "TH", admin1Code: "TH-11", names: { en: "Suvarnabhumi Airport", th: "ท่าอากาศยานสุวรรณภูมิ" }, aliases: ["Suvarnabhumi Airport", "Suvarnabhumi", "ท่าอากาศยานสุวรรณภูมิ", "สนามบินสุวรรณภูมิ"] },
];

export function normalizeGeoName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("und").replace(/[\p{White_Space}\u200b]+/gu, "");
}

function resolveLimit(value: unknown): number {
  return Number.isInteger(value) ? Math.max(1, Math.min(12, Number(value))) : 8;
}

function asCandidate({ aliases: _aliases, ...candidate }: GeoNameRecord): GeoNameCandidate {
  return candidate;
}

function isValidQuery(query: unknown): query is string {
  return typeof query === "string" && query.trim().length > 0 && query.length <= 120;
}

function matchesHints(place: GeoNameRecord, options: GeoNameSearchOptions): boolean {
  return (!options.kinds || options.kinds.includes(place.kind)) &&
    (!options.admin1Code || options.admin1Code === place.admin1Code);
}

function allNormalizedNames(place: GeoNameRecord): readonly string[] {
  return [place.names.en, place.names.th, ...place.aliases].map(normalizeGeoName);
}

/** Exact, bounded alias resolution. Ambiguity is returned to the caller; it is never silently guessed. */
export function resolveGeoName(query: unknown, options: GeoNameSearchOptions = {}): GeoNameResolution {
  if (!isValidQuery(query)) {
    return { status: "invalid_query", candidates: [] };
  }
  const key = normalizeGeoName(query);
  const matching = THAI_PLACES.filter(place =>
    matchesHints(place, options) && allNormalizedNames(place).some(name => name === key),
  ).map(asCandidate);
  const candidates = matching.slice(0, resolveLimit(options.limit));
  if (matching.length === 0) return { status: "not_found", candidates: [] };
  if (matching.length === 1) return { status: "found", candidates: [matching[0]] };
  return { status: "ambiguous", candidates };
}

/**
 * Bounded curated-name suggestions for clients after the server has supplied
 * an authorized coverage scope. This does not geocode, mint aliases, or make
 * an unknown locale stand in for a different jurisdiction.
 */
export function searchGeoNames(query: unknown, options: GeoNameSearchOptions = {}): GeoNameResolution {
  if (!isValidQuery(query)) return { status: "invalid_query", candidates: [] };
  const key = normalizeGeoName(query);
  const matching = THAI_PLACES.filter(place =>
    matchesHints(place, options) && allNormalizedNames(place).some(name => name.startsWith(key)),
  ).map(asCandidate);
  const candidates = matching.slice(0, resolveLimit(options.limit));
  if (candidates.length === 0) return { status: "not_found", candidates: [] };
  if (matching.length === 1) return { status: "found", candidates: [candidates[0]] };
  return { status: "ambiguous", candidates };
}
