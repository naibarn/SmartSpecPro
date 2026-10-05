/**
 * Shared, authority-neutral intent for the Spec 262 adaptive emergency feed.
 *
 * Parsing a focus validates only bounded client input. It never grants access
 * to a tenant, audience, protected geometry, or any referenced domain record.
 * Consumers must resolve and authorize every reference on every request.
 */
export type FeedFocusMode = "FOLLOW_MAP" | "CURRENT_LOCATION" | "SAVED_AREA" | "SELECTED_AREA" | "ROUTE_CORRIDOR";
export type ViewportZoomClass = "SITE" | "NEIGHBORHOOD" | "DISTRICT" | "PROVINCE" | "REGION" | "COUNTRY" | "CONTINENT";
export type FeedFocusSource = "VIEWPORT" | "CURRENT_LOCATION" | "SAVED_AREA" | "SELECTED_AREA" | "ROUTE_CORRIDOR";
export type FeedSpatialClassification = "IN_VIEWPORT" | "AFFECTS_VIEWPORT" | "CRITICAL_OVERRIDE";
export type FeedRelevanceReason = "OFFICIAL_ALERT_SCOPE" | "UPSTREAM_HYDRO" | "DOWNSTREAM_HYDRO" | "APPROACHING_WEATHER" | "ROUTE_DEPENDENCY" | "CRITICAL_REGIONAL_EVENT";

export interface FeedFocusViewport {
  readonly west: number;
  readonly south: number;
  readonly east: number;
  readonly north: number;
}

/** A stable ID is still only an input; it is deliberately not a capability. */
export interface FeedFocusReference {
  readonly kind: string;
  readonly id: string;
  readonly revision: number;
}

export interface FeedFocusRequest {
  readonly version: 1;
  readonly crs: "EPSG:4326";
  readonly viewport: FeedFocusViewport;
  readonly zoom: number;
  readonly mode: FeedFocusMode;
  readonly focusRef?: FeedFocusReference;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ViewportZoomThreshold {
  readonly zoomClass: ViewportZoomClass;
  /** Inclusive lower bound. */
  readonly minimumZoom: number;
  /** Exclusive upper bound, except the final 22. */
  readonly maximumZoom: number;
}

export interface FeedImpactExtension {
  readonly classification: Exclude<FeedSpatialClassification, "IN_VIEWPORT">;
  readonly relevance: FeedRelevanceReason;
  readonly ref: FeedFocusReference;
}

export interface FeedFocusEnvelope {
  readonly version: 1;
  readonly request: FeedFocusRequest;
  readonly source: FeedFocusSource;
  readonly zoomClass: ViewportZoomClass;
  /** Refs and reason codes only: no source geometry, private location, or authority claims. */
  readonly impactExtensions: readonly FeedImpactExtension[];
}

export interface FeedFocusRefreshPolicy {
  readonly zoomPolicy: readonly ViewportZoomThreshold[];
  /** A ratio in [0, 1]. Refresh when overlap drops below this value. */
  readonly minimumOverlapRatio: number;
}

export type SettledViewportDecision =
  | { readonly accepted: true; readonly locked: false; readonly focus: FeedFocusRequest }
  | { readonly accepted: false; readonly locked: boolean };

const MAX_MERCATOR_LATITUDE = 85;
const MAX_AXIS_SPAN = 20;
const MAX_ZOOM = 22;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CURSOR_LENGTH = 256;
const MAX_EXTENSIONS = 12;
const REF_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REF_KIND = /^[a-z][a-z0-9-]{0,39}$/;
const CURSOR = /^[A-Za-z0-9._~-]{1,256}$/;

const modes = new Set<FeedFocusMode>(["FOLLOW_MAP", "CURRENT_LOCATION", "SAVED_AREA", "SELECTED_AREA", "ROUTE_CORRIDOR"]);
const zoomClasses = new Set<ViewportZoomClass>(["SITE", "NEIGHBORHOOD", "DISTRICT", "PROVINCE", "REGION", "COUNTRY", "CONTINENT"]);
const sources = new Set<FeedFocusSource>(["VIEWPORT", "CURRENT_LOCATION", "SAVED_AREA", "SELECTED_AREA", "ROUTE_CORRIDOR"]);
const classifications = new Set<Exclude<FeedSpatialClassification, "IN_VIEWPORT">>(["AFFECTS_VIEWPORT", "CRITICAL_OVERRIDE"]);
const relevanceReasons = new Set<FeedRelevanceReason>(["OFFICIAL_ALERT_SCOPE", "UPSTREAM_HYDRO", "DOWNSTREAM_HYDRO", "APPROACHING_WEATHER", "ROUTE_DEPENDENCY", "CRITICAL_REGIONAL_EVENT"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isFiniteNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function parseViewport(value: unknown): FeedFocusViewport | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["west", "south", "east", "north"]) ||
    !isFiniteNumber(value.west, -180, 180) || !isFiniteNumber(value.east, -180, 180) ||
    !isFiniteNumber(value.south, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) || !isFiniteNumber(value.north, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE) ||
    value.east <= value.west || value.north <= value.south || value.east - value.west > MAX_AXIS_SPAN || value.north - value.south > MAX_AXIS_SPAN) return undefined;
  return { west: value.west, south: value.south, east: value.east, north: value.north };
}

