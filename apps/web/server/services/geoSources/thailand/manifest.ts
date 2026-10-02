/**
 * Thailand source candidates. This is an internal logical pack catalog, not a
 * claim that the named agencies expose a currently working endpoint or grant
 * the right to republish their data.
 */
export type ThailandFactClass =
  | "MEASUREMENT"
  | "OFFICIAL_WARNING"
  | "FORECAST"
  | "REMOTE_SENSING_OBSERVATION"
  | "LOCAL_AUTHORITY_REPORT"
  | "MEDIA_REPORT"
  | "OPERATIONAL_STATUS";

export interface ThailandFailurePolicy {
  readonly isolateCapability: true;
  readonly retainLastSafeOutput: true;
  readonly blockFreshnessGatedActions: true;
  readonly maxConsecutiveFailures: number;
}

export interface ThailandCapabilityDefinition {
  readonly capabilityId: string;
  readonly label: string;
  /** Target scope only. Proven coverage must be separately evidenced at onboarding. */
  readonly geographyScopes: readonly string[];
  readonly supportedQualityClasses: readonly ThailandFactClass[];
}

export interface ThailandSourceDefinition {
  readonly sourceId: string;
  readonly displayName: string;
  readonly sourceFamily: string;
  readonly endpointReference: null;
  readonly endpointEvidence: "UNVERIFIED";
  /** Internal adapter contract revision, not an upstream schema assertion. */
  readonly contractVersion: string;
  readonly schemaEvidence: "UNVERIFIED";
  readonly expectedCadenceSeconds: null;
  readonly cadenceEvidence: "UNVERIFIED";
  readonly rightsStatus: "UNVERIFIED";
  readonly licenseRef: null;
  readonly redistributionStatus: "UNVERIFIED";
  readonly attribution: null;
  /** Primary source page or technical documentation reviewed during research. */
  readonly researchUrl: string;
  readonly researchEvidence:
    | "API_DOCUMENTATION"
    | "OFFICIAL_DATA_PAGE"
    | "OFFICIAL_PORTAL"
    | "RESEARCH_LEAD";
  readonly permittedPurposes: readonly ["emergency-response"];
  readonly retentionClass: null;
  readonly rawPayloadRetention: "PRIVATE_UNTIL_POLICY_APPROVED";
  readonly failurePolicy: ThailandFailurePolicy;
  readonly capabilities: readonly ThailandCapabilityDefinition[];
}

export interface ThailandProviderPack {
  readonly packId: "TH_INTELLIGENCE_PACK";
  readonly version: "1.0.0";
  readonly countryCode: "TH";
  readonly status: "CANDIDATE_CATALOG_ONLY";
  readonly sources: readonly ThailandSourceDefinition[];
}

const failClosed: ThailandFailurePolicy = Object.freeze({
  isolateCapability: true,
  retainLastSafeOutput: true,
  blockFreshnessGatedActions: true,
  maxConsecutiveFailures: 3,
});

function capability(
  capabilityId: string,
  label: string,
  facts: readonly ThailandFactClass[]
): ThailandCapabilityDefinition {
  return Object.freeze({
    capabilityId,
    label,
    geographyScopes: Object.freeze(["TH"]),
    supportedQualityClasses: Object.freeze([...facts]),
  });
}

function source(
  sourceId: string,
  displayName: string,
  sourceFamily: string,
  capabilities: readonly ThailandCapabilityDefinition[],
  researchUrl: string,
  researchEvidence: ThailandSourceDefinition["researchEvidence"]
): ThailandSourceDefinition {
  return Object.freeze({
    sourceId,
    displayName,
    sourceFamily,
    endpointReference: null,
    endpointEvidence: "UNVERIFIED",
    contractVersion: "1.0.0",
    schemaEvidence: "UNVERIFIED",
    expectedCadenceSeconds: null,
    cadenceEvidence: "UNVERIFIED",
    rightsStatus: "UNVERIFIED",
    licenseRef: null,
    redistributionStatus: "UNVERIFIED",
    attribution: null,
    researchUrl,
    researchEvidence,
    permittedPurposes: Object.freeze(["emergency-response"] as const),
    retentionClass: null,
    rawPayloadRetention: "PRIVATE_UNTIL_POLICY_APPROVED",
    failurePolicy: failClosed,
    capabilities: Object.freeze([...capabilities]),
  });
}

