/**
 * Vertical Drama Series — durable location-stock router
 * (`planning/polished-toasting-gadget.md` Phase 2, dispatch 3/3).
 *
 * Location-side companion to `verticalDramaCharacters.ts`: surfaces the
 * durable per-series location roster AND its reference-asset stock
 * (approval/QC lifecycle) over tRPC. Deliberately much smaller than the
 * character router — no variants/twins/voice-casting concerns. It DOES carry
 * the same image-model-picker/MCP-transport plumbing `generateCharacterImage`
 * has: `generateLocationImage`'s input accepts `selectedImageModelId`/
 * `mcpConnectionId` so a user can choose which model renders a location's
 * reference image instead of being forced onto the hardcoded (expensive)
 * default. The resolution/MCP-transport logic itself is REUSED verbatim from
 * `verticalDramaCharacters.ts`'s exported `resolveCharacterImageModelId`/
 * `resolveVdCharacterMcpTransportMetadata` (both generic/model-agnostic, not
 * character-specific) rather than duplicated here — see
 * `generateLocationImage`'s own doc comment.
 *
 * Every procedure is protected (auth required), gated on the
 * `verticalDramaSeries` tenant feature flag (fail-closed, same gate the
 * character router uses — this feature has no location-specific flag of its
 * own), and scoped to the caller's tenant + user + series so a user can
 * never read, attach, approve, or transition another tenant's or user's
 * location/asset.
 *
 * SECURITY: cross-tenant / cross-user / missing rows are reported as
 * NOT_FOUND (never FORBIDDEN, never a leaked reason string) — see
 * `mapLocationStockError` below. `VerticalDramaLocationStockError`'s own doc
 * comment says "NOT-FOUND semantics preferred at the router boundary; the
 * service uses a precise reason so callers never disclose cross-tenant
 * existence" — every `.reason` value (including `illegal_state_transition`,
 * which the sibling character router surfaces as PRECONDITION_FAILED with
 * its own message) is deliberately collapsed to a single generic NOT_FOUND
 * here, stricter than the character router's own `mapStockError`. This is an
 * intentional, more conservative choice for this new surface — see this
 * file's own `mapLocationStockError` doc comment.
 *
 * The location roster (`verticalDramaLocations`) is owned directly here; the
 * reference-asset stock (link / approve / transition / stale / delete) is
 * delegated to `verticalDramaLocationStockService`.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit
 * that file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaLocations,
  mediaModels,
  libraryItems,
  type VerticalDramaLocationRow,
} from "../../drizzle/schema";
import {
  verticalDramaLocationStockService,
  VerticalDramaLocationStockError,
} from "../services/verticalDramaLocationStock";
import {
  VERTICAL_DRAMA_LOCATION_ASSET_STATES,
  VERTICAL_DRAMA_LOCATION_COVERAGE_ROLES,
  getVerticalDramaLocationCameraViewLabel,
  type VerticalDramaLocationCameraView,
  type VerticalDramaLocationCoverageRole,
} from "@shared/verticalDramaSeries/locationAssets";
import { mediaGenerationService } from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { resolveVdImagePromptBudgetForModel } from "../services/modelPromptBudget";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import {
  generateLocationVisualPrompts,
  buildLocationImageEditPrompt,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../services/verticalDramaLocationImageGeneration";
import { resolveVerticalDramaCapabilities } from "../services/modelRegistry";
// Generic, non-character-specific bible reader (reads `bible.presetVisualIdentity`,
// pure — no character logic) — genuinely SHARED utility, not a feature-specific
// character concern, so importing it directly here (rather than duplicating its
// parsing logic) does not violate this feature's "duplicate small helpers to
// keep the character/location systems decoupled" convention; that convention is
// about feature-specific logic like `resolveMediaAssetForImport` below, which
// IS duplicated rather than shared.
// Image-model-picker resolution — GENERIC/model-agnostic helpers (nothing
// character-specific), reused verbatim from `verticalDramaCharacters.ts`
// rather than duplicated here: this feature's usual "duplicate small
// per-surface helpers, keep the character/location systems decoupled"
// convention (see this file's own top-of-file doc comment) is for
// feature-SPECIFIC logic; these two are pure model-catalog/MCP-transport
// plumbing shared verbatim by both tabs' generation procedures. No import
// cycle: `verticalDramaCharacters.ts` never imports from this file (verified
// — it has no reference to `verticalDramaLocations` anywhere in its module).
import {
  resolveCharacterImageModelId,
  resolveVdCharacterMcpTransportMetadata,
  // Feature 135 — Hermes Grok media worker (section 09): the transport-
  // neutral decision function, reused verbatim from `verticalDramaCharacters.ts`
  // the same way the two MCP helpers above already are.
  resolveVdCharacterMediaTransportDecision,
} from "./verticalDramaCharacters";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { createAssetFromAttachment } from "../services/mediaAssetService";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { enqueueVerticalDramaInteractiveJob } from "../services/verticalDramaInteractiveJobs";
import {
  applySeriesLookToImagePrompt,
  resolveEffectiveSeriesVisualIdentity,
} from "@shared/verticalDramaSeries/seriesLookLock";
import {
  VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
  recordSeriesLookLockAuditEvent,
} from "../services/verticalDramaSeriesLookLockAudit";
// Whole-series location detection (`detectLocationsNow` below) — TYPE-ONLY
// import only (erased at compile time, no runtime module load), same
// "dynamic import, never static" convention `verticalDramaCharacters.ts`
// documents for its own `detectCharacterVariantsNow`:
// `verticalDramaStoryBible.ts`/`verticalDramaLocationDetector.ts`'s module
// graphs transitively pull in `verticalDramaImproveScript.ts` (a heavy,
// DB/skill-registry-touching service), which this file's existing
// minimal-mock test suite (`verticalDramaLocations.test.ts`) does not mock —
// a static import would break it the moment this file loads. The
// corresponding RUNTIME functions (`generateLocationDetectionPlan`/
// `reconcileLocationDetectionPlan`/error classes, plus
// `getActiveBreakdown`/`readItemShotDrafts`) are loaded via a DYNAMIC
// `import()` INSIDE `detectLocationsNow` only.
import type {
  StoryScriptLang,
  StoryScriptEpisodeInput,
} from "@shared/verticalDramaSeries/storyScriptText";
import type { VerticalDramaInteractiveJobPayload } from "../services/verticalDramaInteractiveJobs";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                          */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries")
);

/** Feature 138 P2 coverage-pack entry point. The legacy location renderer
 * remains available for establishing plates; this explicit route is the
 * opt-in surface for reverse/side/detail coverage work. The child flag is
 * chained behind the scene-continuity parent, matching episode QC routes. */
const verticalDramaSceneContinuityProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSceneContinuity")
);
const verticalDramaSceneContinuityQcProcedure =
  verticalDramaSceneContinuityProcedure.use(
    requireFeatureFlag("verticalDramaSceneContinuityQc")
  );

