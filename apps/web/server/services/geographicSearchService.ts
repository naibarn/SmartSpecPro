import { searchGeoNames, type GeoNameCandidate, type GeoNameKind, type GeoNameResolution, type GeoNameSearchOptions } from "@smartspec/shared/src/geo/geoNames";

const CATALOG_ID = "spec262-curated-thai-place-aliases" as const;
const COVERAGE = "curated-limited" as const;
const NAME_KINDS = new Set<GeoNameKind>(["province", "city", "dam", "airport"]);
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/;
const ADMIN1 = /^TH-\d{2}$/;

export type GeographicSearchCatalog = (query: string, options: GeoNameSearchOptions) => GeoNameResolution;

export interface GeographicSearchServiceDependencies {
  /** Injectable only for deterministic fixtures. Production defaults to the curated local catalog. */
  readonly searchCatalog?: GeographicSearchCatalog;
}

export interface GeographicSearchResult {
  readonly canonicalRef: string;
  readonly kind: GeoNameKind;
  readonly names: GeoNameCandidate["names"];
  readonly jurisdiction: { readonly countryCode: "TH"; readonly admin1Code?: string };
}

export type GeographicSearchResponse = {
  readonly status: "ok" | "ambiguous" | "not_found" | "invalid_request";
  /** The curated records do not claim full Thailand or provider coverage. */
  readonly coverage: typeof COVERAGE;
  readonly results: readonly GeographicSearchResult[];
  /** `upstream` remains null until an approved provider contract is wired in. */
  readonly provenance: { readonly catalog: typeof CATALOG_ID; readonly upstream: null };
};

type ValidatedSearch = { readonly query: string; readonly options: GeoNameSearchOptions };

const provenance = { catalog: CATALOG_ID, upstream: null } as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function invalid(): GeographicSearchResponse {
  return { status: "invalid_request", coverage: COVERAGE, results: [], provenance };
}

function parseInput(input: unknown): ValidatedSearch | undefined {
  if (!isPlainObject(input)) return undefined;
  const allowedKeys = new Set(["query", "locale", "countryCode", "admin1Code", "kinds", "limit"]);
  if (Object.keys(input).some(key => !allowedKeys.has(key))) return undefined;
  if (typeof input.query !== "string" || input.query.trim().length === 0 || input.query.length > 120) return undefined;
  if (input.locale !== undefined && (typeof input.locale !== "string" || input.locale.length > 35 || !LOCALE.test(input.locale))) return undefined;
  if (input.countryCode !== undefined && input.countryCode !== "TH") return undefined;
  if (input.admin1Code !== undefined && (typeof input.admin1Code !== "string" || !ADMIN1.test(input.admin1Code))) return undefined;
  if (input.limit !== undefined && (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 12)) return undefined;
  if (input.kinds !== undefined && (!Array.isArray(input.kinds) || input.kinds.length === 0 || input.kinds.length > NAME_KINDS.size ||
      input.kinds.some(kind => typeof kind !== "string" || !NAME_KINDS.has(kind as GeoNameKind)) || new Set(input.kinds).size !== input.kinds.length)) return undefined;

  return {
    query: input.query,
    options: {
      limit: input.limit as number | undefined,
      locale: input.locale as string | undefined,
      kinds: input.kinds as readonly GeoNameKind[] | undefined,
      admin1Code: input.admin1Code as string | undefined,
    },
  };
}

function toResult(candidate: GeoNameCandidate): GeographicSearchResult {
  return {
    canonicalRef: candidate.canonicalId,
    kind: candidate.kind,
    names: candidate.names,
    jurisdiction: {
      countryCode: candidate.countryCode,
      ...(candidate.admin1Code ? { admin1Code: candidate.admin1Code } : {}),
    },
  };
}

/**
 * Curated-place search boundary. It has no network transport, provider
 * credential, coverage inference, or persisted query history. A router must
 * still authorize an audience and select only an approved regional catalog.
 */
export function createGeographicSearchService(dependencies: GeographicSearchServiceDependencies = {}) {
  const catalog = dependencies.searchCatalog ?? searchGeoNames;
  return {
    search(input: unknown): GeographicSearchResponse {
      const request = parseInput(input);
      if (!request) return invalid();
      const resolution = catalog(request.query, request.options);
      const results = resolution.candidates.slice(0, request.options.limit ?? 8).map(toResult);
      if (resolution.status === "invalid_query") return invalid();
      if (resolution.status === "not_found") return { status: "not_found", coverage: COVERAGE, results: [], provenance };
      return {
        status: resolution.status === "ambiguous" ? "ambiguous" : "ok",
        coverage: COVERAGE,
        results,
        provenance,
      };
    },
  };
}