const pack: ThailandProviderPack = Object.freeze({
  packId: "TH_INTELLIGENCE_PACK",
  version: "1.0.0",
  countryCode: "TH",
  status: "CANDIDATE_CATALOG_ONLY",
  sources: Object.freeze([
    source(
      "th-rid-river-levels",
      "Royal Irrigation Department — water observations",
      "RID",
      [
        capability("th-rid-river-level", "River level observation", [
          "MEASUREMENT",
        ]),
        capability("th-rid-flow-observation", "River flow observation", [
          "MEASUREMENT",
        ]),
      ],
      "https://swoc-api-service.rid.go.th/api/docs/",
      "API_DOCUMENTATION"
    ),
    source(
      "th-rid-swoc-operations",
      "RID Smart Water Operation Center — operations",
      "RID_SWOC",
      [
        capability(
          "th-rid-reservoir-operation",
          "Reservoir operation / planned release",
          ["OPERATIONAL_STATUS", "FORECAST"]
        ),
      ],
      "https://swoc-api-service.rid.go.th/api/docs/",
      "API_DOCUMENTATION"
    ),
    source(
      "th-dwr-community-alerts",
      "Department of Water Resources — community alerts",
      "DWR",
      [
        capability("th-dwr-community-warning", "Community water warning", [
          "OFFICIAL_WARNING",
        ]),
      ],
      "https://oldmekhala.dwr.go.th/weblinks-cate.php?txtlinkcate=17",
      "OFFICIAL_DATA_PAGE"
    ),
    source(
      "th-onwr-national-alerts",
      "Office of the National Water Resources — alerts",
      "ONWR",
      [
        capability("th-onwr-water-warning", "National water warning", [
          "OFFICIAL_WARNING",
        ]),
      ],
      "https://www.onwr.go.th/",
      "OFFICIAL_PORTAL"
    ),
    source(
      "th-egat-reservoir-operations",
      "Electricity Generating Authority of Thailand — reservoir operations",
      "EGAT",
      [
        capability("th-egat-reservoir-status", "Reservoir operation status", [
          "OPERATIONAL_STATUS",
        ]),
      ],
      "https://water.egat.co.th/API/serviceList.php",
      "API_DOCUMENTATION"
    ),
    source(
      "th-hii-thaiwater",
      "Hydro-Informatics Institute — ThaiWater",
      "HII_THAIWATER",
      [
        capability(
          "th-hii-water-observations",
          "Integrated water observations",
          ["MEASUREMENT"]
        ),
        capability("th-hii-water-forecast", "Water situation forecast", [
          "FORECAST",
        ]),
      ],
      "https://standard.thaiwater.net/",
      "API_DOCUMENTATION"
    ),
    source(
      "th-gistda-flood-observations",
      "Geo-Informatics and Space Technology Development Agency — flood observations",
      "GISTDA",
      [
        capability(
          "th-gistda-flood-observation",
          "Remote-sensing flood observation",
          ["REMOTE_SENSING_OBSERVATION"]
        ),
      ],
      "https://disaster.gistda.or.th/services/open-api",
      "API_DOCUMENTATION"
    ),
    source(
      "th-ddpm-public-warnings",
      "Department of Disaster Prevention and Mitigation — warnings",
      "DDPM_NDWC",
      [
        capability("th-ddpm-official-warning", "Official disaster warning", [
          "OFFICIAL_WARNING",
        ]),
      ],
      "https://gis-portal.disaster.go.th/arcgis/rest/services",
      "OFFICIAL_DATA_PAGE"
    ),
    source(
      "th-tmd-weather-warnings",
      "Thai Meteorological Department — weather warnings",
      "TMD",
      [
        capability("th-tmd-weather-warning", "Official weather warning", [
          "OFFICIAL_WARNING",
        ]),
        capability("th-tmd-weather-forecast", "Weather forecast", ["FORECAST"]),
      ],
      "https://www.tmd.go.th/service/tmdData",
      "OFFICIAL_DATA_PAGE"
    ),
    source(
      "th-tide-levels",
      "Thai tide and coastal observation sources",
      "THAI_TIDE",
      [
        capability("th-tide-level-observation", "Tide level observation", [
          "MEASUREMENT",
        ]),
        capability("th-coastal-condition", "Coastal condition observation", [
          "MEASUREMENT",
          "FORECAST",
        ]),
      ],
      "https://hydro.navy.mi.th/storage/frontend/article/23036/file/th/TN2026.pdf",
      "OFFICIAL_DATA_PAGE"
    ),
    source(
      "th-road-highway-status",
      "Thai road and highway authorities",
      "THAI_ROAD_AUTHORITY",
      [
        capability("th-road-disruption", "Road disruption status", [
          "OPERATIONAL_STATUS",
          "OFFICIAL_WARNING",
        ]),
      ],
      "https://www.doh.go.th/",
      "OFFICIAL_PORTAL"
    ),
    source(
      "th-local-authority-reports",
      "Thai local authorities",
      "THAI_LOCAL_AUTHORITY",
      [
        capability(
          "th-local-incident-report",
          "Local authority incident report",
          ["LOCAL_AUTHORITY_REPORT"]
        ),
      ],
      "https://www.dla.go.th/",
      "RESEARCH_LEAD"
    ),
    source(
      "th-thai-news-reports",
      "Thai news sources",
      "THAI_NEWS",
      [
        capability("th-news-hazard-report", "News-reported hazard lead", [
          "MEDIA_REPORT",
        ]),
      ],
      "https://www.thaipbs.or.th/news",
      "RESEARCH_LEAD"
    ),
  ]),
});

