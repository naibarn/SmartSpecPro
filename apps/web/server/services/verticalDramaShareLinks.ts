/**
 * Vertical Drama Series — read-only share links (Collab-lite L1, task #32,
 * F131AA). See `planning/vertical-drama-share-links/plan.md` for the full
 * design.
 *
 * Owns:
 *  - Token generation/hashing (`generateRawShareToken`/`hashShareToken`) —
 *    same "32 random bytes -> base64url, store ONLY the SHA-256 hex hash"
 *    convention as `libraryService.ts`'s `hashPublicShareToken` (the closest
 *    existing precedent in this codebase for a public, unauthenticated
 *    share-token surface — see that file's `PUBLIC_SHARE_TOKEN_BYTES`/
 *    `hashPublicShareToken`). Deliberately PLAIN `sha256`, not an HMAC with a
 *    server pepper (contrast `apiKeyService.ts`'s `computeKeyHash`, which
 *    pephers a much shorter/prefixed key) — the raw token already carries
 *    256 bits of entropy from `crypto.randomBytes(32)`, so a pepper adds no
 *    meaningful protection here, and matching the library precedent keeps
 *    this codebase's two "public share token" implementations consistent.
 *  - Owner-side CRUD (`createSeriesShareLink`/`listSeriesShareLinks`/
 *    `revokeSeriesShareLink`) — called from `routers/verticalDramaSeries.ts`
 *    AFTER that router's own `loadOwnedSeries` ownership check, and scoped
 *    again here by `tenantId`+`seriesId` as defense in depth.
 *  - The public read path (`resolveSharedSeriesProjection`) — hash lookup,
 *    expiry/revocation check, accessCount/lastAccessedAt bump, and the
 *    WHITELIST projection DTO. Called from the separate, fully public
 *    `routers/verticalDramaShare.ts` router. Every failure mode (unknown
 *    token, expired, revoked, orphaned row) throws the exact SAME
 *    `NOT_FOUND` + `SHARE_LINK_GENERIC_ERROR_MESSAGE` — never distinguishing
 *    — so a caller cannot enumerate which reason a token is dead.
 *
 * Whitelist projection — deliberately hand-picks a tiny number of primitive
 * fields off `verticalDramaSeries`/`verticalDramaEpisodes`' loosely-typed
 * jsonb columns (`bible`, `script`, `assemblyManifest`, `dialogueAudioPlan`)
 * rather than spreading/re-exporting those objects, so nothing NOT on this
 * file's explicit whitelist can ever leak through this surface: no credits/
 * cost, no model/provider ids, no `productTieIn` config object (a product
 * NAME appearing inside a dialogue line's own text is acceptable story
 * content — the config object itself is not projected at all), no
 * `forbiddenClaims`, no approval/run/QC internals (this file never queries
 * those tables), no user emails/names, no tenant settings, no image/video
 * prompts, no asset/media URLs.
 */
import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  verticalDramaSeriesShareLinks,
  verticalDramaSeries,
  verticalDramaEpisodes,
  type VerticalDramaSeriesShareLinkRow,
  type VerticalDramaEpisodeRow,
} from "../../drizzle/schema";

/** Hard cap on ACTIVE (non-revoked, non-expired) links per series (plan.md §Server). */
export const MAX_ACTIVE_SERIES_SHARE_LINKS = 5;

const SHARE_LINK_TOKEN_BYTES = 32;

/** Only these two expiry windows are offered — enforced again server-side via zod in the router. */
export const SERIES_SHARE_LINK_EXPIRY_DAYS = [7, 30] as const;
export type SeriesShareLinkExpiryDays =
  (typeof SERIES_SHARE_LINK_EXPIRY_DAYS)[number];

