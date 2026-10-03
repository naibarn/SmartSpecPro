/**
 * Deterministic, authority-neutral feed policy primitives for Spec 262.
 *
 * Callers must authorize and normalize candidate evidence before using these
 * functions. These primitives do not fetch sources, infer hazards, or grant
 * actions from a rank.
 */
export const FEED_POLICY_VERSION = "spec262-feed-v1";

export type FeedFactClass = "OBSERVATION" | "FORECAST" | "OFFICIAL_ALERT" | "DERIVED_RISK" | "AI_EXPLANATION";
export type FeedFreshness = "FRESH" | "STALE" | "EXPIRED" | "UNKNOWN";
export type FeedAuthority = "OFFICIAL" | "VERIFIED" | "UNVERIFIED" | "CONFLICTING" | "RETRACTED";
export type FeedSpatialRelation = "IN_VIEWPORT" | "AFFECTS_VIEWPORT" | "CRITICAL_OVERRIDE" | "TENANT_LOCAL";
export type FeedRelevanceReason =
  | "SAFETY_PRIORITY"
  | "CRITICAL_OFFICIAL_ALERT"
  | "OFFICIAL_AUTHORITY"
  | "VERIFIED_SOURCE"
  | "FOCUS_MATCH"
  | "AFFECTS_FOCUS"
  | "CRITICAL_OVERRIDE"
  | "MATERIAL_CHANGE"
  | "OPERATIONAL_RELEVANCE"
  | "STALE_CONTEXT"
  | "UNKNOWN_FRESHNESS"
  | "CONFLICTING_AUTHORITY";

export interface SituationFeedCandidate {
  readonly id: string;
  /** Stable canonical lineage selected upstream; an opaque ID is not authority. */
  readonly threadId: string;
  readonly factClass: FeedFactClass;
  /** Explicit trusted policy input, 0–100. This code never derives severity. */
  readonly safetyPriority: number;
  readonly authority: FeedAuthority;
  readonly sourceQuality: number;
  readonly spatialRelation: FeedSpatialRelation;
  readonly materiality: number;
  readonly operationalRelevance: number;
  readonly freshness: FeedFreshness;
  readonly observedAt?: string;
  /** Included for provenance only; freshness is not based on fetch time. */
  readonly fetchedAt?: string;
  readonly sponsored?: boolean;
  readonly relevanceReasons?: readonly FeedRelevanceReason[];
  /** Set only after the source record is authorized and safe for this public projection. */
  readonly lane?: LocalSituationFeedLane;
  /** Same group means syndicated copies of the same trusted item. */
  readonly duplicateGroupId?: string;
  /** Canonical material inputs supplied by the owning feed service. */
  readonly materialFingerprint?: string;
}

export type LocalSituationFeedLane =
  | "CRITICAL_SAFETY"
  | "LOCAL_SITUATION"
  | "LOCAL_UTILITY"
  | "MAJOR_NEWS"
  | "RECOVERY_SERVICES"
  | "COMMUNITY"
  | "SPONSORED_RELEVANT";

export type LocalSituationFeedSourceKind = "situation" | "alert" | "facility";

export interface LocalSituationFeedSourceRecord {
  readonly kind: LocalSituationFeedSourceKind;
  readonly publicRef: string;
  readonly title: string;
  readonly status: string;
  readonly severity: string;
  readonly freshness: "current" | "stale" | "unknown";
  readonly observedAt?: string | null;
  readonly updatedAt?: string | null;
  readonly situationRef?: string | null;
  readonly spatialRelation?: FeedSpatialRelation;
}

export interface LocalSituationFeedItem extends RankedSituationFeedItem {
  readonly publicRef: string;
  readonly title: string;
  readonly status: string;
  readonly lane: LocalSituationFeedLane;
  readonly placement: { readonly type: "ORGANIC" | "SPONSORED"; readonly label: string | null };
  readonly provenance: {
    readonly sourceKind: LocalSituationFeedSourceKind;
    readonly sourceRef: string;
    readonly publisher: "AUTHORIZED_EMERGENCY_OPERATIONS" | "VERIFIED_FACILITY" | "PUBLIC_SITUATION_PROJECTION";
    readonly observedAt: string | null;
    readonly recordUpdatedAt: string | null;
    readonly freshness: FeedFreshness;
  };
}