function parseReference(value: unknown): FeedFocusReference | undefined {
  const revision = isPlainRecord(value) ? value.revision : undefined;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["kind", "id", "revision"]) ||
    typeof value.kind !== "string" || !REF_KIND.test(value.kind) ||
    typeof value.id !== "string" || !REF_ID.test(value.id) ||
    !isSafeInteger(revision) || revision < 1 || revision > 2_147_483_647) return undefined;
  return { kind: value.kind, id: value.id, revision };
}

function isReferenceRequired(mode: FeedFocusMode): boolean {
  return mode === "SAVED_AREA" || mode === "SELECTED_AREA" || mode === "ROUTE_CORRIDOR";
}

function supportsFocusMode(mode: FeedFocusMode, ref: FeedFocusReference | undefined): boolean {
  if (!isReferenceRequired(mode)) return ref === undefined;
  if (!ref) return false;
  return mode === "ROUTE_CORRIDOR" ? ref.kind === "route" : ref.kind === "public-area";
}

/**
 * Parses one page intent. `cursor` is intentionally validated as opaque text;
 * its audience, filter hash, projection revision and authorization binding are
 * a server responsibility.
 */
export function parseFeedFocusRequest(value: unknown): FeedFocusRequest | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["version", "crs", "viewport", "zoom", "mode", "focusRef", "cursor", "limit"]) ||
    value.version !== 1 || value.crs !== "EPSG:4326" || !isFiniteNumber(value.zoom, 0, MAX_ZOOM) ||
    typeof value.mode !== "string" || !modes.has(value.mode as FeedFocusMode)) return undefined;

  const viewport = parseViewport(value.viewport);
  const focusRef = value.focusRef === undefined ? undefined : parseReference(value.focusRef);
  const cursor = value.cursor === undefined ? undefined : typeof value.cursor === "string" && CURSOR.test(value.cursor) ? value.cursor : undefined;
  const limit = value.limit === undefined ? DEFAULT_LIMIT : typeof value.limit === "number" ? value.limit : undefined;
  if (!viewport || (value.focusRef !== undefined && !focusRef) || (value.cursor !== undefined && !cursor) ||
    limit === undefined || !Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT || !supportsFocusMode(value.mode as FeedFocusMode, focusRef)) return undefined;

  return {
    version: 1,
    crs: "EPSG:4326",
    viewport,
    zoom: value.zoom,
    mode: value.mode as FeedFocusMode,
    ...(focusRef ? { focusRef } : {}),
    ...(cursor ? { cursor } : {}),
    limit,
  };
}

function isValidZoomPolicy(policy: readonly ViewportZoomThreshold[]): boolean {
  if (policy.length === 0) return false;
  const sorted = [...policy].sort((left, right) => left.minimumZoom - right.minimumZoom);
  if (sorted[0]?.minimumZoom !== 0 || sorted[sorted.length - 1]?.maximumZoom !== MAX_ZOOM) return false;
  return sorted.every((threshold, index) => zoomClasses.has(threshold.zoomClass) &&
    Number.isFinite(threshold.minimumZoom) && Number.isFinite(threshold.maximumZoom) &&
    threshold.minimumZoom < threshold.maximumZoom &&
    (index === 0 || threshold.minimumZoom === sorted[index - 1]?.maximumZoom));
}

/** Policy is injected by the server/runtime; no UI-owned threshold constants exist here. */
export function classifyViewportZoom(zoom: number, policy: readonly ViewportZoomThreshold[]): ViewportZoomClass | undefined {
  if (!isFiniteNumber(zoom, 0, MAX_ZOOM) || !isValidZoomPolicy(policy)) return undefined;
  const matches = policy.filter(threshold => zoom >= threshold.minimumZoom && (zoom < threshold.maximumZoom || (zoom === MAX_ZOOM && threshold.maximumZoom === MAX_ZOOM)));
  return matches.length === 1 ? matches[0]?.zoomClass : undefined;
}

/** The intersection area as a share of the smaller bounded viewport. */
export function viewportOverlapRatio(left: FeedFocusViewport, right: FeedFocusViewport): number {
  const parsedLeft = parseViewport(left);
  const parsedRight = parseViewport(right);
  if (!parsedLeft || !parsedRight) return 0;
  const width = Math.max(0, Math.min(parsedLeft.east, parsedRight.east) - Math.max(parsedLeft.west, parsedRight.west));
  const height = Math.max(0, Math.min(parsedLeft.north, parsedRight.north) - Math.max(parsedLeft.south, parsedRight.south));
  const intersection = width * height;
  const smallerArea = Math.min((parsedLeft.east - parsedLeft.west) * (parsedLeft.north - parsedLeft.south), (parsedRight.east - parsedRight.west) * (parsedRight.north - parsedRight.south));
  return smallerArea > 0 ? intersection / smallerArea : 0;
}