export async function runLocationDetectionInteractiveJob(
  payload: VerticalDramaInteractiveJobPayload,
  execution: { jobId: string; traceId: string }
): Promise<unknown> {
  const seriesId = Number(
    payload.input.seriesId ?? payload.scopeKey.replace(/^series:/, "")
  );
  const seriesRow = await loadOwnedSeries(
    payload.tenantId,
    payload.userId,
    seriesId
  );
  const bible = (seriesRow.bible as Record<string, unknown> | null) ?? {};
  const lang: StoryScriptLang = seriesRow.locale === "th" ? "th" : "en";
  const { getActiveBreakdown, readItemShotDrafts, readItemCliffhangerLine } =
    await import("../services/verticalDramaStoryBible");
  const { generateLocationDetectionPlan, reconcileLocationDetectionPlan } =
    await import("../services/verticalDramaLocationDetector");
  const draftedItems = getActiveBreakdown(bible).filter(
    item => readItemShotDrafts(item) !== null
  );
  if (draftedItems.length === 0)
    throw new Error(
      "Generate deep story drafts first before detecting locations"
    );
  const episodes: StoryScriptEpisodeInput[] = draftedItems.map(item => ({
    episodeNumber: item.episodeNumber,
    workingTitle: item.workingTitle,
    logline: item.logline,
    keyBeats: item.keyBeats,
    shotDrafts: readItemShotDrafts(item),
    cliffhangerLine: readItemCliffhangerLine(item),
  }));
  const locationRows: VerticalDramaLocationRow[] = await db
    .select()
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.tenantId, payload.tenantId),
        eq(verticalDramaLocations.userId, payload.userId),
        eq(verticalDramaLocations.seriesId, seriesId)
      )
    );
  const existingLocations = locationRows.map(row => ({
    locationKey: row.locationKey,
    name: row.name,
    description: extractLocationDescription(
      (row.data as Record<string, unknown> | null) ?? null
    ),
  }));
  const planResult = await generateLocationDetectionPlan({
    userId: payload.userId,
    tenantId: payload.tenantId,
    seriesId,
    lang,
    existingLocations,
    episodes,
  });
  const summary = await reconcileLocationDetectionPlan(
    { tenantId: payload.tenantId, userId: payload.userId, seriesId },
    planResult.plan
  );
  return {
    locationsCreated: summary.createdLocations.length,
    locationsReused: summary.reusedLocations.length,
    createdLocations: summary.createdLocations,
    reusedLocations: summary.reusedLocations,
    jobId: execution.jobId,
    traceId: execution.traceId,
  };
}

/**
 * Location image providers used by this surface accept one prompt field.
 * Keep the model-generated exclusions as ordinary prompt instructions instead
 * of sending a separate `negativePrompt` transport field.
 */
function composeLocationImagePrompt(
  prompt: string,
  negativePrompt?: string | null
): string {
  const base = prompt.trim();
  const exclusions = negativePrompt?.trim();
  return exclusions ? `${base}\n\nAvoid: ${exclusions}` : base;
}

/** Resolve a non-null tenant id or fail closed. */
function requireTenantId(tenantId: string | null): string {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Vertical Drama Series is not available (no tenant context)",
    });
  }
  return tenantId;
}