export interface LocalSituationFeed extends Omit<SituationDigest, "items"> {
  readonly items: readonly LocalSituationFeedItem[];
}

export interface RankedSituationFeedItem extends SituationFeedCandidate {
  readonly policyVersion: typeof FEED_POLICY_VERSION;
  readonly score: number;
  readonly reasons: readonly FeedRelevanceReason[];
}

export interface SituationDigest {
  readonly policyVersion: typeof FEED_POLICY_VERSION;
  readonly items: readonly RankedSituationFeedItem[];
  readonly truncated: boolean;
  readonly omittedCount: number;
}

export interface FeedFreshnessInput {
  readonly now: string;
  readonly observedAt?: string;
  readonly validUntil?: string;
  readonly maximumAgeMinutes?: number;
  readonly fetchedAt?: string;
}

export type WeatherFeedSlot = "NOW" | "NEXT_1H" | "NEXT_3H" | "THIS_AFTERNOON" | "THIS_EVENING" | "TONIGHT" | "TOMORROW" | "LATER";

export interface WeatherSlotCandidate {
  readonly id: string;
  readonly slot: WeatherFeedSlot;
  /** Opaque material comparison value produced from normalized provider facts. */
  readonly fingerprint: string;
}

const authorityWeight: Readonly<Record<FeedAuthority, number>> = {
  OFFICIAL: 40,
  VERIFIED: 30,
  UNVERIFIED: 10,
  CONFLICTING: 5,
  RETRACTED: 0,
};
const spatialWeight: Readonly<Record<FeedSpatialRelation, number>> = {
  CRITICAL_OVERRIDE: 30,
  IN_VIEWPORT: 20,
  AFFECTS_VIEWPORT: 10,
  TENANT_LOCAL: 0,
};
const freshnessWeight: Readonly<Record<FeedFreshness, number>> = {
  FRESH: 15,
  STALE: -20,
  EXPIRED: -35,
  UNKNOWN: -10,
};