export interface ThailandQualificationEvidence {
  readonly endpointVerified: boolean;
  readonly accessVerified: boolean;
  readonly contractFixtureVerified: boolean;
  readonly schemaVerified: boolean;
  readonly cadenceVerified: boolean;
  readonly rightsGranted: boolean;
  readonly attributionVerified: boolean;
  readonly coverageVerified: boolean;
  readonly licenseRef?: string;
  readonly attribution?: string;
  readonly expectedCadenceSeconds?: number;
  readonly staleAfterSeconds?: number;
  readonly retentionClass?: string;
  readonly verifiedGeographies?: readonly string[];
}

export function getThailandProviderPack(): ThailandProviderPack {
  return pack;
}

function isNonEmptyText(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 512
  );
}

function isSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function validGeographyCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:TH|TH-[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,12}){0,3})$/.test(value)
  );
}

function geographyContains(parent: string, child: string): boolean {
  return parent === child || child.startsWith(`${parent}-`);
}

function hasGeographicProof(
  capabilityDefinition: ThailandCapabilityDefinition,
  evidenceGeographies: readonly string[],
  requestedGeography?: string
): boolean {
  if (
    evidenceGeographies.length === 0 ||
    evidenceGeographies.some(code => !validGeographyCode(code))
  )
    return false;
  if (requestedGeography && !validGeographyCode(requestedGeography))
    return false;
  const targetMatches = capabilityDefinition.geographyScopes.some(target =>
    evidenceGeographies.some(
      verified =>
        geographyContains(target, verified) ||
        geographyContains(verified, target)
    )
  );
  if (!targetMatches) return false;
  return (
    requestedGeography === undefined ||
    evidenceGeographies.some(verified =>
      geographyContains(verified, requestedGeography)
    )
  );
}

/** Qualification requires captured, source-specific evidence; manifest candidacy alone can never activate an adapter. */
export function isThailandCapabilityQualified(
  sourceDefinition: ThailandSourceDefinition,
  capabilityDefinition: ThailandCapabilityDefinition,
  evidence: Partial<ThailandQualificationEvidence>,
  requestedGeography?: string
): boolean {
  const canonicalSource = pack.sources.find(
    candidate => candidate.sourceId === sourceDefinition.sourceId
  );
  const canonicalCapability = canonicalSource?.capabilities.find(
    candidate => candidate.capabilityId === capabilityDefinition.capabilityId
  );
  if (
    !canonicalSource ||
    !canonicalCapability ||
    !sourceDefinition.capabilities.some(
      candidate => candidate.capabilityId === capabilityDefinition.capabilityId
    ) ||
    evidence.endpointVerified !== true ||
    evidence.accessVerified !== true ||
    evidence.contractFixtureVerified !== true ||
    evidence.schemaVerified !== true ||
    evidence.cadenceVerified !== true ||
    evidence.rightsGranted !== true ||
    evidence.attributionVerified !== true ||
    evidence.coverageVerified !== true ||
    !isSafeHttpsUrl(evidence.licenseRef) ||
    !isNonEmptyText(evidence.attribution) ||
    !Number.isSafeInteger(evidence.expectedCadenceSeconds) ||
    (evidence.expectedCadenceSeconds ?? 0) < 1 ||
    (evidence.expectedCadenceSeconds ?? 0) > 31 * 24 * 60 * 60 ||
    !Number.isSafeInteger(evidence.staleAfterSeconds) ||
    (evidence.staleAfterSeconds ?? 0) <
      (evidence.expectedCadenceSeconds ?? Number.MAX_SAFE_INTEGER) ||
    (evidence.staleAfterSeconds ?? 0) > 31 * 24 * 60 * 60 ||
    !isNonEmptyText(evidence.retentionClass) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(evidence.retentionClass) ||
    !Array.isArray(evidence.verifiedGeographies)
  )
    return false;
  return hasGeographicProof(
    canonicalCapability,
    evidence.verifiedGeographies,
    requestedGeography
  );
}