function parseId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid ${label}` });
  }
  return n;
}

/**
 * Load the caller-owned series (tenant + user scoped) or throw NOT_FOUND.
 * NOT_FOUND (not FORBIDDEN) is deliberate — never disclose the existence of
 * another tenant's/user's series. Byte-identical convention to
 * `verticalDramaCharacters.ts`'s own `loadOwnedSeries`.
 */
async function loadOwnedSeries(
  tenantId: string,
  userId: number,
  seriesId: number
) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  return row;
}

/** Load a caller-owned location (tenant + user + series scoped) or NOT_FOUND. */
async function loadOwnedLocation(
  tenantId: string,
  userId: number,
  seriesId: number,
  locationId: number
): Promise<VerticalDramaLocationRow> {
  const [row] = await db
    .select()
    .from(verticalDramaLocations)
    .where(
      and(
        eq(verticalDramaLocations.id, locationId),
        eq(verticalDramaLocations.tenantId, tenantId),
        eq(verticalDramaLocations.userId, userId),
        eq(verticalDramaLocations.seriesId, seriesId)
      )
    )
    .limit(1);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Location not found" });
  return row;
}

/**
 * Translate a service-level `VerticalDramaLocationStockError` into a GENERIC
 * NOT_FOUND — a real security requirement, not a style preference (see this
 * file's top-of-file doc comment). Deliberately collapses EVERY `.reason`
 * value (including `illegal_state_transition`/`media_asset_deleted`, which
 * the sibling `verticalDramaCharacters.ts`'s `mapStockError` maps to
 * PRECONDITION_FAILED/BAD_REQUEST with the service's own message) to one
 * generic code + a fixed, non-leaking message — the specific `.reason` /
 * `err.message` text is NEVER forwarded to the client on this router. Any
 * non-`VerticalDramaLocationStockError` is rethrown unchanged (an
 * unexpected/programming error should surface normally, not be masked as
 * NOT_FOUND).
 */
function mapLocationStockError(err: unknown): never {
  if (err instanceof VerticalDramaLocationStockError) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Location asset not found",
    });
  }
  throw err;
}

/**
 * Resolves the series' stamped preset visual identity for location-prompt
 * flow-through (spec §8.2.2 flow-through rule) — flag-gated: returns
 * `undefined` (no flow-through, legacy-tolerant behavior) unless the tenant
 * has `verticalDramaSeriesPresetMixV2` enabled. Byte-identical convention +
 * SAME source flag as `verticalDramaCharacters.ts`'s own
 * `resolveCharacterPresetVisualIdentity` (that function is not exported —
 * duplicated here per this feature's established per-file-helper
 * convention).
 */
async function resolveLocationPresetVisualIdentity(
  tenantId: string,
  bible: Record<string, unknown> | null
) {
  const flags = await getTenantFeatureFlags(tenantId);
  const lookLockEnabled = flags.verticalDramaSeriesLookLock === true;
  return {
    identity: resolveEffectiveSeriesVisualIdentity({
      bible,
      presetMixEnabled: flags.verticalDramaSeriesPresetMixV2 === true,
      lookLockEnabled,
    }),
    lookLockEnabled,
  };
}

/** Best-effort location description drawn from `verticalDramaLocations.data.description`. */
function extractLocationDescription(
  data: Record<string, unknown> | null
): string {
  if (data && typeof data.description === "string" && data.description.trim()) {
    return data.description.trim();
  }
  return "";
}

/**
 * Pre-formatted "Series title: ... | Genre: ... | Tone: ..." fact line —
 * matches `GenerateLocationVisualPromptsParams.seriesContext`'s own doc
 * comment (a ready-made string, not an object the generator formats itself).
 * Purely a facts-in formatter (no creative language authored) — skill-first:
 * all creative use of these facts happens in skill.md, not here.
 */
function buildLocationSeriesContext(
  seriesRow:
    | { title?: string | null; genre?: string | null; tone?: string | null }
    | undefined
): string | undefined {
  if (!seriesRow) return undefined;
  const parts: string[] = [];
  if (seriesRow.title) parts.push(`Series title: ${seriesRow.title}`);
  if (seriesRow.genre) parts.push(`Genre: ${seriesRow.genre}`);
  if (seriesRow.tone) parts.push(`Tone: ${seriesRow.tone}`);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/**
 * Browser-safe projection of a location roster row (never leaks internal ids
 * as numbers). `primaryReferenceAssetLinkId` (added alongside
 * `primaryReferenceUrl`, same "only when an APPROVED establishing_plate
 * asset exists" condition — see `listRows`'s own doc comment) is the
 * `verticalDramaLocationAssets` row id backing that URL, stringified like
 * every other id on this DTO — lets the client address that specific asset
 * link directly (e.g. for `deleteAsset`/`transitionAsset`) without a second
 * round-trip to look it up.
 */
function locationRowToDto(
  row: VerticalDramaLocationRow & {
    primaryReferenceUrl?: string;
    primaryReferenceAssetLinkId?: number;
  }
) {
  return {
    locationId: String(row.id),
    seriesId: String(row.seriesId),
    locationKey: row.locationKey,
    name: row.name,
    description: extractLocationDescription(
      (row.data as Record<string, unknown> | null) ?? null
    ),
    slotStatus:
      (row.data as Record<string, unknown> | null)?.slotStatus === "pending"
        ? "pending"
        : undefined,
    slotReason:
      typeof (row.data as Record<string, unknown> | null)?.slotReason === "string"
        ? (row.data as Record<string, unknown>).slotReason
        : undefined,
    primaryReferenceUrl: row.primaryReferenceUrl,
    primaryReferenceAssetLinkId:
      row.primaryReferenceAssetLinkId != null
        ? String(row.primaryReferenceAssetLinkId)
        : undefined,
    createdAt: (row.createdAt instanceof Date
      ? row.createdAt
      : new Date(row.createdAt)
    ).toISOString(),
    updatedAt: (row.updatedAt instanceof Date
      ? row.updatedAt
      : new Date(row.updatedAt)
    ).toISOString(),
  };
}

function locationCameraVariantsToDto(
  assets: Array<{
    assetLinkId: number;
    mediaAssetId: number;
    url: string;
    approved: boolean;
    role: string | null;
    metadata: Record<string, unknown> | null;
  }>
) {
  return assets
    .filter(asset => asset.approved && asset.role !== "establishing_plate")
    .map(asset => ({
      variantId: String(asset.assetLinkId),
      label: getVerticalDramaLocationCameraViewLabel({
        role: asset.role,
        metadata: asset.metadata,
      }),
      role: asset.role ?? "camera_variant",
      url: asset.url,
      approved: asset.approved,
    }));
}

/**
 * Short-lived server-to-server bearer token for the Python media-generation
 * backend — mirrors `verticalDramaCharacters.ts`'s
 * `getCharacterPortraitUserToken`/`verticalDramaEpisodes.ts`'s
 * `getStartFrameMediaUserToken`: prefer the caller's own session token (so
 * usage attributes correctly), fall back to minting a scoped token.
 */
function getLocationMediaUserToken(ctx: {
  userToken: string | null;
  user: { id: number };
}): string {
  if (ctx.userToken) return ctx.userToken;
  return signBearerToken(
    {
      sub: String(ctx.user.id),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_location_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m"
  );
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const seriesScope = z.object({ seriesId: z.string().min(1) });

const cameraViewInput = z
  .object({
    preset: z.string().trim().max(80).optional(),
    label: z.string().trim().min(1).max(160),
    directive: z.string().trim().max(1000).optional(),
  })
  .transform(
    value =>
      ({
        ...value,
        ...(value.preset ? { preset: value.preset } : {}),
        ...(value.directive ? { directive: value.directive } : {}),
      }) satisfies VerticalDramaLocationCameraView
  );

const assetStateEnum = z.enum(
  VERTICAL_DRAMA_LOCATION_ASSET_STATES as unknown as [string, ...string[]]
);

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaLocationsRouter = router({
  /**
   * List the series' location roster, each row annotated with a
   * `primaryReferenceUrl` when an APPROVED `establishing_plate` asset exists
   * for it (delegates entirely to
   * `verticalDramaLocationStockService.listRows`, which already folds the
   * roster + best-approved-asset query into one service-layer call — see
   * that method's own doc comment for why there is no separate
   * `getManifest`-style split here, unlike the character router).
   */
  list: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const rows = await verticalDramaLocationStockService.listRows({
        tenantId,
        userId,
        seriesId,
      });
      const locations = await Promise.all(
        rows.map(async row => {
          const assets = await verticalDramaLocationStockService
            .listLocationAssets({ tenantId, userId, seriesId }, row.id)
            .catch(() => []);
          return {
            ...locationRowToDto(row),
            cameraVariants: locationCameraVariantsToDto(assets),
          };
        })
      );
      return { locations };
    }),

  /**
   * Update an existing location's editable fields (tenant + user + series
   * scoped). `locationKey` is intentionally NOT part of this input schema —
   * it is a stable/internal key (mirrors `distinct_locations[].location_key`
   * and every `vertical_drama_location_assets` lookup) and must never be
   * editable from the client.
   */
  updateLocation: verticalDramaProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
        description: z.string().trim().max(4000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const locationId = parseId(input.locationId, "location id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const existing = await loadOwnedLocation(
        tenantId,
        userId,
        seriesId,
        locationId
      );

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) {
        const existingData =
          (existing.data as Record<string, unknown> | null) ?? {};
        patch.data = { ...existingData, description: input.description };
      }

      const [row] = await db
        .update(verticalDramaLocations)
        .set(patch)
        .where(
          and(
            eq(verticalDramaLocations.id, locationId),
            eq(verticalDramaLocations.tenantId, tenantId),
            eq(verticalDramaLocations.userId, userId),
            eq(verticalDramaLocations.seriesId, seriesId)
          )
        )
        .returning();

      return { location: locationRowToDto(row as VerticalDramaLocationRow) };
    }),

  /**
   * Preview-only leg of the location establishing-plate flow: runs ONLY the
   * `generateLocationVisualPrompts` LLM call (the same step-1 call
   * `generateLocationImage` performs internally when no `approvedPrompt` is
   * supplied) and returns the resulting prompt text WITHOUT rendering an
   * image. Mirrors `verticalDramaCharacters.ts`'s `previewCharacterPrompt`
   * EXACTLY, including its real (verified-by-reading, not assumed) "free
   * preview" shape: this procedure does NOT perform any credit
   * check/deduction of its own — it delegates entirely to
   * `generateLocationVisualPrompts`, which internally gates + deducts the
   * ONE prompt-generation credit (the same call `previewCharacterPrompt`
   * makes to `generateCharacterVisualPrompts`, confirmed by reading that
   * procedure's body: it has no local `hasEnoughCredits`/`deductCredits`
   * call, no refund-after-the-fact trick — it just calls the generator once
   * and returns its result). "Free" here means "free of the separate,
   * far larger image-render credit" (which only `generateLocationImage`
   * charges) — NOT literally zero-cost; this procedure never performs a
   * SECOND/duplicate charge beyond what the one shared prompt-generation
   * call already does. The caller then passes the approved text back as
   * `approvedPrompt` on `generateLocationImage` so
   * that LLM leg is never re-run (and never double-charged) for the same
   * spend.
   */
  previewLocationPrompt: verticalDramaProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1),
        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
        coverageRole: z.enum(VERTICAL_DRAMA_LOCATION_COVERAGE_ROLES).optional(),
        gapDescription: z.string().trim().max(500).optional(),
        cameraView: cameraViewInput.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const locationId = parseId(input.locationId, "location id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const location = await loadOwnedLocation(
        tenantId,
        userId,
        seriesId,
        locationId
      );

      let imagePromptMaxChars: number | undefined;
      if (input.selectedImageModelId) {
        const [modelRow] = await db
          .select({
            configJson: mediaModels.configJson,
            provider: mediaModels.provider,
          })
          .from(mediaModels)
          .where(eq(mediaModels.modelId, input.selectedImageModelId))
          .limit(1);
        imagePromptMaxChars = resolveVdImagePromptBudgetForModel({
          modelId: input.selectedImageModelId,
          configJson: modelRow?.configJson,
          provider: modelRow?.provider,
        });
      }

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);

      const { identity: presetVisualIdentity } =
        await resolveLocationPresetVisualIdentity(
          tenantId,
          (seriesRow?.bible as Record<string, unknown> | null) ?? null
        );
      const hasOwnReferenceAssetId =
        await verticalDramaLocationStockService.getPrimaryReferenceAssetId(
          { tenantId, userId, seriesId },
          locationId
        );

      let promptResult;
      try {
        promptResult = await generateLocationVisualPrompts({
          userId,
          tenantId,
          seriesId,
          locationKey: location.locationKey,
          locationName: location.name,
          description:
            extractLocationDescription(
              (location.data as Record<string, unknown> | null) ?? null
            ) || location.name,
          seriesContext: buildLocationSeriesContext(seriesRow),
          presetVisualIdentity,
          hasOwnReferenceImage: Boolean(hasOwnReferenceAssetId),
          ...(input.coverageRole
            ? {
                coverageRole:
                  input.coverageRole as VerticalDramaLocationCoverageRole,
              }
            : {}),
          ...(input.gapDescription
            ? { gapDescription: input.gapDescription }
            : {}),
          ...(input.cameraView ? { cameraView: input.cameraView } : {}),
          ...(imagePromptMaxChars ? { imagePromptMaxChars } : {}),
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: String(err),
          });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: String(err),
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Location visual prompt generation failed",
        });
      }

      return {
        establishingPlatePrompt: composeLocationImagePrompt(
          promptResult.establishingPlatePrompt,
          promptResult.negativePrompt
        ),
        model: promptResult.model,
      };
    }),

  /**
   * Generate a real location establishing-plate reference image: (1) run the
   * `vertical-drama-location-visual-bible` skill as a direct, credit-gated
   * LLM call to produce an establishing-plate prompt + negative prompt (see
   * `verticalDramaLocationImageGeneration.ts`), then (2) render that prompt
   * into an actual image via `mediaGenerationService.generateImageAsync`
   * (async — matches the character portrait/start-frame polling pattern:
   * the caller polls `media.getTask({taskId})`, then finalizes via
   * `resolveMediaAssetForImport` + `linkAsset`, both already defined below).
   *
   * `approvedPrompt` (optional): when the caller
   * already ran `previewLocationPrompt` and had the user approve the exact
   * text, pass it here to skip the internal `generateLocationVisualPrompts`
   * call entirely — mirrors `generateCharacterImage`'s EXACT
   * skip-regeneration-when-approved-prompt-given branch: the prompt is used
   * directly and the prompt-generation credit (already charged once, at
   * preview time) is never charged again here.
   *
   * Aspect ratio: `"16:9"` (wide), deliberately NOT `"9:16"` (the character
   * portrait/vertical-drama-frame default) — an establishing plate is a
   * wide environment/establishing shot (skill.md's own worked example opens
   * every prompt with "wide establishing shot, environment only, no
   * people:"), not a vertical character portrait or a 9:16 in-episode frame.
   *
   * `selectedImageModelId` (REQUIRED)/`mcpConnectionId` (optional — location
   * model-picker parity plan): the location tab's own model picker.
   * `selectedImageModelId` is resolved via `resolveCharacterImageModelId`
   * (validated + must be enabled). FAIL CLOSED: the caller must explicitly
   * select a model — `resolveCharacterImageModelId` throws BAD_REQUEST when
   * absent instead of silently falling back to `DEFAULT_MODELS.image`
   * (byte-identical resolution behavior to `generateCharacterImage`, reused
   * verbatim, not duplicated — see this file's own top-of-file doc comment).
   * `mcpConnectionId` is required only when the resolved model is
   * MCP-transport (e.g. `higgsfield/*`, `magnific-mcp/*`) — see
   * `resolveVdCharacterMcpTransportMetadata`, also reused verbatim.
   */
  generateLocationImage: verticalDramaProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        // Caller-selected image model (location tab's own model picker) —
        // validated + must be enabled. REQUIRED — no server-side fallback;
        // throws BAD_REQUEST when absent. See `resolveCharacterImageModelId`.
        selectedImageModelId: z.string().trim().min(1).max(128),
        // Required only when the selected model is MCP-transport (e.g.
        // `higgsfield/*`, `magnific-mcp/*`) — see
        // `resolveVdCharacterMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        // Feature 138 P2 — optional coverage-pack angle directive.
        coverageRole: z.enum(VERTICAL_DRAMA_LOCATION_COVERAGE_ROLES).optional(),
        gapDescription: z.string().trim().max(500).optional(),
        cameraView: cameraViewInput.optional(),
        /** Explicit image-to-image edit request. Requires the location's
         * current primary reference and a model with reference-image support. */
        editInstruction: z.string().trim().min(1).max(1200).optional(),
        // Feature 135 — Hermes Grok media worker (section 09, row 4).
        // Required only when the resolved model is Hermes-transport and the
        // caller has no default Hermes connection for images.
        hermesConnectionId: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for image generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const locationId = parseId(input.locationId, "location id");
      const ownedSeriesRow = await loadOwnedSeries(tenantId, userId, seriesId);
      const location = await loadOwnedLocation(
        tenantId,
        userId,
        seriesId,
        locationId
      );

      if (input.editInstruction && input.approvedPrompt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Image edit requests cannot be combined with an approved text-to-image prompt.",
        });
      }

      // Resolve the source before prompt construction so an edit can never
      // silently degrade into text-to-image when the old image disappeared.
      const referenceUrl =
        await verticalDramaLocationStockService.getPrimaryReferenceUrl(
          { tenantId, userId, seriesId },
          locationId
        );
      const referenceMediaAssetId =
        await verticalDramaLocationStockService.getPrimaryReferenceAssetId(
          { tenantId, userId, seriesId },
          locationId
        );
      if (input.editInstruction && !referenceUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "แก้ไขภาพเดิมไม่ได้ เพราะสถานที่นี้ยังไม่มีภาพอ้างอิงหลัก / Cannot edit the existing image because this location has no primary reference image.",
        });
      }

      const resolvedImageModelId = await resolveCharacterImageModelId(
        input.selectedImageModelId
      );
      // Resolve the prompt-authoring budget from the selected model's static
      // catalog entry before the optional LLM call. The persisted catalog row
      // is re-read below for the final render pricing/transport path.
      let imagePromptMaxChars = resolveVdImagePromptBudgetForModel({
        modelId: resolvedImageModelId,
      });

      // 1. Prompt generation — credit-gated + deducted internally. Skipped
      //    entirely when the caller already ran `previewLocationPrompt` and
      //    supplies the user-approved text via `approvedPrompt` (see this
      //    procedure's own doc comment).
      let establishingPlatePrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let promptCreditsUsed = 0;
      let { identity: presetVisualIdentity, lookLockEnabled } =
        await resolveLocationPresetVisualIdentity(
          tenantId,
          (ownedSeriesRow?.bible as Record<string, unknown> | null) ?? null
        );

      if (input.editInstruction) {
        establishingPlatePrompt = buildLocationImageEditPrompt({
          locationName: location.name,
          description:
            extractLocationDescription(
              (location.data as Record<string, unknown> | null) ?? null
            ) || location.name,
          editInstruction: input.editInstruction,
          ...(input.cameraView ? { cameraView: input.cameraView } : {}),
        });
        promptModel = "deterministic-location-image-edit";
      } else if (input.approvedPrompt) {
        establishingPlatePrompt = input.approvedPrompt;
      } else {
        const [seriesRow] = await db
          .select({
            title: verticalDramaSeries.title,
            genre: verticalDramaSeries.genre,
            tone: verticalDramaSeries.tone,
            bible: verticalDramaSeries.bible,
          })
          .from(verticalDramaSeries)
          .where(
            and(
              eq(verticalDramaSeries.id, seriesId),
              eq(verticalDramaSeries.tenantId, tenantId)
            )
          )
          .limit(1);
        ({ identity: presetVisualIdentity, lookLockEnabled } =
          await resolveLocationPresetVisualIdentity(
            tenantId,
            (seriesRow?.bible as Record<string, unknown> | null) ?? null
          ));
        const hasOwnReferenceAssetId =
          await verticalDramaLocationStockService.getPrimaryReferenceAssetId(
            { tenantId, userId, seriesId },
            locationId
          );

        let promptResult;
        try {
          promptResult = await generateLocationVisualPrompts({
            userId,
            tenantId,
            seriesId,
            locationKey: location.locationKey,
            locationName: location.name,
            description:
              extractLocationDescription(
                (location.data as Record<string, unknown> | null) ?? null
              ) || location.name,
            seriesContext: buildLocationSeriesContext(seriesRow),
            presetVisualIdentity,
            hasOwnReferenceImage: Boolean(hasOwnReferenceAssetId),
            ...(input.coverageRole
              ? {
                  coverageRole:
                    input.coverageRole as VerticalDramaLocationCoverageRole,
                }
              : {}),
            ...(input.gapDescription
              ? { gapDescription: input.gapDescription }
              : {}),
            ...(input.cameraView ? { cameraView: input.cameraView } : {}),
            imagePromptMaxChars,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: err.message,
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              err instanceof Error
                ? err.message
                : "Location visual prompt generation failed",
          });
        }
        establishingPlatePrompt = promptResult.establishingPlatePrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      const [pricingRow] = await db
        .select({
          creditCost: mediaModels.creditCost,
          configJson: mediaModels.configJson,
          provider: mediaModels.provider,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? {
        creditCost: 10,
        configJson: null,
        provider: undefined,
      };
      imagePromptMaxChars = resolveVdImagePromptBudgetForModel({
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        provider: pricingModel.provider,
      });
      if (lookLockEnabled && presetVisualIdentity) {
        ({ prompt: establishingPlatePrompt, negativePrompt } =
          applySeriesLookToImagePrompt({
            prompt: establishingPlatePrompt,
            negativePrompt,
            identity: presetVisualIdentity,
          }));
        await recordSeriesLookLockAuditEvent({
          eventType: VD_SERIES_LOOK_LOCK_APPLIED_EVENT,
          tenantId,
          userId,
          seriesId,
          path: "locations.generateImage",
        });
      }
      const singleFieldPrompt = composeLocationImagePrompt(
        establishingPlatePrompt,
        negativePrompt
      );

      if (input.editInstruction) {
        const capabilities = resolveVerticalDramaCapabilities(
          resolvedImageModelId,
          {
            type: "image",
            configJson:
              (pricingModel.configJson as
                | Record<string, any>
                | null
                | undefined) ?? undefined,
          }
        );
        if (
          capabilities.maxReferenceImages === undefined ||
          capabilities.maxReferenceImages < 1
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `โมเดล ${resolvedImageModelId} ไม่รองรับ image-to-image ที่มีภาพอ้างอิง กรุณาเลือกโมเดลที่รองรับ / Model "${resolvedImageModelId}" does not support image-to-image reference editing. Choose a compatible model.`,
          });
        }
      }

      // 2. Pre-flight credit check for the image render — a SEPARATE charge
      //    from the prompt-generation LLM call above. Prices + generates
      //    against the CALLER-SELECTED model (location tab's own picker),
      //    which is now REQUIRED — `resolveCharacterImageModelId` throws
      //    BAD_REQUEST when none was selected, same fail-closed behavior as
      //    `generateCharacterImage`.
      const imageCreditCost = calculateCreditCost(pricingModel, {
        numImages: 1,
      });

      // Zero-cost models skip the reserve/refund cycle entirely — same
      // convention as `generateCharacterImage`/`generateStartFrameImage`
      // (`deductCredits`/`refundCredits` throw on amount <= 0 by design).
      const shouldChargeImageCredits = imageCreditCost > 0;

      // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
      // dispatched through the service's MCP branch, not the default
      // gateway_api/Python-backend path — see
      // `resolveVdCharacterMcpTransportMetadata` (reused verbatim from
      // `verticalDramaCharacters.ts`). Resolved BEFORE the credit reservation
      // below (same ordering as `generateCharacterImage`) so a missing/
      // invalid MCP connection fails fast without having reserved credits.
      // Feature 135 — Hermes Grok media worker (section 09): resolve the
      // transport-neutral decision FIRST — `mcp`/`gateway` fall through to
      // the pre-existing code below byte-identically (delegates to
      // `resolveVdCharacterMcpTransportMetadata` unchanged); `hermes` takes
      // a completely separate early-return path, mirroring
      // `generateCharacterImage`'s identical block. Resolved BEFORE the
      // credit check/reserve below (not after) — structurally guarantees "no
      // platform-credit reserve for hermes".
      const transportDecision = await resolveVdCharacterMediaTransportDecision({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
        sharedGroupId: input.sharedGroupId,
        hermesConnectionId: input.hermesConnectionId,
      });

      if (transportDecision.kind !== "hermes" && shouldChargeImageCredits) {
        const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasImageCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for location image render. Required: ${imageCreditCost}`,
          });
        }
      }

      if (transportDecision.kind === "hermes") {
        const { queueHermesMediaJob } =
          await import("../services/hermesMediaScheduler");
        const {
          buildHermesMediaReferences,
          buildHermesMediaTaskEnvelope,
          resolveHermesOrderedRefsFromUrls,
        } = await import("../services/hermesMediaReferences");
        const hermesTraceId = crypto.randomUUID();
        const { orderedRefs, droppedReferenceCount } =
          await resolveHermesOrderedRefsFromUrls({
            tenantId,
            userId,
            urls: referenceUrl ? [referenceUrl] : [],
            traceId: hermesTraceId,
            connectionId: transportDecision.connectionId,
            roleFor: () => "identity_lock",
          });
        const references = await buildHermesMediaReferences({
          tenantId,
          userId,
          orderedRefs,
        });
        const hermesProviderModelId =
          resolveMediaModelTransportConfig({
            modelId: resolvedImageModelId,
            configJson: pricingModel.configJson,
          }).providerModelId ?? resolvedImageModelId;
        const result = await queueHermesMediaJob({
          contractVersion: 1,
          operation: references.length > 0 ? "image.edit" : "image.generate",
          connectionId: transportDecision.connectionId,
          prompt: singleFieldPrompt,
          settings: {
            model: hermesProviderModelId,
            aspectRatio: "16:9",
            outputCount: 1,
          },
          references,
          entity: { type: "vertical_drama_location", id: String(locationId) },
          traceId: hermesTraceId,
          tenantId,
          requestedByUserId: userId,
        });
        const hermesTask = buildHermesMediaTaskEnvelope({
          taskId: result.taskId,
          userId,
          mediaType: "image",
          model: hermesProviderModelId,
          prompt: singleFieldPrompt,
          extraParams: {
            __vd_series_id: String(seriesId),
            __vd_location_id: String(locationId),
            ...(input.editInstruction
              ? {
                  __vd_location_generation_mode: "image_to_image",
                  __vd_location_edit_instruction: input.editInstruction,
                  ...(referenceMediaAssetId != null
                    ? {
                        __vd_location_source_media_asset_id: String(
                          referenceMediaAssetId
                        ),
                      }
                    : {}),
                }
              : { __vd_location_generation_mode: "text_to_image" }),
            ...(input.coverageRole
              ? { __vd_location_coverage_role: input.coverageRole }
              : {}),
            ...(input.gapDescription
              ? { __vd_location_coverage_gap: input.gapDescription }
              : {}),
            ...(input.cameraView
              ? { __vd_location_camera_view: input.cameraView }
              : {}),
          },
          droppedReferenceCount,
        });
        return {
          taskId: hermesTask.id,
          establishingPlatePrompt: singleFieldPrompt,
          promptModel,
          creditsUsed: { promptGeneration: promptCreditsUsed, imageRender: 0 },
          droppedReferenceCount,
          ...(input.coverageRole ? { coverageRole: input.coverageRole } : {}),
          ...(input.gapDescription
            ? { gapDescription: input.gapDescription }
            : {}),
          ...(input.cameraView ? { cameraView: input.cameraView } : {}),
        };
      }

      const transportMetadata =
        transportDecision.kind === "mcp"
          ? transportDecision.transportMetadata
          : undefined;

      if (shouldChargeImageCredits) {
        // Reserve credits BEFORE starting the task — `media.getTask`
        // reconciles the reservation against actual usage once the task
        // completes/fails, same convention as every other async render in
        // this codebase.
        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — generate location image (location #${locationId}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_location_visual_bible",
            seriesId,
            locationId,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }
      const userToken = getLocationMediaUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: singleFieldPrompt,
            model: resolvedImageModelId,
            numImages: 1,
            // Wide establishing shot — see this procedure's own doc comment.
            aspectRatio: "16:9",
            ...(referenceUrl ? { referenceImageUrls: [referenceUrl] } : {}),
            // Series provenance tag (project-scoped media panel filter) —
            // persisted verbatim into the media task's `parameters.extra_params`.
            extraParams: {
              __vd_series_id: String(seriesId),
              __vd_location_id: String(locationId),
              ...(input.editInstruction
                ? {
                    __vd_location_generation_mode: "image_to_image",
                    __vd_location_edit_instruction: input.editInstruction,
                    ...(referenceMediaAssetId != null
                      ? {
                          __vd_location_source_media_asset_id: String(
                            referenceMediaAssetId
                          ),
                        }
                      : {}),
                  }
                : { __vd_location_generation_mode: "text_to_image" }),
              ...(input.coverageRole
                ? { __vd_location_coverage_role: input.coverageRole }
                : {}),
              ...(input.gapDescription
                ? { __vd_location_coverage_gap: input.gapDescription }
                : {}),
              ...(input.cameraView
                ? { __vd_location_camera_view: input.cameraView }
                : {}),
            },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              tenantId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaLocations.generateLocationImage",
              stage: "submission",
            },
          },
          userToken
        );
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: location image render failed to submit (location #${locationId})`,
            sourceType: "media_image",
            metadata: {
              feature: "vertical_drama_location_visual_bible",
              seriesId,
              locationId,
            },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Location image generation failed to submit",
        });
      }

      return {
        taskId: task.id,
        establishingPlatePrompt: singleFieldPrompt,
        promptModel,
        creditsUsed: {
          promptGeneration: promptCreditsUsed,
          imageRender: imageCreditCost,
        },
        ...(input.editInstruction
          ? { generationMode: "image_to_image" as const }
          : { generationMode: "text_to_image" as const }),
        ...(referenceMediaAssetId != null
          ? { sourceMediaAssetId: String(referenceMediaAssetId) }
          : {}),
        ...(input.coverageRole ? { coverageRole: input.coverageRole } : {}),
        ...(input.gapDescription
          ? { gapDescription: input.gapDescription }
          : {}),
        ...(input.cameraView ? { cameraView: input.cameraView } : {}),
      };
    }),

  /**
   * Feature 138 P2 named coverage-pack API. It deliberately delegates to the
   * existing renderer so reference attachment, model validation, credits,
   * Hermes/MCP routing, and task provenance cannot drift between the two
   * surfaces. `role` is translated to the renderer's `coverageRole` field.
   */
  generateLocationCoverageImage: verticalDramaSceneContinuityQcProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1),
        role: z.enum(VERTICAL_DRAMA_LOCATION_COVERAGE_ROLES).optional(),
        gapDescription: z.string().trim().max(500).optional(),
        cameraView: cameraViewInput.optional(),
        selectedImageModelId: z.string().trim().min(1).max(128),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().positive().optional(),
        hermesConnectionId: z.string().max(64).optional(),
        approvedPrompt: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const routerValue = verticalDramaLocationsRouter as unknown as {
        createCaller?: (context: unknown) => {
          generateLocationImage: (value: unknown) => Promise<unknown>;
        };
      };
      if (typeof routerValue.createCaller !== "function") {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Location image renderer is unavailable",
        });
      }
      return routerValue.createCaller(ctx).generateLocationImage({
        ...input,
        coverageRole: input.role,
        ...(input.cameraView ? { cameraView: input.cameraView } : {}),
      });
    }),

  /**
   * Attach an existing canonical `media_assets` row as a durable location
   * reference. The media asset is validated for tenant + user ownership and
   * non-deleted status before insert (cross-tenant/deleted are rejected —
   * `VerticalDramaLocationStockError` mapped via `mapLocationStockError`,
   * see this file's top-of-file doc comment for the security rationale).
   */
  linkAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1).optional(),
        mediaAssetId: z.string().min(1).optional(),
        assetType: z.string().min(1).max(40).default("location_reference"),
        role: z.string().max(40).optional(),
        source: z.enum(["generated", "imported"]),
        checksumSha256: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
        /** Keep an existing approved primary pinned while linking an edited
         * candidate. This prevents image-to-image edits from silently
         * changing the location's source image before the creator chooses it. */
        preservePrimaryAssetLinkId: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      let locationId: number | null = null;
      if (input.locationId != null) {
        locationId = parseId(input.locationId, "location id");
        await loadOwnedLocation(tenantId, userId, seriesId, locationId);
      }

      const mediaAssetId =
        input.mediaAssetId != null
          ? parseId(input.mediaAssetId, "media asset id")
          : null;

      try {
        const asset = await verticalDramaLocationStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          locationId,
          mediaAssetId,
          assetType: input.assetType,
          role: input.role ?? null,
          source: input.source,
          checksumSha256: input.checksumSha256 ?? null,
          metadata: input.metadata ?? null,
        });
        if (input.preservePrimaryAssetLinkId != null && locationId != null) {
          await verticalDramaLocationStockService.setPrimaryAsset(
            { tenantId, userId, seriesId },
            locationId,
            parseId(
              input.preservePrimaryAssetLinkId,
              "preserve primary asset link id"
            )
          );
        }
        return { asset };
      } catch (err) {
        mapLocationStockError(err);
      }
    }),

  /**
   * Resolve a Library item or an already-hosted URL into a canonical
   * `media_assets` row, so drag-and-drop from those surfaces can call
   * `linkAsset` immediately. Duplicated from
   * `verticalDramaCharacters.ts`'s `resolveMediaAssetForImport` (same body,
   * "location reference" wording) rather than shared, per this feature's
   * established convention of keeping the character and location routers
   * decoupled (see e.g. `verticalDramaLocationReconciliation.ts`'s own doc
   * comment making the identical call for its `slugifyForLocationKey`
   * helper).
   */
  resolveMediaAssetForImport: verticalDramaProcedure
    .input(
      z.intersection(
        seriesScope,
        z.discriminatedUnion("source", [
          z.object({
            source: z.literal("library"),
            libraryItemId: z.number().int().positive(),
          }),
          z.object({
            source: z.literal("url"),
            // Not `.url()` — local storage's `ai.upload` returns a relative
            // path (`/uploads/...`), which is a valid `storageKey`/`originalUrl`
            // for `createAssetFromAttachment` below but fails a strict
            // absolute-URL check. Same fix as the character router's own
            // identical field.
            url: z.string().min(1),
            mimeType: z.string().min(1),
            fileName: z.string().optional(),
          }),
        ])
      )
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      if (input.source === "library") {
        const [item] = await db
          .select({
            id: libraryItems.id,
            tenantId: libraryItems.tenantId,
            ownerUserId: libraryItems.ownerUserId,
            itemType: libraryItems.itemType,
            sourceUrl: libraryItems.sourceUrl,
          })
          .from(libraryItems)
          .where(
            and(
              eq(libraryItems.id, input.libraryItemId),
              eq(libraryItems.tenantId, tenantId),
              eq(libraryItems.ownerUserId, userId)
            )
          )
          .limit(1);
        if (!item) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Library item not found",
          });
        }
        if (!item.sourceUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Library item has no source URL to import",
          });
        }

        let mimeType: string;
        if (item.itemType === "image") mimeType = "image/jpeg";
        else if (item.itemType === "video") mimeType = "video/mp4";
        else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Library item type "${item.itemType}" is not importable as a location reference`,
          });
        }

        // `createAssetFromAttachment`'s context type requires
        // conversationId/messageId/projectId (chat-attachment-shaped), but
        // those columns are nullable in `media_assets` and irrelevant here —
        // same `as any` cast the character router's own identical call site
        // uses.
        const { assetId } = await createAssetFromAttachment(
          { type: "image", url: item.sourceUrl, mimeType } as any,
          { tenantId, userId } as any
        );
        return { mediaAssetId: String(assetId) };
      }

      // source === "url"
      const { assetId } = await createAssetFromAttachment(
        { type: "image", url: input.url, mimeType: input.mimeType } as any,
        { tenantId, userId } as any
      );
      return { mediaAssetId: String(assetId) };
    }),

  /**
   * Approve a pending reference asset (explicit review gate). Thin wrapper
   * over `transitionAsset(to: "approved")`.
   */
  approveAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaLocationStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: "approved",
        });
        return { asset };
      } catch (err) {
        mapLocationStockError(err);
      }
    }),

  /**
   * Apply an arbitrary lifecycle transition to a reference asset (draft ->
   * generated/imported -> approved / rejected / stale). Illegal transitions
   * are mapped to a generic NOT_FOUND, same as every other
   * `VerticalDramaLocationStockError` on this router (see this file's
   * top-of-file doc comment).
   */
  transitionAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkId: z.string().min(1),
        to: assetStateEnum,
        rejectionReason: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaLocationStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: input.to as (typeof VERTICAL_DRAMA_LOCATION_ASSET_STATES)[number],
          rejectionReason: input.rejectionReason ?? null,
        });
        return { asset };
      } catch (err) {
        mapLocationStockError(err);
      }
    }),

  /**
   * Mark a set of approved references stale (e.g. after the location's
   * identity changes). Returns the number of assets actually transitioned to
   * `stale`.
   */
  markStale: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkIds: z.array(z.string().min(1)).min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const ids = input.assetLinkIds.map(id => parseId(id, "asset link id"));
      const staleCount = await verticalDramaLocationStockService.markStale(
        { tenantId, userId, seriesId },
        ids
      );
      return { staleCount };
    }),

  /**
   * Permanently remove a reference asset from a location's stock — same
   * plain add/delete model the character router's own `deleteAsset` uses.
   * Only unlinks the `verticalDramaLocationAssets` row — the underlying
   * media asset is left intact in Media History/Library.
   */
  deleteAsset: verticalDramaProcedure
    .input(seriesScope.extend({ assetLinkId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        await verticalDramaLocationStockService.deleteAsset(
          { tenantId, userId, seriesId },
          assetLinkId
        );
        return { deleted: true };
      } catch (err) {
        mapLocationStockError(err);
      }
    }),

  /**
   * ALL candidate `establishing_plate` reference images for one location
   * (approved and not) — backs the "multiple candidates, pick a primary"
   * gallery (mirrors, in spirit, how the character system lets a user keep
   * several images; a location is a flat slot with several candidate
   * images, never a variant/twin graph — see this file's top-of-file doc
   * comment). Each returned candidate carries `isPrimary`, resolved per
   * `verticalDramaLocationStock.ts`'s marker rule: an explicit, still-valid
   * `setPrimaryLocationAsset` pick wins; otherwise the newest APPROVED
   * candidate is primary (byte-identical fallback to `list`'s own
   * `primaryReferenceUrl`).
   */
  listLocationAssets: verticalDramaProcedure
    .input(seriesScope.extend({ locationId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const locationId = parseId(input.locationId, "location id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedLocation(tenantId, userId, seriesId, locationId);

      const rows = await verticalDramaLocationStockService.listLocationAssets(
        { tenantId, userId, seriesId },
        locationId
      );
      return {
        assets: rows.map(row => ({
          assetLinkId: String(row.assetLinkId),
          mediaAssetId: String(row.mediaAssetId),
          url: row.url,
          approved: row.approved,
          isPrimary: row.isPrimary,
          role: row.role ?? "establishing_plate",
          metadata: row.metadata ?? null,
          updatedAt: (row.updatedAt instanceof Date
            ? row.updatedAt
            : new Date(row.updatedAt)
          ).toISOString(),
        })),
      };
    }),

  /**
   * Explicitly pick which candidate image is a location's primary
   * reference — thin wrapper over
   * `verticalDramaLocationStockService.setPrimaryAsset` (writes
   * `data.primaryAssetLinkId` on the location row; only an already-approved
   * `establishing_plate` asset belonging to this exact location can be
   * picked, see that method's own doc comment). No rate limit — unlike
   * `previewLocationPrompt`/`generateLocationImage`/
   * `resolveMediaAssetForImport`/`detectLocationsNow` above, this performs
   * no generation/LLM call, same convention as
   * `approveAsset`/`transitionAsset`/`markStale`/`deleteAsset`, none of
   * which rate-limit either.
   */
  setPrimaryLocationAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        locationId: z.string().min(1),
        assetLinkId: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const locationId = parseId(input.locationId, "location id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedLocation(tenantId, userId, seriesId, locationId);

      try {
        await verticalDramaLocationStockService.setPrimaryAsset(
          { tenantId, userId, seriesId },
          locationId,
          assetLinkId
        );
        return { ok: true };
      } catch (err) {
        mapLocationStockError(err);
      }
    }),

  /**
   * Location Visual Bible — whole-series location detection. Reads the
   * entire season's drafted deep-story content and proposes a roster of
   * every distinct physical setting the story establishes, reconciling the
   * result into the durable `vertical_drama_locations` roster. Location-side
   * companion to `verticalDramaCharacters.ts`'s `detectCharacterVariantsNow`,
   * callable on demand exactly like that procedure. Reuses the EXACT same
   * "read every drafted episode's shot content -> generate a whole-season
   * plan -> reconcile into durable rows" shape, just with a flat location
   * roster instead of a variant/twin character graph (locations have no
   * variant/twin relationship concept at all — see
   * `verticalDramaLocationReconciliation.ts`'s own doc comment).
   *
   * `verticalDramaLocationDetector`/`verticalDramaStoryBible` are loaded via
   * a DYNAMIC `import()` INSIDE this procedure (never a static top-level
   * import) — see this file's own type-only import note above for why.
   *
   * Credit-gated by `generateLocationDetectionPlan` ITSELF
   * (`hasEnoughCredits`/`deductCredits` live inside that function) — this
   * mutation invents no separate credit-charging scheme of its own, matching
   * `detectCharacterVariantsNow`'s established pattern.
   *
   * Throws `PRECONDITION_FAILED` when there is no usable episode content (no
   * drafted episode) — same precondition `detectCharacterVariantsNow`
   * enforces, for the same reason (a direct user action must tell the
   * caller clearly why nothing happened, unlike a best-effort background
   * phase).
   *
   * DELIBERATE DIVERGENCE from `detectCharacterVariantsNow`: this procedure
   * does NOT throw on an empty existing-location roster. Characters require
   * a non-empty roster because that endpoint only ever proposes
   * variants/twins OF existing characters — there is nothing to vary when
   * the roster is empty. Locations have no such requirement: starting from
   * zero (an older series, or an empty wizard textarea) is exactly the case
   * this button exists to fix, and the skill is explicitly written to
   * propose a fresh roster from nothing (see `skill.md`'s own "may start
   * completely EMPTY" framing).
   */
  detectLocationsNow: verticalDramaProcedure
    .input(seriesScope)
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      // Submit the paid planner to the durable worker.  The old inline body
      // below is intentionally unreachable until removed in the cleanup
      // pass; keeping the early return here makes the browser request bounded
      // even when the season contains hundreds of drafted episodes.
      return enqueueVerticalDramaInteractiveJob({
        kind: "location_detection",
        tenantId,
        userId,
        scopeKey: `series:${seriesId}`,
        skillSlug: "vertical-drama-location-detector",
        idempotencyKey: `locations:${seriesId}`,
        input: { seriesId },
      });

      const [seriesRow] = await db
        .select({
          locale: verticalDramaSeries.locale,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(
          and(
            eq(verticalDramaSeries.id, seriesId),
            eq(verticalDramaSeries.tenantId, tenantId)
          )
        )
        .limit(1);
      const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? {};
      const lang: StoryScriptLang = seriesRow?.locale === "th" ? "th" : "en";

      const {
        getActiveBreakdown,
        readItemShotDrafts,
        readItemCliffhangerLine,
      } = await import("../services/verticalDramaStoryBible");
      const {
        generateLocationDetectionPlan,
        reconcileLocationDetectionPlan,
        InsufficientCreditsError,
        VdSchemaValidationError,
      } = await import("../services/verticalDramaLocationDetector");

      const activeItems = getActiveBreakdown(bible);
      const draftedItems = activeItems.filter(
        item => readItemShotDrafts(item) !== null
      );
      if (draftedItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Generate deep story drafts first before detecting locations",
        });
      }
      const episodes: StoryScriptEpisodeInput[] = draftedItems.map(item => ({
        episodeNumber: item.episodeNumber,
        workingTitle: item.workingTitle,
        logline: item.logline,
        keyBeats: item.keyBeats,
        shotDrafts: readItemShotDrafts(item),
        cliffhangerLine: readItemCliffhangerLine(item),
      }));

      // DELIBERATE DIVERGENCE from `detectCharacterVariantsNow` — no
      // precondition on a non-empty existing roster here. See this
      // procedure's own doc comment above.
      const locationRows: VerticalDramaLocationRow[] = await db
        .select()
        .from(verticalDramaLocations)
        .where(
          and(
            eq(verticalDramaLocations.tenantId, tenantId),
            eq(verticalDramaLocations.userId, userId),
            eq(verticalDramaLocations.seriesId, seriesId)
          )
        );
      const existingLocations = locationRows.map(row => ({
        locationKey: row.locationKey,
        name: row.name,
        description: extractLocationDescription(
          (row.data as Record<string, unknown> | null) ?? null
        ),
      }));

      let planResult: Awaited<ReturnType<typeof generateLocationDetectionPlan>>;
      try {
        planResult = await generateLocationDetectionPlan({
          userId,
          tenantId,
          seriesId,
          lang,
          existingLocations,
          episodes,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: String(err) || "Insufficient credits",
          });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: String(err) || "Location detection validation failed",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: String(err),
        });
      }

      const summary = await reconcileLocationDetectionPlan(
        { tenantId, userId, seriesId },
        planResult.plan
      );

      return {
        locationsCreated: summary.createdLocations.length,
        locationsReused: summary.reusedLocations.length,
        createdLocations: summary.createdLocations,
        reusedLocations: summary.reusedLocations,
      };
    }),
});