/**
 * Returns whether a settled viewport needs a new feed page. Invalid intents are
 * suppressed (rather than coerced); a caller can surface validation feedback.
 */
export function shouldRefreshFeedFocus(nextValue: unknown, previousValue: unknown, policy: FeedFocusRefreshPolicy): boolean {
  const next = parseFeedFocusRequest(nextValue);
  const previous = parseFeedFocusRequest(previousValue);
  if (!next || !previous || !Number.isFinite(policy.minimumOverlapRatio) || policy.minimumOverlapRatio < 0 || policy.minimumOverlapRatio > 1) return false;
  if (next.mode !== previous.mode || next.focusRef?.kind !== previous.focusRef?.kind || next.focusRef?.id !== previous.focusRef?.id || next.focusRef?.revision !== previous.focusRef?.revision || next.cursor !== previous.cursor || next.limit !== previous.limit) return true;
  const nextClass = classifyViewportZoom(next.zoom, policy.zoomPolicy);
  const previousClass = classifyViewportZoom(previous.zoom, policy.zoomPolicy);
  if (!nextClass || !previousClass) return false;
  return nextClass !== previousClass || viewportOverlapRatio(next.viewport, previous.viewport) < policy.minimumOverlapRatio;
}

/**
 * Small state holder for a UI hook/service after its map-load/moveend debounce.
 * It deliberately has no timers, network calls, cursor decoding, or authority;
 * the caller owns debouncing, aborting stale fetches and server reauthorization.
 */
export class ViewportIntentStabilizer {
  private lastAccepted: FeedFocusRequest | undefined;
  private lockedFocus: FeedFocusRequest | undefined;

  public constructor(private readonly policy: FeedFocusRefreshPolicy) {}

  public consider(value: unknown): SettledViewportDecision {
    const next = parseFeedFocusRequest(value);
    if (!next) return { accepted: false, locked: Boolean(this.lockedFocus) };
    if (this.lockedFocus) return { accepted: false, locked: true };
    if (!this.lastAccepted || shouldRefreshFeedFocus(next, this.lastAccepted, this.policy)) {
      this.lastAccepted = next;
      return { accepted: true, locked: false, focus: next };
    }
    return { accepted: false, locked: false };
  }

  /** Locks only an already accepted, normalized focus. */
  public lock(): boolean {
    if (!this.lastAccepted || this.lockedFocus) return false;
    this.lockedFocus = this.lastAccepted;
    return true;
  }

  public unlock(): boolean {
    if (!this.lockedFocus) return false;
    this.lockedFocus = undefined;
    return true;
  }

  public current(): FeedFocusRequest | undefined {
    return this.lockedFocus ?? this.lastAccepted;
  }
}

function parseImpactExtension(value: unknown): FeedImpactExtension | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["classification", "relevance", "ref"]) ||
    typeof value.classification !== "string" || !classifications.has(value.classification as Exclude<FeedSpatialClassification, "IN_VIEWPORT">) ||
    typeof value.relevance !== "string" || !relevanceReasons.has(value.relevance as FeedRelevanceReason)) return undefined;
  const ref = parseReference(value.ref);
  return ref ? { classification: value.classification as Exclude<FeedSpatialClassification, "IN_VIEWPORT">, relevance: value.relevance as FeedRelevanceReason, ref } : undefined;
}

/**
 * Validates a no-geometry focus snapshot for use between UI/feed components.
 * This is descriptive context only; server-side source and impact relations
 * remain canonical and must be independently recomputed.
 */
export function parseFeedFocusEnvelope(value: unknown): FeedFocusEnvelope | undefined {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, ["version", "request", "source", "zoomClass", "impactExtensions"]) || value.version !== 1 ||
    typeof value.source !== "string" || !sources.has(value.source as FeedFocusSource) ||
    typeof value.zoomClass !== "string" || !zoomClasses.has(value.zoomClass as ViewportZoomClass) ||
    !Array.isArray(value.impactExtensions) || value.impactExtensions.length > MAX_EXTENSIONS) return undefined;
  const request = parseFeedFocusRequest(value.request);
  const impactExtensions = value.impactExtensions.map(parseImpactExtension);
  if (!request || impactExtensions.some(extension => !extension)) return undefined;
  const expectedSource: FeedFocusSource = request.mode === "FOLLOW_MAP" ? "VIEWPORT" : request.mode;
  if (value.source !== expectedSource) return undefined;
  return {
    version: 1,
    request,
    source: value.source as FeedFocusSource,
    zoomClass: value.zoomClass as ViewportZoomClass,
    impactExtensions: impactExtensions as FeedImpactExtension[],
  };
}