function bounded(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function parseTime(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? undefined : milliseconds;
}

function isCriticalOfficial(candidate: SituationFeedCandidate): boolean {
  return candidate.factClass === "OFFICIAL_ALERT" && candidate.authority === "OFFICIAL" && bounded(candidate.safetyPriority) >= 90;
}

function orderedReasons(candidate: SituationFeedCandidate): readonly FeedRelevanceReason[] {
  const reasons = new Set<FeedRelevanceReason>(candidate.relevanceReasons ?? []);
  reasons.add("SAFETY_PRIORITY");
  if (isCriticalOfficial(candidate)) reasons.add("CRITICAL_OFFICIAL_ALERT");
  if (candidate.authority === "OFFICIAL") reasons.add("OFFICIAL_AUTHORITY");
  if (candidate.authority === "VERIFIED") reasons.add("VERIFIED_SOURCE");
  if (candidate.authority === "CONFLICTING") reasons.add("CONFLICTING_AUTHORITY");
  if (candidate.spatialRelation === "IN_VIEWPORT") reasons.add("FOCUS_MATCH");
  if (candidate.spatialRelation === "AFFECTS_VIEWPORT") reasons.add("AFFECTS_FOCUS");
  if (candidate.spatialRelation === "CRITICAL_OVERRIDE") reasons.add("CRITICAL_OVERRIDE");
  if (bounded(candidate.materiality) > 0) reasons.add("MATERIAL_CHANGE");
  if (bounded(candidate.operationalRelevance) > 0) reasons.add("OPERATIONAL_RELEVANCE");
  if (candidate.freshness === "STALE" || candidate.freshness === "EXPIRED") reasons.add("STALE_CONTEXT");
  if (candidate.freshness === "UNKNOWN") reasons.add("UNKNOWN_FRESHNESS");
  return [...reasons].sort();
}

function scoreCandidate(candidate: SituationFeedCandidate): number {
  // Sponsorship deliberately does not participate in the safety rank.
  return bounded(candidate.safetyPriority) * 1_000 + authorityWeight[candidate.authority] * 100 +
    bounded(candidate.sourceQuality) * 10 + spatialWeight[candidate.spatialRelation] * 10 +
    bounded(candidate.materiality) + bounded(candidate.operationalRelevance) + freshnessWeight[candidate.freshness] * 10;
}

function compareRanked(left: RankedSituationFeedItem, right: RankedSituationFeedItem): number {
  const criticalDifference = Number(isCriticalOfficial(right)) - Number(isCriticalOfficial(left));
  if (criticalDifference) return criticalDifference;
  if (right.score !== left.score) return right.score - left.score;
  return left.id.localeCompare(right.id);
}

/** Ranks pre-authorized candidates only; it cannot establish their truth or audience. */
export function rankSituationFeedCandidates(candidates: readonly SituationFeedCandidate[]): readonly RankedSituationFeedItem[] {
  const ranked = candidates.map(candidate => ({
    ...candidate,
    policyVersion: FEED_POLICY_VERSION,
    score: scoreCandidate(candidate),
    reasons: orderedReasons(candidate),
  } satisfies RankedSituationFeedItem)).sort(compareRanked);

  const seenDuplicateGroups = new Set<string>();
  return ranked.filter(item => {
    if (!item.duplicateGroupId) return true;
    if (seenDuplicateGroups.has(item.duplicateGroupId)) return false;
    seenDuplicateGroups.add(item.duplicateGroupId);
    return true;
  });
}

/**
 * Computes freshness from the source's observation/validity timestamps.
 * `fetchedAt` is intentionally ignored so backfill cannot become current.
 */
export function classifyFeedFreshness(input: FeedFreshnessInput): FeedFreshness {
  const now = parseTime(input.now);
  if (now === undefined) return "UNKNOWN";
  const validUntil = parseTime(input.validUntil);
  if (validUntil !== undefined && validUntil < now) return "EXPIRED";
  const observedAt = parseTime(input.observedAt);
  if (observedAt === undefined) return "UNKNOWN";
  const maximumAgeMinutes = input.maximumAgeMinutes ?? 60;
  if (!Number.isFinite(maximumAgeMinutes) || maximumAgeMinutes < 0) return "UNKNOWN";
  return now - observedAt <= maximumAgeMinutes * 60_000 ? "FRESH" : "STALE";
}

/** Keeps critical alerts even when the regular digest budget is exhausted. */
export function buildSituationDigest(rankedItems: readonly RankedSituationFeedItem[], options: { readonly budget?: number } = {}): SituationDigest {
  const budget = Math.max(5, Math.min(10, Math.trunc(options.budget ?? 7)) || 7);
  const critical = rankedItems.filter(isCriticalOfficial);
  const ordinary = rankedItems.filter(item => !isCriticalOfficial(item));
  const items = [...critical, ...ordinary.slice(0, Math.max(0, budget - critical.length))];
  return { policyVersion: FEED_POLICY_VERSION, items, truncated: items.length < rankedItems.length, omittedCount: rankedItems.length - items.length };
}

/** A thread revision occurs only when canonical lineage or supplied material facts change. */
export function compareFeedMaterialChange(previous: SituationFeedCandidate, next: SituationFeedCandidate): { readonly changed: boolean; readonly reason: "UNCHANGED" | "THREAD_CHANGED" | "MATERIAL_FINGERPRINT_CHANGED" } {
  if (previous.threadId !== next.threadId) return { changed: true, reason: "THREAD_CHANGED" };
  return previous.materialFingerprint === next.materialFingerprint
    ? { changed: false, reason: "UNCHANGED" }
    : { changed: true, reason: "MATERIAL_FINGERPRINT_CHANGED" };
}

/** Coalesces an unchanged evening/night forecast while preserving the first stable card. */
export function coalesceWeatherSlots(candidates: readonly WeatherSlotCandidate[]): readonly WeatherSlotCandidate[] {
  const eveningFingerprints = new Set(candidates.filter(candidate => candidate.slot === "THIS_EVENING").map(candidate => candidate.fingerprint));
  return candidates.filter(candidate => {
    return candidate.slot !== "TONIGHT" || !eveningFingerprints.has(candidate.fingerprint);
  });
}


const emergencySeverityPriority: Readonly<Record<string, number>> = {
  critical: 100,
  high: 80,
  moderate: 60,
  low: 35,
  unknown: 15,
};

function normalizedInstant(value: string | null | undefined): string | undefined {
  return value && parseTime(value) !== undefined ? value : undefined;
}

export function getFeedPlacement(sponsored: boolean): LocalSituationFeedItem["placement"] {
  return sponsored
    ? { type: "SPONSORED", label: "Sponsored" }
    : { type: "ORGANIC", label: null };
}

/**
 * Projects only publishable emergency map records into the shared feed policy.
 * This does not synthesize utility/commerce/news/transport sources or replace
 * the canonical emergency tables that own the facts.
 */
export function composeLocalSituationFeed(
  sourceItems: readonly LocalSituationFeedSourceRecord[],
  options: { readonly budget?: number; readonly generatedAt: string }
): LocalSituationFeed {
  const fetchedAt = normalizedInstant(options.generatedAt);
  const candidates: LocalSituationFeedItem[] = [];
  for (const source of sourceItems) {
    if (!source.publicRef || source.publicRef.length > 64 || !source.title || !source.status) continue;
    if (source.kind === "alert" && !["published", "updated"].includes(source.status)) continue;
    if (source.kind === "facility" && !["open", "limited", "full"].includes(source.status)) continue;
    if (source.kind === "situation" && !["monitoring", "active", "contained", "resolved"].includes(source.status)) continue;

    const safetyPriority = emergencySeverityPriority[source.severity.toLowerCase()] ?? emergencySeverityPriority.unknown;
    const lane: LocalSituationFeedLane = source.kind === "facility"
      ? "LOCAL_UTILITY"
      : source.kind === "alert" && safetyPriority >= 90
        ? "CRITICAL_SAFETY"
        : "LOCAL_SITUATION";
    const authority: FeedAuthority = source.kind === "alert"
      ? "OFFICIAL"
      : source.kind === "facility"
        ? "VERIFIED"
        : "UNVERIFIED";
    const factClass: FeedFactClass = source.kind === "alert" ? "OFFICIAL_ALERT" : "OBSERVATION";
    const freshness: FeedFreshness = source.freshness === "current"
      ? "FRESH"
      : source.freshness === "stale"
        ? "STALE"
        : "UNKNOWN";
    const observedAt = normalizedInstant(source.observedAt);
    const recordUpdatedAt = normalizedInstant(source.updatedAt);
    const id = `${source.kind}:${source.publicRef}`;
    const candidate: SituationFeedCandidate = {
      id,
      threadId: source.kind === "alert" && source.situationRef
        ? `situation:${source.situationRef}`
        : `${source.kind}:${source.publicRef}`,
      factClass,
      safetyPriority,
      authority,
      sourceQuality: source.kind === "alert" ? 90 : source.kind === "facility" ? 75 : 30,
      spatialRelation: source.spatialRelation ?? "TENANT_LOCAL",
      materiality: safetyPriority,
      operationalRelevance: source.kind === "alert" ? 100 : source.kind === "facility" ? 80 : 50,
      freshness,
      ...(observedAt ? { observedAt } : {}),
      ...(fetchedAt ? { fetchedAt } : {}),
      sponsored: false,
      lane,
    };
    candidates.push({
      ...candidate,
      policyVersion: FEED_POLICY_VERSION,
      score: scoreCandidate(candidate),
      reasons: orderedReasons(candidate),
      publicRef: source.publicRef,
      title: source.title.trim().slice(0, 200),
      status: source.status.slice(0, 32),
      placement: getFeedPlacement(false),
      provenance: {
        sourceKind: source.kind,
        sourceRef: source.publicRef,
        publisher: source.kind === "alert"
          ? "AUTHORIZED_EMERGENCY_OPERATIONS"
          : source.kind === "facility"
            ? "VERIFIED_FACILITY"
            : "PUBLIC_SITUATION_PROJECTION",
        observedAt: observedAt ?? null,
        recordUpdatedAt: recordUpdatedAt ?? null,
        freshness,
      },
    });
  }
  const digest = buildSituationDigest(candidates.sort(compareRanked), options);
  return { ...digest, items: digest.items as readonly LocalSituationFeedItem[] };
}