/**
 * The ONE message ever shown for an unknown/expired/revoked/orphaned token —
 * never distinguish (prevents enumeration). Client copy
 * (`verticalDramaShareCopy.ts`'s `notFoundTitle`) intentionally duplicates
 * this exact literal rather than importing it, since client/server are
 * separate bundles — kept in sync via
 * `verticalDramaShare.test.ts`/`VerticalDramaSharedSeriesPage.test.tsx`
 * asserting the exact string on both sides.
 */
export const SHARE_LINK_GENERIC_ERROR_MESSAGE = "ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว";

function throwGenericShareLinkError(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: SHARE_LINK_GENERIC_ERROR_MESSAGE,
  });
}

/** `crypto.randomBytes(32)` -> base64url — 256 bits of entropy, never persisted raw. */
export function generateRawShareToken(): string {
  return crypto.randomBytes(SHARE_LINK_TOKEN_BYTES).toString("base64url");
}

/** SHA-256 hex digest of the raw token — the only form ever persisted. */
export function hashShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** True when the link has neither been revoked nor expired. */
export function isSeriesShareLinkActive(
  row: Pick<VerticalDramaSeriesShareLinkRow, "revokedAt" | "expiresAt">,
): boolean {
  if (row.revokedAt) return false;
  return row.expiresAt > new Date();
}

/* -------------------------------------------------------------------------- */
/* Owner-side CRUD                                                            */
/* -------------------------------------------------------------------------- */

export interface CreateSeriesShareLinkResult {
  id: string;
  /** Raw token — present ONLY on this create response, never again. */
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

export async function createSeriesShareLink(params: {
  tenantId: string;
  seriesId: number;
  createdByUserId: number;
  expiresInDays: SeriesShareLinkExpiryDays;
}): Promise<CreateSeriesShareLinkResult> {
  const { tenantId, seriesId, createdByUserId, expiresInDays } = params;

  const activeRows = await db
    .select({ id: verticalDramaSeriesShareLinks.id })
    .from(verticalDramaSeriesShareLinks)
    .where(
      and(
        eq(verticalDramaSeriesShareLinks.tenantId, tenantId),
        eq(verticalDramaSeriesShareLinks.seriesId, seriesId),
        isNull(verticalDramaSeriesShareLinks.revokedAt),
        gt(verticalDramaSeriesShareLinks.expiresAt, new Date()),
      ),
    );

  if (activeRows.length >= MAX_ACTIVE_SERIES_SHARE_LINKS) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Maximum of ${MAX_ACTIVE_SERIES_SHARE_LINKS} active share links per series — revoke an existing link before creating a new one.`,
    });
  }

  const token = generateRawShareToken();
  const tokenHash = hashShareToken(token);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  // Cast via `unknown` — the `db` proxy object (`server/db.ts`)'s
  // hand-wrapped `insert()` erases enough of Drizzle's generic overload
  // resolution that a no-argument `.returning()` resolves to a generic
  // `{ [x: string]: unknown }[]` shape instead of the table's real inferred
  // row type (a plain annotation isn't enough here since it's an actual
  // type mismatch, not just a widened inference — contrast the `db.select`
  // calls below, which DO infer correctly from a plain annotation since
  // they pass an explicit column-selection object).
  const [row] = (await db
    .insert(verticalDramaSeriesShareLinks)
    .values({
      tenantId,
      seriesId,
      createdByUserId,
      tokenHash,
      expiresAt,
      createdAt: now,
    })
    .returning()) as unknown as VerticalDramaSeriesShareLinkRow[];

  if (!row) {
    throw new Error("Failed to create series share link");
  }

  return {
    id: String(row.id),
    token,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

export interface SeriesShareLinkMetadata {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
  active: boolean;
}

type ShareLinkMetadataRow = Pick<
  VerticalDramaSeriesShareLinkRow,
  "id" | "createdAt" | "expiresAt" | "revokedAt" | "accessCount" | "lastAccessedAt"
>;

/** Metadata only — NEVER selects `tokenHash` (mirrors `apiKeyService.listKeys`'s "never returns keyHash" convention). */
export async function listSeriesShareLinks(params: {
  tenantId: string;
  seriesId: number;
}): Promise<SeriesShareLinkMetadata[]> {
  // Explicit annotation — same `db` proxy inference workaround as
  // `createSeriesShareLink` above.
  const rows: ShareLinkMetadataRow[] = await db
    .select({
      id: verticalDramaSeriesShareLinks.id,
      createdAt: verticalDramaSeriesShareLinks.createdAt,
      expiresAt: verticalDramaSeriesShareLinks.expiresAt,
      revokedAt: verticalDramaSeriesShareLinks.revokedAt,
      accessCount: verticalDramaSeriesShareLinks.accessCount,
      lastAccessedAt: verticalDramaSeriesShareLinks.lastAccessedAt,
    })
    .from(verticalDramaSeriesShareLinks)
    .where(
      and(
        eq(verticalDramaSeriesShareLinks.tenantId, params.tenantId),
        eq(verticalDramaSeriesShareLinks.seriesId, params.seriesId),
      ),
    )
    .orderBy(desc(verticalDramaSeriesShareLinks.createdAt));

  return rows.map(row => ({
    id: String(row.id),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    accessCount: row.accessCount,
    lastAccessedAt: row.lastAccessedAt,
    active: isSeriesShareLinkActive(row),
  }));
}

export async function revokeSeriesShareLink(params: {
  tenantId: string;
  seriesId: number;
  linkId: number;
}): Promise<{ revoked: boolean }> {
  const [row] = await db
    .select({
      id: verticalDramaSeriesShareLinks.id,
      revokedAt: verticalDramaSeriesShareLinks.revokedAt,
    })
    .from(verticalDramaSeriesShareLinks)
    .where(
      and(
        eq(verticalDramaSeriesShareLinks.id, params.linkId),
        eq(verticalDramaSeriesShareLinks.tenantId, params.tenantId),
        eq(verticalDramaSeriesShareLinks.seriesId, params.seriesId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Share link not found" });
  }

  // Idempotent — a second revoke click never clobbers the original revokedAt.
  if (row.revokedAt) {
    return { revoked: true };
  }

  await db
    .update(verticalDramaSeriesShareLinks)
    .set({ revokedAt: new Date() })
    .where(eq(verticalDramaSeriesShareLinks.id, row.id));

  return { revoked: true };
}

/* -------------------------------------------------------------------------- */
/* Public projection (whitelist DTO)                                         */
/* -------------------------------------------------------------------------- */

export interface VerticalDramaSharedSeriesDialogueLine {
  speaker: string;
  text: string;
}

export type VerticalDramaSharedSeriesRoughStatus = "draft" | "scripted" | "video";

export interface VerticalDramaSharedSeriesEpisode {
  episodeNumber: number;
  title: string | null;
  roughStatus: VerticalDramaSharedSeriesRoughStatus;
  logline: string | null;
  /** Present only when the episode has a `dialogueAudioPlan` with at least one line. */
  dialogue?: VerticalDramaSharedSeriesDialogueLine[];
}

/** Shape selected off `verticalDramaEpisodes` for the projection — narrower than the full row. */
type SharedSeriesEpisodeSourceRow = Pick<
  VerticalDramaEpisodeRow,
  "episodeNumber" | "title" | "script" | "assemblyManifest" | "dialogueAudioPlan"
>;

export interface VerticalDramaSharedSeriesProjection {
  series: {
    title: string;
    genre: string | null;
    tone: string | null;
    targetEpisodeCount: number;
  };
  overview: {
    logline: string | null;
    mainPlot: string | null;
    seasonArc: string | null;
  };
  episodes: VerticalDramaSharedSeriesEpisode[];
}

/**
 * Coarse status derived CHEAPLY from which jsonb fields are already present
 * on the (already-loaded) episode row — no extra query, no join into
 * render/assembly-job tables. `assemblyManifest` present -> the episode has
 * been assembled into video; else `script` present -> scripted; else draft.
 * The episode's own `status` varchar column (`verticalDramaEpisodes.status`)
 * is deliberately NOT used as the source of truth here: grepping this
 * router/service tree shows it is read back verbatim in a couple of places
 * but essentially never written past its `"draft"` default through the rest
 * of the pipeline, so it is not a reliable coarse signal — the jsonb-presence
 * check above is cheap and accurate instead.
 */
export function deriveRoughEpisodeStatus(episode: {
  script?: unknown;
  assemblyManifest?: unknown;
}): VerticalDramaSharedSeriesRoughStatus {
  if (episode.assemblyManifest) return "video";
  if (episode.script) return "scripted";
  return "draft";
}

function readBibleString(
  bible: Record<string, unknown> | null,
  key: string,
): string | null {
  if (!bible) return null;
  const value = bible[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Per-episode logline, read from the SERIES row's own `bible.episodeBreakdown[]`
 * (season-plan level, see `episodeBreakdownItemSchema` in
 * `verticalDramaStoryBible.ts`) — cheap because the series row (and its
 * `bible` jsonb) is already loaded once for the `overview` section; matched
 * by `episodeNumber`. Returns `null` when the series has no bible yet, the
 * episode has no breakdown entry, or the entry has no non-empty `logline`.
 * Deliberately reads ONLY `logline` off each breakdown item — every sibling
 * field (`keyBeats`, `shotDrafts`, `contentBudget`, `draftScorecard`,
 * `antagonist_tactics`, `protagonist_stake`, `world_rules`, `price_paid`,
 * `character_decisions`) is pre-production planning detail, not projected.
 */
export function resolveEpisodeLoglineFromBible(
  bible: Record<string, unknown> | null,
  episodeNumber: number,
): string | null {
  if (!bible) return null;
  const breakdown = bible.episodeBreakdown;
  if (!Array.isArray(breakdown)) return null;
  const entry = breakdown.find(
    item =>
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).episodeNumber === episodeNumber,
  ) as Record<string, unknown> | undefined;
  if (!entry) return null;
  const logline = entry.logline;
  return typeof logline === "string" && logline.trim() ? logline : null;
}

/**
 * Dialogue-only excerpt for one episode — hand-picks ONLY `speakerName`/`text`
 * off each `dialogueAudioPlan.dialogueLines[]` entry (see
 * `@shared/verticalDramaSeries/audio`'s `VerticalDramaDialogueLine`),
 * deliberately dropping every other field on that line (`voiceId`/
 * `voiceProvider`/`voiceModelId`, `audioTask` URLs/media-asset ids, timing,
 * `subtitleCueId`, shot numbers) and every OTHER field on the plan itself
 * (`speakerVoiceMap`, `nativeAudioPolicy`, `separateTtsPlan` — which itself
 * carries `provider`/`voiceModelId`, `subtitleCues`). Returns `undefined`
 * (field omitted entirely) when the episode has no dialogue-audio plan yet,
 * or the plan has zero usable lines — this is the "when present" case from
 * the task brief.
 */
export function extractDialogueExcerpt(
  dialogueAudioPlan: unknown,
): VerticalDramaSharedSeriesDialogueLine[] | undefined {
  if (!dialogueAudioPlan || typeof dialogueAudioPlan !== "object") {
    return undefined;
  }
  const lines = (dialogueAudioPlan as Record<string, unknown>).dialogueLines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return undefined;
  }

  const excerpt: VerticalDramaSharedSeriesDialogueLine[] = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") continue;
    const speaker = (line as Record<string, unknown>).speakerName;
    const text = (line as Record<string, unknown>).text;
    if (typeof speaker === "string" && typeof text === "string" && text.trim()) {
      excerpt.push({ speaker, text });
    }
  }

  return excerpt.length > 0 ? excerpt : undefined;
}

/**
 * The public read path: hash the raw token, look up the link row (tenant
 * scoping comes ENTIRELY from the resolved row's own `tenantId` — the
 * caller's own `ctx.tenantId`, if any, is never consulted, since an
 * anonymous visitor's request-domain tenant has no relationship to the
 * series owner's tenant), verify it's active, bump `accessCount`/
 * `lastAccessedAt`, and return the whitelist projection. Every failure path
 * (blank token, unknown hash, expired, revoked, or — defensively — an
 * orphaned link row whose series/episodes no longer resolve) throws the
 * exact same generic NOT_FOUND.
 */
export async function resolveSharedSeriesProjection(
  rawToken: string,
): Promise<VerticalDramaSharedSeriesProjection> {
  const normalizedToken = rawToken.trim();
  if (!normalizedToken) {
    throwGenericShareLinkError();
  }

  const tokenHash = hashShareToken(normalizedToken);
  const [linkRow] = await db
    .select()
    .from(verticalDramaSeriesShareLinks)
    .where(eq(verticalDramaSeriesShareLinks.tokenHash, tokenHash))
    .limit(1);

  if (!linkRow || !isSeriesShareLinkActive(linkRow)) {
    throwGenericShareLinkError();
  }

  const [seriesRow] = await db
    .select({
      title: verticalDramaSeries.title,
      genre: verticalDramaSeries.genre,
      tone: verticalDramaSeries.tone,
      targetEpisodeCount: verticalDramaSeries.targetEpisodeCount,
      bible: verticalDramaSeries.bible,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, linkRow.seriesId),
        eq(verticalDramaSeries.tenantId, linkRow.tenantId),
      ),
    )
    .limit(1);

  // Defensive only — `seriesId` cascades on delete, so this should be
  // unreachable in practice. Same generic error either way.
  if (!seriesRow) {
    throwGenericShareLinkError();
  }

  // Explicit annotation — same `db` proxy inference workaround as
  // `createSeriesShareLink`/`listSeriesShareLinks` above.
  const episodeRows: SharedSeriesEpisodeSourceRow[] = await db
    .select({
      episodeNumber: verticalDramaEpisodes.episodeNumber,
      title: verticalDramaEpisodes.title,
      script: verticalDramaEpisodes.script,
      assemblyManifest: verticalDramaEpisodes.assemblyManifest,
      dialogueAudioPlan: verticalDramaEpisodes.dialogueAudioPlan,
    })
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.tenantId, linkRow.tenantId),
        eq(verticalDramaEpisodes.seriesId, linkRow.seriesId),
      ),
    )
    .orderBy(asc(verticalDramaEpisodes.episodeNumber));

  // Single UPDATE, no transaction — best-effort bump, never blocks the read.
  await db
    .update(verticalDramaSeriesShareLinks)
    .set({
      accessCount: sql`${verticalDramaSeriesShareLinks.accessCount} + 1`,
      lastAccessedAt: new Date(),
    })
    .where(eq(verticalDramaSeriesShareLinks.id, linkRow.id));

  const bible = seriesRow.bible as Record<string, unknown> | null;

  return {
    series: {
      title: seriesRow.title,
      genre: seriesRow.genre,
      tone: seriesRow.tone,
      targetEpisodeCount: seriesRow.targetEpisodeCount,
    },
    overview: {
      logline: readBibleString(bible, "logline"),
      mainPlot: readBibleString(bible, "mainPlot"),
      seasonArc:
        readBibleString(bible, "expandedSeasonArc") ??
        readBibleString(bible, "seasonArc"),
    },
    episodes: episodeRows.map(episode => ({
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      roughStatus: deriveRoughEpisodeStatus(episode),
      logline: resolveEpisodeLoglineFromBible(bible, episode.episodeNumber),
      dialogue: extractDialogueExcerpt(episode.dialogueAudioPlan),
    })),
  };
}
