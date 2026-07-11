/**
 * Vertical Drama Series — durable character-stock router (spec feature 131,
 * section-05, §7.1 / §7.2 / §7.3).
 *
 * Surfaces the durable per-series character roster AND its reference-asset stock
 * (approval / QC lifecycle) over tRPC. Every procedure is protected (auth
 * required), gated on the `verticalDramaSeries` tenant feature flag (fail-closed),
 * and scoped to the caller's tenant + user + series so a user can never read,
 * attach, approve, or transition another tenant's or user's character/asset.
 *
 * Cross-tenant / cross-user rows are reported as NOT_FOUND (never FORBIDDEN) so
 * the surface never discloses the existence of another owner's data. Illegal
 * state-machine transitions surface as PRECONDITION_FAILED.
 *
 * The character roster (`verticalDramaCharacters`) is owned directly here; the
 * reference-asset stock (link / manifest / approve / transition / stale) is
 * delegated to `verticalDramaCharacterStockService`.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit that
 * file here.
 */

import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, or } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { db } from "../db";
import {
  verticalDramaSeries,
  verticalDramaCharacters,
  mediaAssets,
  mediaModels,
  libraryItems,
  apiAuditEvents,
  type VerticalDramaCharacterRow,
} from "../../drizzle/schema";
import {
  verticalDramaCharacterStockService,
  VerticalDramaCharacterStockError,
} from "../services/verticalDramaCharacterStock";
import { VERTICAL_DRAMA_CHARACTER_ASSET_STATES } from "@shared/verticalDramaSeries/characterAssets";
import { readTargetAudienceRegionFromBible } from "@shared/verticalDramaSeries/targetAudienceRegion";
import { mediaGenerationService, DEFAULT_MODELS } from "../services/mediaGenerationService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { hasEnoughCredits, deductCredits, refundCredits } from "../services/creditService";
import { signBearerToken } from "../_core/tokens";
import {
  generateCharacterVisualPrompts,
  InsufficientCreditsError,
  VdSchemaValidationError,
  readPresetVisualIdentityFromBible,
  resolveFaceSourceReferenceForCharacter,
} from "../services/verticalDramaCharacterImageGeneration";
import { mediaGenerationLimiter } from "../services/rateLimiter";
import { createAssetFromAttachment } from "../services/mediaAssetService";
import { resolveMediaModelTransportConfig } from "../../shared/mediaModelTransport";
import { resolveMediaTransport } from "../services/mediaTransportResolver";
import { normalizeMcpProviderModelIdForProvider } from "../services/mcpProviderModelAliases";
import { resolveMcpRouteFromModelId, defaultMcpArgumentShape } from "../services/mcpModelRouteResolver";
import type { MediaTaskTransportMetadata } from "../../shared/mcpConnectTypes";
import { getModelsByTypeAsync } from "../services/modelRegistry";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
// W12-A voice chain note: `listVoiceCatalog` below reuses the EXACT
// server-side voice-option resolution `media.listModelFieldOptions` already
// implements (dynamic UVoice/provider-API fetch with its own module-level
// cache, merged with static field options) via a real in-process tRPC caller
// into `./media`'s already-exported `mediaRouter` — never a duplicated
// network-calling/caching implementation, and `media.ts` is never modified by
// this router. Imported with a DYNAMIC `import()` INSIDE that procedure
// (never a static top-level import) — `media.ts`'s own module graph pulls in
// `enabledLlmModels.ts` -> `llmProviders.ts`'s `adminProcedure`, which this
// file's existing minimal-mock test suites (`modelSelection.test.ts`,
// `extractDescription.test.ts`) do not export; a static import would break
// them the moment this file loads. Same "dynamic import, never static"
// convention `verticalDramaEpisodes.ts` already documents for the identical
// problem (see that file's Wave-7D `scriptCoverageDetail` doc comment).
import { sanitizeSpeakableLineForDelivery } from "@shared/verticalDramaSeries/dialogueQuality";
import { debugError } from "../_core/logger";
import {
  verticalDramaCharacterVoiceConfigInputSchema,
  type VerticalDramaCharacterVoiceConfig,
  type VerticalDramaVoiceCatalogEntry,
} from "@shared/verticalDramaSeries/voiceCasting";
// F5 manual variant/twin CRUD
// (`planning/vertical-drama-twin-variant-completeness/plan.md` W2) — TYPE-ONLY
// imports only (erased at compile time, no runtime module load) so this
// file's existing minimal-mock test suites are unaffected; the corresponding
// RUNTIME functions (`generateCharacterVariantPlan`/`reconcileCharacterVariantPlan`/
// `extractCharacterRosterDescription`/error classes, plus
// `getActiveBreakdown`/`readItemShotDrafts`/`readItemCliffhangerLine`) are
// loaded via a DYNAMIC `import()` INSIDE `detectCharacterVariantsNow` only —
// see that procedure's own doc comment for why (same convention this file's
// `listVoiceCatalog` already documents for `./media`).
import type { StoryScriptLang, StoryScriptEpisodeInput } from "@shared/verticalDramaSeries/storyScriptText";
import type { CharacterVariantPlannerCharacterInput } from "../services/verticalDramaCharacterVariantPlanner";

/* -------------------------------------------------------------------------- */
/* Base procedure + ownership helpers                                          */
/* -------------------------------------------------------------------------- */

const verticalDramaProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeries"),
);

/**
 * Base procedure for the voice-casting/voice-chain procedures (W12-A, spec
 * feature 131 addendum): the base `verticalDramaSeries` gate PLUS the
 * dedicated `verticalDramaSeriesVoiceChain` flag — mirrors
 * `verticalDramaSeries.ts`'s established "chain a second, feature-specific
 * `requireFeatureFlag` middleware" convention (see
 * `verticalDramaDeepStoryDraftsProcedure`/`verticalDramaArcReplanProcedure`
 * there). Flags-off byte-identical: these are brand-new procedures, so "off"
 * means the procedure throws FORBIDDEN before any handler code runs at all.
 */
const verticalDramaVoiceChainProcedure = verticalDramaProcedure.use(
  requireFeatureFlag("verticalDramaSeriesVoiceChain"),
);

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
 * another tenant's/user's series.
 */
async function loadOwnedSeries(tenantId: string, userId: number, seriesId: number) {
  const [row] = await db
    .select({ id: verticalDramaSeries.id })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, seriesId),
        eq(verticalDramaSeries.tenantId, tenantId),
        eq(verticalDramaSeries.userId, userId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  return row;
}

/** Load a caller-owned character (tenant + user + series scoped) or NOT_FOUND. */
async function loadOwnedCharacter(
  tenantId: string,
  userId: number,
  seriesId: number,
  characterId: number,
): Promise<VerticalDramaCharacterRow> {
  const [row] = await db
    .select()
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.id, characterId),
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Character not found" });
  return row;
}

/**
 * All `characterKey`s already used in a series (tenant + user scoped) — the
 * dedup universe `generateUniqueCharacterKey` checks against when a manual
 * variant/twin mutation mints a new `characterKey`. Mirrors
 * `reconcileCharacterVariantPlan`'s own `usedKeys` set (built from a full
 * roster `select()` in `verticalDramaCharacterVariantPlanner.ts`), just
 * narrowed to the one column these mutations need.
 */
async function loadSeriesCharacterKeys(
  tenantId: string,
  userId: number,
  seriesId: number,
): Promise<Set<string>> {
  const rows = await db
    .select({ characterKey: verticalDramaCharacters.characterKey })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, tenantId),
        eq(verticalDramaCharacters.userId, userId),
        eq(verticalDramaCharacters.seriesId, seriesId),
      ),
    );
  return new Set(rows.map((row: { characterKey: string }) => row.characterKey));
}

/**
 * Slugify a variant label / twin name into a `characterKey` suffix
 * candidate (lowercase, non-alphanumeric collapsed to `-`, trimmed). Falls
 * back to `"variant"` for labels that are entirely non-alphanumeric (e.g.
 * Thai-only text). Byte-identical duplicate of
 * `verticalDramaCharacterVariantPlanner.ts`'s own `slugifyForCharacterKey` —
 * this codebase's established convention is a small local slugify per file,
 * not a shared util (see that function's own doc comment); this router
 * cannot import it anyway, since it is a private (non-exported) function of
 * that service file.
 */
function slugifyForCharacterKey(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "variant";
}

/**
 * Appends `-2`, `-3`, ... until `baseKey` is not already present in
 * `usedKeys`; mutates nothing, caller adds the result to `usedKeys` itself.
 * Byte-identical duplicate of `verticalDramaCharacterVariantPlanner.ts`'s own
 * helper of the same name (same non-exported-private reasoning as
 * `slugifyForCharacterKey` above).
 */
function generateUniqueCharacterKey(baseKey: string, usedKeys: Set<string>): string {
  const base = baseKey.trim() || "character";
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }
  return key;
}

/**
 * Best-effort attach of a caller-supplied reference image as a newly-created
 * variant/twin character's `primary_portrait` reference, via the SAME
 * `verticalDramaCharacterStockService.linkAsset` service call the `linkAsset`
 * mutation itself uses (never a duplicated implementation). Deliberately
 * does NOT use `mapStockError` here (unlike `linkAsset`'s own mutation,
 * which propagates a mapped error to the caller) — this helper NEVER throws:
 * the created character row is always the primary result of
 * `createCharacterVariant`/`createCharacterTwin`, and a failed secondary
 * asset attach must not roll back or fail that primary mutation (same
 * "never block the primary mutation" convention as
 * `recordVoiceChainAuditEvent`). Logs via `debugError` on failure so the gap
 * stays observable.
 */
async function bestEffortLinkPrimaryPortrait(params: {
  tenantId: string;
  userId: number;
  seriesId: number;
  characterId: number;
  mediaAssetId: number;
  logSource: string;
}): Promise<void> {
  try {
    await verticalDramaCharacterStockService.linkAsset({
      tenantId: params.tenantId,
      userId: params.userId,
      seriesId: params.seriesId,
      characterId: params.characterId,
      mediaAssetId: params.mediaAssetId,
      assetType: "character_reference",
      role: "primary_portrait",
      source: "imported",
      containsHumanFace: null,
      checksumSha256: null,
      metadata: null,
    });
  } catch (error) {
    debugError(
      params.logSource,
      `Failed to auto-attach reference image for newly-created character #${params.characterId} — best-effort, does not fail the create mutation`,
      error,
    );
  }
}

/**
 * Resolves the series' stamped preset visual identity for character-prompt
 * flow-through (spec §8.2.2 flow-through rule, section-15 change D) —
 * flag-gated: returns `undefined` (no flow-through, legacy-tolerant
 * behavior) unless the tenant has `verticalDramaSeriesPresetMixV2` enabled.
 * `generateCharacterVisualPrompts`/`buildUserPrompt` in
 * `verticalDramaCharacterImageGeneration.ts` do NOT know about feature
 * flags themselves (same convention as every other flag-gated field on this
 * router) — this is the ONE place the flag is consulted for all 4
 * generation call sites below.
 */
async function resolveCharacterPresetVisualIdentity(
  tenantId: string,
  bible: Record<string, unknown> | null,
): Promise<VerticalDramaPresetVisualIdentity | undefined> {
  const flags = await getTenantFeatureFlags(tenantId);
  if (flags.verticalDramaSeriesPresetMixV2 !== true) return undefined;
  return readPresetVisualIdentityFromBible(bible);
}

/**
 * Translate a service-level `VerticalDramaCharacterStockError` into the correct
 * tRPC error code. Cross-tenant / cross-user / missing rows become NOT_FOUND so
 * we never disclose another owner's data; illegal transitions surface as
 * PRECONDITION_FAILED.
 */
function mapStockError(err: unknown): never {
  if (err instanceof VerticalDramaCharacterStockError) {
    switch (err.reason) {
      case "media_asset_not_found":
      case "media_asset_cross_tenant":
      case "media_asset_cross_user":
      case "asset_not_found":
        throw new TRPCError({ code: "NOT_FOUND", message: "Referenced asset not found" });
      case "media_asset_deleted":
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      case "illegal_state_transition":
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
      default:
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
    }
  }
  throw err;
}

/**
 * Resolve the identity-lock reference-portrait URL for a character render
 * (Phase D1 reference picker,
 * `planning/vertical-drama-reference-picker-outfit-lock/plan.md`; widened by
 * Phase F1, `planning/vertical-drama-twin-variant-completeness/plan.md`
 * W1). Three tiers, checked in order:
 *
 * 1. An explicit `referenceAssetLinkId` override takes precedence when
 *    present (routed through `getReferenceImageUrlByAssetLinkId` +
 *    `mapStockError`, same error-mapping convention every other
 *    stock-service call site in this file uses) — UNCHANGED.
 * 2. Otherwise falls back to the pre-existing auto-resolution — this
 *    character's own approved portrait via `getPrimaryPortraitUrl` —
 *    UNCHANGED.
 * 3. NEW: if tier 2 returns `null` (the character has no portrait of its
 *    own yet — e.g. a brand-new variant/twin on its very first render) AND
 *    `fallbackSourceCharacterId` is supplied (callers pass the character's
 *    `parentCharacterId ?? sharesFaceWithCharacterId`), fall back to that
 *    source character's own portrait via a second `getPrimaryPortraitUrl`
 *    call. A new variant/twin should default to borrowing its source's
 *    identity-lock reference rather than getting zero visual identity lock
 *    on its first render. If the source has no portrait either, returns
 *    `null` as before — nothing more to fall back to.
 *
 * Shared by `generateCharacterImage` and `generateCharacterSheet` so the
 * override contract can never drift between the two call sites.
 */
export async function resolveReferencePortraitUrl(
  owner: { tenantId: string; userId: number; seriesId: number },
  characterId: number,
  referenceAssetLinkId: string | undefined,
  fallbackSourceCharacterId?: number | null,
): Promise<string | null> {
  if (!referenceAssetLinkId) {
    const ownPortraitUrl = await verticalDramaCharacterStockService.getPrimaryPortraitUrl(
      owner,
      characterId,
    );
    if (ownPortraitUrl) return ownPortraitUrl;
    if (fallbackSourceCharacterId != null) {
      return verticalDramaCharacterStockService.getPrimaryPortraitUrl(
        owner,
        fallbackSourceCharacterId,
      );
    }
    return null;
  }
  try {
    return await verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId(
      owner,
      parseId(referenceAssetLinkId, "reference asset link id"),
    );
  } catch (err) {
    mapStockError(err);
  }
}

/**
 * Short-lived server-to-server bearer token for the Python media-generation
 * backend, mirroring `server/routers/media.ts`'s `createMediaToken`/
 * `getUserToken` convention exactly: prefer the caller's own session token
 * (so usage attributes correctly), fall back to minting a scoped token.
 */
function createCharacterPortraitMediaToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["media:generate"],
      jti: `vd_char_portrait_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m",
  );
}

function getCharacterPortraitUserToken(ctx: { userToken: string | null; user: { id: number } }): string {
  return ctx.userToken || createCharacterPortraitMediaToken(ctx.user.id);
}

/**
 * Resolve MCP transport metadata for a character-portrait/turnaround/sheet
 * generation call when the caller-selected image model is MCP-transport
 * (e.g. `higgsfield/*`, `magnific-mcp/*` — billed via the user's connected
 * MCP provider account, not SmartSpec credits). Returns `null` for ordinary
 * gateway_api models, in which case the caller proceeds exactly as before
 * (credit reserve + `generateImageAsync` without `transportMetadata`).
 *
 * Mirrors `verticalDramaEpisodes.ts`'s private `resolveVdMcpTransportMetadata`
 * byte-for-byte (that helper isn't exported, and duplicating it here avoids a
 * cross-router coupling for what is otherwise self-contained logic) — see
 * that function's doc comment for the full rationale on each step.
 */
export async function resolveVdCharacterMcpTransportMetadata(params: {
  tenantId: string;
  actorUserId: number;
  assetType: "image" | "video";
  modelId: string;
  configJson: Record<string, unknown> | null;
  mcpConnectionId?: string;
  idempotencyKey?: string;
}): Promise<MediaTaskTransportMetadata | null> {
  const modelTransport = resolveMediaModelTransportConfig({
    modelId: params.modelId,
    configJson: params.configJson,
  });
  const modelRoute = resolveMcpRouteFromModelId(params.modelId);
  const shouldUseMcpTransport = modelTransport.transport === "mcp" || Boolean(modelRoute.providerKey);
  if (!shouldUseMcpTransport) return null;

  const providerKey = modelTransport.providerKey ?? modelRoute.providerKey;
  if (!providerKey) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `MCP provider route metadata is missing for model "${params.modelId}". Re-select an MCP media model and try again.`,
    });
  }
  const rawProviderModelId = modelTransport.providerModelId ?? modelRoute.providerModelId;
  const argumentShape = modelTransport.argumentShape ?? defaultMcpArgumentShape(providerKey, params.assetType);
  const providerModelId = normalizeMcpProviderModelIdForProvider({
    providerKey,
    providerModelId: rawProviderModelId,
    assetType: params.assetType,
    argumentShape,
  }) ?? rawProviderModelId;

  if (!params.mcpConnectionId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `"${params.modelId}" requires a connected MCP provider account. Connect a ${providerKey} MCP account first, then re-select this model.`,
    });
  }

  return resolveMediaTransport({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    originSurface: "media_studio",
    assetType: params.assetType,
    requestedTransport: "mcp",
    mcpConnectionId: params.mcpConnectionId,
    providerKey,
    providerModelId,
    model: providerModelId ?? params.modelId,
    toolName: modelTransport.toolName,
    argumentShape,
    idempotencyKey: params.idempotencyKey,
  });
}

/**
 * Resolve the effective image model id for a character generation call:
 * caller-supplied `selectedImageModelId` (validated + must be enabled),
 * falling back to `DEFAULT_MODELS.image` when absent — same fail-open-to-
 * known-good-default convention as `verticalDramaEpisodes.ts`'s
 * `resolveEpisodeImageModelId`. Unlike the episode router (which resolves
 * from a persisted plan field), the character tab passes the model
 * per-request, so this only needs to validate + default, not read a plan.
 */
export async function resolveCharacterImageModelId(selectedImageModelId?: string): Promise<string> {
  const requested = selectedImageModelId?.trim();
  if (!requested) return DEFAULT_MODELS.image;
  // Validate the caller-supplied model: must exist, must be an image model,
  // and must be enabled (same validation `verticalDramaEpisodes.ts`'s
  // `assertModelSelectable` performs — inlined here, rather than imported
  // from that router, to keep this router's own module graph/test mocks
  // self-contained; both call the same underlying `getModelsByTypeAsync`).
  const models = await getModelsByTypeAsync("image");
  const model = models.find(m => m.id === requested);
  if (!model) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unknown image model "${requested}"`,
    });
  }
  if (model.isEnabled === false) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Model "${requested}" is currently disabled and cannot be selected`,
    });
  }
  return requested;
}

/**
 * Character Design Bible sheet formats (vertical-drama-character-sheet-
 * consolidation plan) — the merged `generateCharacterSheet` mutation's
 * `sheetType` input. `"auto"` resolves to `"turnaround"` (see
 * `resolveCharacterSheetType`); `"turnaround"`/`"full_combined"` are the two
 * pre-existing formats; the other 11 are new, defined in
 * `skills/vertical-drama-character-visual-bible/skill.md`'s "Character Design
 * Bible sheet types" section.
 */
export const CHARACTER_SHEET_TYPE_VALUES = [
  "auto",
  "turnaround",
  "full_combined",
  "cover",
  "character_profile",
  "face_detail",
  "expression_12",
  "hair_reference",
  "costume_breakdown",
  "material_fabric",
  "color_palette",
  "pose_library",
  "body_proportion",
  "ai_prompt_lock",
] as const;
export type VerticalDramaCharacterSheetType = (typeof CHARACTER_SHEET_TYPE_VALUES)[number];
export type ResolvedVerticalDramaCharacterSheetType = Exclude<
  VerticalDramaCharacterSheetType,
  "auto"
>;

/**
 * Resolve `"auto"` (the mutation's default) to `"turnaround"` — preserves
 * today's cheaper/older default behavior for a caller that doesn't pick a
 * specific Character Design Bible format (plan Decision 2). Every other value
 * passes through unchanged.
 */
export function resolveCharacterSheetType(
  sheetType: VerticalDramaCharacterSheetType | undefined,
): ResolvedVerticalDramaCharacterSheetType {
  if (!sheetType || sheetType === "auto") return "turnaround";
  return sheetType;
}

/**
 * Maps a resolved sheet type to the `verticalDramaCharacterAssets.role`/
 * `metadata` pair the caller should use once the async render task completes
 * and it calls the existing `linkAsset` mutation (plan Decision 4). Three
 * tiers:
 *  - `"turnaround"` -> the pre-existing `"character_sheet_turnaround"` role
 *    (stays inside `CHARACTER_SHEET_ROLES` in `verticalDramaCharacterStock.ts`
 *    — a real face turnaround, correct to use as a second identity-lock
 *    reference).
 *  - `"full_combined"` -> the pre-existing `"character_sheet_full"` role
 *    (same reasoning).
 *  - every other (new) format -> a brand-new `"character_design_bible"` role,
 *    deliberately OUTSIDE `CHARACTER_SHEET_ROLES` — several of these formats
 *    carry no face at all (e.g. `color_palette`, `material_fabric`), so they
 *    must never be picked as a second identity-lock reference — plus
 *    `metadata: { sheetType }` so the specific format stays recoverable.
 */
export function resolveCharacterSheetAssetTag(
  resolvedType: ResolvedVerticalDramaCharacterSheetType,
): { role: string; metadata: { sheetType: string } | null } {
  if (resolvedType === "turnaround") {
    return { role: "character_sheet_turnaround", metadata: null };
  }
  if (resolvedType === "full_combined") {
    return { role: "character_sheet_full", metadata: null };
  }
  return { role: "character_design_bible", metadata: { sheetType: resolvedType } };
}

/**
 * Best-effort character description drawn from `verticalDramaCharacters.data`
 * (the free-form `VerticalDramaCharacter` payload — description/personality/
 * backstory/identityLock/wardrobeRules). `data.description` is the
 * authoritative source for core physical/demographic traits (age, gender,
 * defining features — e.g. "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย...") that MUST
 * reach the visual-bible/portrait prompt builder; it is deliberately placed
 * FIRST in the aggregated string so it leads (not trails) personality/
 * backstory prose, since a downstream LLM call can otherwise under-weight or
 * ignore later-listed traits and invent an unconstrained identity (e.g.
 * rendering an adult when the character is a 12-year-old boy).
 * Returns `undefined` when nothing usable is present.
 */
export function extractCharacterDescription(data: Record<string, unknown> | null): string | undefined {
  if (!data) return undefined;
  const parts: string[] = [];
  if (typeof data.description === "string" && data.description.trim()) {
    parts.push(`Description: ${data.description.trim()}`);
  }
  if (typeof data.personality === "string" && data.personality.trim()) {
    parts.push(`Personality: ${data.personality.trim()}`);
  }
  if (typeof data.backstory === "string" && data.backstory.trim()) {
    parts.push(`Backstory: ${data.backstory.trim()}`);
  }
  if (typeof data.identityLock === "string" && data.identityLock.trim()) {
    parts.push(`Identity lock: ${data.identityLock.trim()}`);
  }
  if (Array.isArray(data.wardrobeRules)) {
    const rules = data.wardrobeRules.filter(
      (rule): rule is string => typeof rule === "string" && rule.trim().length > 0,
    );
    if (rules.length > 0) parts.push(`Wardrobe rules: ${rules.join("; ")}`);
  }
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

/** Browser-safe projection of a character roster row (never leaks internal ids as numbers). */
/**
 * `includeVoiceConfig` (W12-A, default `false`) — only set `true` by callers
 * that already confirmed the tenant's `verticalDramaSeriesVoiceChain` flag is
 * on (see `resolveVerticalDramaVoiceChainFlag`). Gating it here, not just on
 * the DB column being null, keeps read payloads flags-off byte-identical even
 * in the edge case where a tenant had the flag on, cast a character, then had
 * it turned back off — the field simply stops being surfaced.
 */
function characterRowToDto(row: VerticalDramaCharacterRow, options: { includeVoiceConfig?: boolean } = {}) {
  return {
    characterId: String(row.id),
    seriesId: String(row.seriesId),
    characterKey: row.characterKey,
    name: row.name,
    role: row.role ?? undefined,
    data: (row.data as Record<string, unknown> | null) ?? undefined,
    // planning/vertical-drama-character-variants/plan.md Phase E — expose the
    // Phase A schema columns so the Characters tab can group variant rows
    // under their parent and badge twin (shares-face) rows.
    parentCharacterId: row.parentCharacterId != null ? String(row.parentCharacterId) : undefined,
    variantLabel: row.variantLabel ?? undefined,
    variantType: (row.variantType as "outfit" | "age_stage" | null) ?? undefined,
    sharesFaceWithCharacterId:
      row.sharesFaceWithCharacterId != null ? String(row.sharesFaceWithCharacterId) : undefined,
    createdAt: (row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).toISOString(),
    updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString(),
    ...(options.includeVoiceConfig
      ? { voiceConfig: (row.voiceConfig as VerticalDramaCharacterVoiceConfig | null) ?? undefined }
      : {}),
  };
}

/** Resolve the `verticalDramaSeriesVoiceChain` tenant flag (W12-A) — same
 *  "one focused helper per flag-group" convention as
 *  `verticalDramaEpisodes.ts`'s `resolveVerticalDramaDeepStoryDraftsFlag`.
 *  Optional chaining fails closed for any pre-existing test that mocks
 *  `getTenantFeatureFlags` as a bare `vi.fn()`. */
async function resolveVerticalDramaVoiceChainFlag(tenantId: string): Promise<boolean> {
  const flags = await getTenantFeatureFlags(tenantId);
  return flags?.verticalDramaSeriesVoiceChain === true;
}

/* -------------------------------------------------------------------------- */
/* W12-A voice chain helpers                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort audit record for a voice-casting/voice-chain action. Written to
 * the cross-cutting `api_audit_events` table — same "best-effort DB insert,
 * never throws" convention as `verticalDramaSeries.ts`'s
 * `recordDeepStoryDraftAuditEvent` (see that function's own doc comment for
 * the full rationale). NEVER throws — a failed audit write must not fail the
 * user-facing mutation.
 */
async function recordVoiceChainAuditEvent(params: {
  eventType: "vertical_drama_voice_cast" | "vertical_drama_voice_preview";
  endpoint: string;
  userId: number;
  seriesId: number;
  characterId: number;
  creditsCharged?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(apiAuditEvents).values({
      traceId: crypto.randomUUID().replace(/-/g, "").slice(0, 32),
      eventType: params.eventType,
      userId: params.userId,
      endpoint: `verticalDramaCharacters.${params.endpoint}`,
      statusCode: 200,
      skillSlug: "vertical-drama-voice-chain",
      creditsCharged: Math.round(params.creditsCharged ?? 0),
      metadata: {
        seriesId: params.seriesId,
        characterId: params.characterId,
        ...(params.metadata ?? {}),
      },
    });
  } catch (error) {
    debugError("verticalDramaCharacters.voiceChain", "Failed to record voice chain audit event", error);
  }
}

/** The subset of a media model's `configJson.inputFields[n]` entry needed to
 *  detect the voice picker field — mirrors the SAME subset
 *  `VerticalDramaSeriesTrailerPanel.tsx`'s (client-only) `ModelInputFieldConfig`
 *  reads, reimplemented here server-side since that component's helpers are
 *  not exported/shared. */
interface VoiceCatalogInputFieldConfig {
  key?: string;
  options?: unknown;
  optionsSource?: { valueField?: string; previewField?: string };
}

/**
 * Detect whether a model input field is "the voice picker" — same rule as
 * the trailer panel's `isVoiceSelectionField`: a field counts when its
 * provider-API options source targets `voice_id`/`preview_url`, OR its
 * (normalized) key is `voice`, `voiceid`, or `voiceidN` (matches UVoice's
 * `voiceID` key, not just the literal string `"voice"`).
 */
function isVoiceCatalogField(field: VoiceCatalogInputFieldConfig | null | undefined): boolean {
  if (!field || typeof field !== "object") return false;
  const source = field.optionsSource;
  if (source && typeof source === "object") {
    const valueField = String(source.valueField ?? "").trim().toLowerCase();
    const previewField = String(source.previewField ?? "").trim().toLowerCase();
    if (valueField === "voice_id" || previewField === "preview_url") return true;
  }
  const normalizedKey = String(field.key ?? "").trim().toLowerCase().replace(/[_\-\s]/g, "");
  return normalizedKey === "voice" || normalizedKey === "voiceid" || /^voiceid\d+$/.test(normalizedKey);
}

/** Resolve which `configJson.inputFields[]` key is the voice picker for a
 *  model, or `undefined` when the model has no dynamic/static voice field
 *  (e.g. models that only expose a flat `voices` column). */
function resolveVoiceCatalogFieldKey(configJson: Record<string, unknown> | null | undefined): string | undefined {
  const inputFields = Array.isArray(configJson?.inputFields)
    ? (configJson!.inputFields as VoiceCatalogInputFieldConfig[])
    : [];
  return inputFields.find((field) => isVoiceCatalogField(field))?.key;
}

/**
 * Best-effort `{language, ageTag}` extraction from a voice option label —
 * e.g. UVoice's `"th - ปอร์เช่ (Adult)"` -> `{language: "th", ageTag: "Adult"}`.
 * Returns an empty object when the label doesn't encode either; no source
 * this catalog reads from currently publishes an explicit `gender` field, so
 * `VerticalDramaVoiceCatalogEntry.gender` is always left unset here — it
 * exists on the shared type for forward compatibility only.
 */
function parseVoiceCatalogLabelMetadata(label: string): { language?: string; ageTag?: string } {
  const languageMatch = /^([a-z]{2})\s*-\s*/i.exec(label);
  const ageTagMatch = /\(([^()]+)\)\s*$/.exec(label);
  return {
    language: languageMatch?.[1]?.toLowerCase(),
    ageTag: ageTagMatch?.[1]?.trim(),
  };
}

/** Fixed Thai self-introduction sample line for `previewCharacterVoice` when
 *  the caller doesn't supply `sampleText` — always includes the character's
 *  name so the preview is recognizably about THIS character. */
function buildFixedThaiVoicePreviewSample(characterName: string): string {
  return `สวัสดีค่ะ ฉันคือ ${characterName} ยินดีที่ได้รู้จักนะคะ`;
}

/** Resolve the audio model's pricing row for credit calculation, falling back
 *  to the same `{creditCost: 10, configJson: null}` default this router
 *  already uses for image models when the row is missing (e.g. a stale/
 *  deleted model id). */
async function resolveAudioModelPricing(
  voiceModelId: string,
): Promise<{ creditCost: number; configJson: Record<string, unknown> | null }> {
  const [pricingRow] = await db
    .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
    .from(mediaModels)
    .where(eq(mediaModels.modelId, voiceModelId))
    .limit(1);
  return pricingRow ?? { creditCost: 10, configJson: null };
}

/* -------------------------------------------------------------------------- */
/* Input schemas                                                              */
/* -------------------------------------------------------------------------- */

const seriesScope = z.object({ seriesId: z.string().min(1) });

const assetStateEnum = z.enum(
  VERTICAL_DRAMA_CHARACTER_ASSET_STATES as unknown as [string, ...string[]],
);

/* -------------------------------------------------------------------------- */
/* Router                                                                      */
/* -------------------------------------------------------------------------- */

export const verticalDramaCharactersRouter = router({
  /**
   * List the series' character roster plus the durable reference-asset manifest
   * (approved / pending / stale counts + per-asset links). Read-only.
   */
  listCharacters: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const rows = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        );

      const manifest = await verticalDramaCharacterStockService.getManifest({
        tenantId,
        userId,
        seriesId,
      });

      // W12-A — additive `voiceConfig` field, flag-gated (see
      // `characterRowToDto`'s own doc comment for the byte-identical rationale).
      const voiceChainEnabled = await resolveVerticalDramaVoiceChainFlag(tenantId);
      return {
        characters: rows.map((row: VerticalDramaCharacterRow) =>
          characterRowToDto(row, { includeVoiceConfig: voiceChainEnabled }),
        ),
        manifest,
      };
    }),

  /**
   * Build the browser-safe per-series character-asset manifest (approved /
   * pending / stale reference stock). Read-only.
   */
  getManifest: verticalDramaProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      return verticalDramaCharacterStockService.getManifest({ tenantId, userId, seriesId });
    }),

  /** Create a new character in the series roster (no paid generation). */
  createCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterKey: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(255),
        role: z.string().trim().max(100).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey: input.characterKey,
          name: input.name,
          role: input.role ?? null,
          data: input.data ?? null,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();

      return { character: characterRowToDto(row as VerticalDramaCharacterRow) };
    }),

  /** Update an existing character's editable fields (tenant + user scoped). */
  updateCharacter: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        name: z.string().trim().min(1).max(255).optional(),
        role: z.string().trim().max(100).nullable().optional(),
        data: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.role !== undefined) patch.role = input.role;
      if (input.data !== undefined) patch.data = input.data;

      const [row] = await db
        .update(verticalDramaCharacters)
        .set(patch)
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        )
        .returning();

      // W12-A — additive `voiceConfig` field, flag-gated (see
      // `characterRowToDto`'s own doc comment). `updateCharacter` returns the
      // full up-to-date character, so a caller relying on this response to
      // refresh its cache must still see an existing casting after an
      // unrelated name/role edit — `createCharacter` (a fresh insert, never
      // cast yet) intentionally skips this extra flag lookup.
      const voiceChainEnabled = await resolveVerticalDramaVoiceChainFlag(tenantId);
      return {
        character: characterRowToDto(row as VerticalDramaCharacterRow, { includeVoiceConfig: voiceChainEnabled }),
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* W2 manual CRUD (F5) — variants/twins created directly by the user, not   */
  /* only by the AI variant/twin-planning pipeline                            */
  /* (`planning/vertical-drama-twin-variant-completeness/plan.md` W2)         */
  /* ------------------------------------------------------------------------ */

  /**
   * Manually create a VARIANT of an existing character (same person, a
   * different recurring look — `"outfit"` = same age/face, different
   * clothing; `"age_stage"` = same identity, a different life-stage
   * appearance, loose face reference, NOT locked). Until this mutation, a
   * variant row could ONLY be created by the AI `detectCharacterVariantsNow`/
   * `runImproveScriptJob` pipeline (`reconcileCharacterVariantPlan`) — this
   * is the manual counterpart, using the exact same `characterKey`-
   * generation pattern and `data` shape that pipeline already writes, so a
   * manually-created variant is indistinguishable from an AI-detected one to
   * every downstream consumer (storyboard, render, reconcile).
   *
   * `data.description` is set from `customDescription`, trimmed (falling
   * back to `variantLabel` itself when omitted — `data.description` must
   * never be left empty, since `extractCharacterDescription`'s own contract
   * puts it FIRST in the aggregated prompt string). `"outfit"` variants
   * ALSO set `data.wardrobeRules` from the same text — mirrors
   * `reconcileCharacterVariantPlan`'s own `dataPatch` shape exactly.
   * `"age_stage"` intentionally does NOT lock the face 100% here — that is
   * just a data/fact difference, not a prompt-level lock; the existing
   * skill-first prompt-authoring logic already reads `variantType` to decide
   * locking behavior downstream, so no lock logic belongs in this mutation.
   *
   * `referenceMediaAssetId` (optional): best-effort attaches it as the new
   * variant's `primary_portrait` reference via
   * `bestEffortLinkPrimaryPortrait` (see that helper's doc comment for the
   * "never block the primary mutation" contract).
   */
  createCharacterVariant: verticalDramaProcedure
    .input(
      seriesScope.extend({
        parentCharacterId: z.string().min(1),
        variantLabel: z.string().trim().min(1).max(64),
        variantType: z.enum(["outfit", "age_stage"]),
        customDescription: z.string().trim().max(2000).optional(),
        referenceMediaAssetId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const parentCharacterId = parseId(input.parentCharacterId, "parent character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const parent = await loadOwnedCharacter(tenantId, userId, seriesId, parentCharacterId);

      const usedKeys = await loadSeriesCharacterKeys(tenantId, userId, seriesId);
      const characterKey = generateUniqueCharacterKey(
        `${parent.characterKey}-${slugifyForCharacterKey(input.variantLabel)}`,
        usedKeys,
      );

      const descriptionText = input.customDescription?.trim() || input.variantLabel;
      const dataPatch: Record<string, unknown> = { description: descriptionText };
      if (input.variantType === "outfit") {
        dataPatch.wardrobeRules = [descriptionText];
      }

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey,
          name: parent.name,
          role: parent.role,
          parentCharacterId: parent.id,
          variantLabel: input.variantLabel,
          variantType: input.variantType,
          data: dataPatch,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();
      const character = row as VerticalDramaCharacterRow;

      if (input.referenceMediaAssetId) {
        await bestEffortLinkPrimaryPortrait({
          tenantId,
          userId,
          seriesId,
          characterId: character.id,
          mediaAssetId: parseId(input.referenceMediaAssetId, "reference media asset id"),
          logSource: "verticalDramaCharacters.createCharacterVariant",
        });
      }

      return { character: characterRowToDto(character) };
    }),

  /**
   * Manually create a TWIN of an existing character — a brand-new,
   * INDEPENDENT character row (its own `name`, its own `id` — NOT a variant:
   * `parentCharacterId`/`variantLabel`/`variantType` are all left null) whose
   * face reference should be resolved from `sharesFaceWithCharacterId`. Until
   * this mutation, a twin row could ONLY be created by the AI pipeline
   * (`reconcileCharacterVariantPlan`'s "identical twin" branch) — this is the
   * manual counterpart.
   *
   * `data.description` is set from `customDescription` — the "distinguishing
   * notes" text that keeps the twin visually distinct from its face-source —
   * mirroring `reconcileCharacterVariantPlan`'s own
   * `newCharacter.distinguishing_notes` -> `dataPatch.description` mapping
   * exactly (same field name/shape).
   *
   * `referenceMediaAssetId` best-effort attach: same convention as
   * `createCharacterVariant` above (see that mutation's + `bestEffortLinkPrimaryPortrait`'s
   * doc comments).
   */
  createCharacterTwin: verticalDramaProcedure
    .input(
      seriesScope.extend({
        sharesFaceWithCharacterId: z.string().min(1),
        name: z.string().trim().min(1).max(255),
        role: z.string().trim().max(100).optional(),
        customDescription: z.string().trim().max(2000).optional(),
        referenceMediaAssetId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const sourceCharacterId = parseId(input.sharesFaceWithCharacterId, "source character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const source = await loadOwnedCharacter(tenantId, userId, seriesId, sourceCharacterId);

      const usedKeys = await loadSeriesCharacterKeys(tenantId, userId, seriesId);
      const characterKey = generateUniqueCharacterKey(`${source.characterKey}-twin`, usedKeys);

      const description = input.customDescription?.trim();

      const [row] = await db
        .insert(verticalDramaCharacters)
        .values({
          tenantId,
          userId,
          seriesId,
          characterKey,
          name: input.name,
          role: input.role ?? source.role,
          sharesFaceWithCharacterId: source.id,
          data: description ? { description } : null,
        } as typeof verticalDramaCharacters.$inferInsert)
        .returning();
      const character = row as VerticalDramaCharacterRow;

      if (input.referenceMediaAssetId) {
        await bestEffortLinkPrimaryPortrait({
          tenantId,
          userId,
          seriesId,
          characterId: character.id,
          mediaAssetId: parseId(input.referenceMediaAssetId, "reference media asset id"),
          logSource: "verticalDramaCharacters.createCharacterTwin",
        });
      }

      return { character: characterRowToDto(character) };
    }),

  /**
   * Permanently delete a character row (tenant + user + series scoped).
   * BLOCKS (never cascades) when any other row in the series still points at
   * this one via `parentCharacterId` or `sharesFaceWithCharacterId` —
   * product decision confirmed via a prior AskUserQuestion in this same plan
   * (`planning/vertical-drama-twin-variant-completeness/plan.md`): the user
   * must delete every dependent variant/twin first. This app-level
   * precondition check exists so the caller gets a clear, actionable Thai
   * message INSTEAD OF a raw Postgres FK constraint error — both self-FK
   * columns (`parentCharacterId`/`sharesFaceWithCharacterId`) have no
   * `onDelete` configured on `verticalDramaCharacters` (Postgres default
   * `NO ACTION`), so an unblocked delete attempt would throw a lower-level
   * DB error anyway.
   *
   * The character's own asset links (`vertical_drama_character_assets`) are
   * NOT explicitly deleted here first — that table's `characterId` FK is
   * declared `onDelete: "cascade"` in `drizzle/schema.ts`, so the database
   * removes them automatically; a redundant manual delete here would just be
   * dead code.
   */
  deleteCharacter: verticalDramaProcedure
    .input(seriesScope.extend({ characterId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const dependents = await db
        .select({ id: verticalDramaCharacters.id })
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
            or(
              eq(verticalDramaCharacters.parentCharacterId, characterId),
              eq(verticalDramaCharacters.sharesFaceWithCharacterId, characterId),
            ),
          ),
        )
        .limit(1);
      if (dependents.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "ต้องลบ variant/แฝดที่อ้างอิงตัวละครนี้ให้หมดก่อนจึงจะลบตัวละครนี้ได้",
        });
      }

      await db
        .delete(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        );

      return { success: true };
    }),

  /**
   * Manually trigger the SAME season-wide character variant/twin detection
   * `runImproveScriptJob`'s best-effort final phase already runs
   * automatically after a script-improve pass (see
   * `verticalDramaImproveScript.ts` step (g)) — this is the direct-trigger
   * counterpart, callable on demand instead of only after an improve-script
   * run. Reuses the EXACT same roster-building (`existing*CharacterKey`
   * markers, W3 stable-ID reconcile, `extractCharacterRosterDescription`)
   * and the exact same `generateCharacterVariantPlan` ->
   * `reconcileCharacterVariantPlan` call pair, just run against the series'
   * CURRENT drafted episode content instead of a just-improved one.
   *
   * `verticalDramaCharacterVariantPlanner`/`verticalDramaStoryBible` are
   * loaded via a DYNAMIC `import()` INSIDE this procedure (never a static
   * top-level import) — same "dynamic import, never static" convention this
   * file's `listVoiceCatalog` already documents for `./media`:
   * `verticalDramaCharacterVariantPlanner.ts`'s module graph transitively
   * pulls in `verticalDramaStoryBible.ts` and `verticalDramaImproveScript.ts`
   * (a heavy, DB/skill-registry-touching service pair), which this file's
   * existing minimal-mock test suites (`modelSelection.test.ts`,
   * `extractDescription.test.ts`, `voiceChain.test.ts`) do not mock — a
   * static import would break them the moment this file loads.
   *
   * Credit-gated by `generateCharacterVariantPlan` ITSELF
   * (`hasEnoughCredits`/`deductCredits` live inside that function, exactly
   * as `runImproveScriptJob` already relies on) — this mutation invents no
   * separate credit-charging scheme of its own, matching that established
   * pattern.
   *
   * Throws `PRECONDITION_FAILED` when there is no usable episode content (no
   * drafted episode) or no character roster to plan against — unlike
   * `runImproveScriptJob`'s best-effort silent skip (appropriate there,
   * since it's a bonus final phase of a larger job), a direct user action
   * must tell the caller clearly why nothing happened.
   */
  detectCharacterVariantsNow: verticalDramaProcedure
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

      const [seriesRow] = await db
        .select({
          locale: verticalDramaSeries.locale,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);
      const bible = (seriesRow?.bible as Record<string, unknown> | null) ?? {};
      const lang: StoryScriptLang = seriesRow?.locale === "th" ? "th" : "en";

      const { getActiveBreakdown, readItemShotDrafts, readItemCliffhangerLine } = await import(
        "../services/verticalDramaStoryBible"
      );
      const {
        generateCharacterVariantPlan,
        reconcileCharacterVariantPlan,
        extractCharacterRosterDescription,
        InsufficientCreditsError,
        VdSchemaValidationError,
      } = await import("../services/verticalDramaCharacterVariantPlanner");

      const activeItems = getActiveBreakdown(bible);
      const draftedItems = activeItems.filter((item) => readItemShotDrafts(item) !== null);
      if (draftedItems.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Generate deep story drafts first before detecting character variants/twins",
        });
      }
      const episodes: StoryScriptEpisodeInput[] = draftedItems.map((item) => ({
        episodeNumber: item.episodeNumber,
        workingTitle: item.workingTitle,
        logline: item.logline,
        keyBeats: item.keyBeats,
        shotDrafts: readItemShotDrafts(item),
        cliffhangerLine: readItemCliffhangerLine(item),
      }));

      const characterRows: VerticalDramaCharacterRow[] = await db
        .select()
        .from(verticalDramaCharacters)
        .where(
          and(
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        );
      // Same W3 stable-ID roster-building `runImproveScriptJob` step (g)
      // already does — EVERY row (base/variant/twin alike) is sent back,
      // carrying `existing*CharacterKey` markers so the skill can recognize
      // "this is already known" (see `verticalDramaCharacterVariantPlanner.ts`'s
      // `reconcileCharacterVariantPlan` doc comment for the matching side).
      const characterKeyById = new Map<number, string>(
        characterRows.map((row) => [row.id, row.characterKey]),
      );
      const characterInputs: CharacterVariantPlannerCharacterInput[] = characterRows.map((row) => {
        const rowInput: CharacterVariantPlannerCharacterInput = {
          characterKey: row.characterKey,
          name: row.name,
          role: row.role ?? "",
          description: extractCharacterRosterDescription(
            (row.data as Record<string, unknown> | null) ?? null,
          ),
        };
        if (row.parentCharacterId != null) {
          const parentKey = characterKeyById.get(row.parentCharacterId);
          if (parentKey) rowInput.existingParentCharacterKey = parentKey;
          if (row.variantLabel) rowInput.existingVariantLabel = row.variantLabel;
        }
        if (row.sharesFaceWithCharacterId != null) {
          const sourceKey = characterKeyById.get(row.sharesFaceWithCharacterId);
          if (sourceKey) rowInput.existingSharesFaceWithCharacterKey = sourceKey;
        }
        return rowInput;
      });

      if (characterInputs.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No characters in the roster to detect variants/twins for",
        });
      }

      let planResult: Awaited<ReturnType<typeof generateCharacterVariantPlan>>;
      try {
        planResult = await generateCharacterVariantPlan({
          userId,
          tenantId,
          seriesId,
          lang,
          characters: characterInputs,
          episodes,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character variant detection failed",
        });
      }

      const summary = await reconcileCharacterVariantPlan({ tenantId, userId, seriesId }, planResult.plan);

      return {
        variantsCreated: summary.createdCharacters.filter((c) => c.variantLabel !== null).length,
        variantsUpdated: summary.updatedCharacters.length,
        twinsCreated: summary.createdCharacters.filter((c) => c.variantLabel === null).length,
        createdCharacters: summary.createdCharacters,
        updatedCharacters: summary.updatedCharacters,
      };
    }),

  /**
   * Attach an existing canonical `media_assets` row as a durable character /
   * product reference. The media asset is validated for tenant + user ownership
   * and non-deleted status before insert (cross-tenant/deleted are rejected).
   * The new link starts in `generated`/`imported` — approval is never implicit.
   */
  linkAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1).optional(),
        mediaAssetId: z.string().min(1).optional(),
        assetType: z.string().min(1).max(40).default("character_reference"),
        role: z.string().max(40).optional(),
        source: z.enum(["generated", "imported"]),
        containsHumanFace: z.boolean().optional(),
        checksumSha256: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      let characterId: number | null = null;
      if (input.characterId != null) {
        characterId = parseId(input.characterId, "character id");
        await loadOwnedCharacter(tenantId, userId, seriesId, characterId);
      }

      const mediaAssetId =
        input.mediaAssetId != null ? parseId(input.mediaAssetId, "media asset id") : null;

      try {
        const asset = await verticalDramaCharacterStockService.linkAsset({
          tenantId,
          userId,
          seriesId,
          characterId,
          mediaAssetId,
          assetType: input.assetType,
          role: input.role ?? null,
          source: input.source,
          containsHumanFace: input.containsHumanFace ?? null,
          checksumSha256: input.checksumSha256 ?? null,
          metadata: input.metadata ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Resolve a Library item or an already-hosted URL (Media History result,
   * or a client-uploaded 3x3-cutter tile via `ai.upload`) into a canonical
   * `media_assets` row, so drag-and-drop from those surfaces can call
   * `linkAsset` immediately — no manual "Media asset ID" entry required.
   *
   * Two branches only:
   *  - `"library"`: looks up the `library_items` row scoped to the caller's
   *    own tenant + ownership (NOT_FOUND if missing/not owned — never
   *    discloses another owner's row), derives a mime type from `itemType`,
   *    then registers it via `createAssetFromAttachment` (idempotent —
   *    dedupes by checksum(tenantId+userId), so re-dropping the same item
   *    is safe and returns the same asset id).
   *  - `"url"`: directly registers an already-accessible URL (a Media
   *    History task's `resultUrl`, or the `url` returned by `ai.upload`
   *    after the frontend uploads a cutter tile / data URL itself) via the
   *    SAME `createAssetFromAttachment` call. No server-side re-fetch of
   *    provider task state — the frontend already has the URL.
   *
   * This does real storage-adjacent DB writes, so it shares the same
   * `mediaGenerationLimiter` per-user cap this router already uses for its
   * paid generation mutations.
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
            // for `createAssetFromAttachment` below but fails a strict absolute-URL
            // check. Same fix as the gallery's URL validation (see project memory).
            url: z.string().min(1),
            mimeType: z.string().min(1),
            fileName: z.string().optional(),
          }),
        ]),
      ),
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
              eq(libraryItems.ownerUserId, userId),
            ),
          )
          .limit(1);
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Library item not found" });
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
            message: `Library item type "${item.itemType}" is not importable as a character reference`,
          });
        }

        // `createAssetFromAttachment`'s context type requires
        // conversationId/messageId/projectId (chat-attachment-shaped), but
        // those columns are nullable in `media_assets` and irrelevant here —
        // this mirrors the `as any` cast `chat.ts` itself uses at its own
        // call site rather than modifying the (out-of-scope) service file.
        const { assetId } = await createAssetFromAttachment(
          { type: "image", url: item.sourceUrl, mimeType } as any,
          { tenantId, userId } as any,
        );
        return { mediaAssetId: String(assetId) };
      }

      // source === "url"
      const { assetId } = await createAssetFromAttachment(
        { type: "image", url: input.url, mimeType: input.mimeType } as any,
        { tenantId, userId } as any,
      );
      return { mediaAssetId: String(assetId) };
    }),

  /**
   * Approve a pending reference asset (explicit review gate — the state machine
   * forbids skipping review). Thin wrapper over `transitionAsset(to: "approved")`.
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
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: "approved",
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Apply an arbitrary lifecycle transition to a reference asset (draft ->
   * generated/imported -> approved / rejected / stale). Illegal transitions
   * surface as PRECONDITION_FAILED. A `rejectionReason` is recorded when
   * transitioning to `rejected`.
   */
  transitionAsset: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkId: z.string().min(1),
        to: assetStateEnum,
        rejectionReason: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const assetLinkId = parseId(input.assetLinkId, "asset link id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      try {
        const asset = await verticalDramaCharacterStockService.transition({
          tenantId,
          userId,
          seriesId,
          assetLinkId,
          to: input.to as (typeof VERTICAL_DRAMA_CHARACTER_ASSET_STATES)[number],
          rejectionReason: input.rejectionReason ?? null,
        });
        return { asset };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Mark a set of approved references stale (e.g. after an identity change).
   * Returns the number of assets actually transitioned to `stale`.
   */
  markStale: verticalDramaProcedure
    .input(
      seriesScope.extend({
        assetLinkIds: z.array(z.string().min(1)).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const ids = input.assetLinkIds.map((id) => parseId(id, "asset link id"));
      const staleCount = await verticalDramaCharacterStockService.markStale(
        { tenantId, userId, seriesId },
        ids,
      );
      return { staleCount };
    }),

  /**
   * Permanently remove a reference asset from a character's stock (product
   * decision 2026-07-05: replaces the approve/reject/stale QC workflow for
   * character references with a plain add/delete model). Only unlinks the
   * `verticalDramaCharacterAssets` row — the underlying media asset is left
   * intact in Media History/Library.
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
        await verticalDramaCharacterStockService.deleteAsset(
          { tenantId, userId, seriesId },
          assetLinkId,
        );
        return { deleted: true };
      } catch (err) {
        mapStockError(err);
      }
    }),

  /**
   * Preview-only leg of the character portrait/sheet flow: runs ONLY the
   * `generateCharacterVisualPrompts` LLM call (the same step-1 credit-gated
   * call `generateCharacterImage`/`generateCharacterSheet` perform
   * internally) and returns the resulting prompt text WITHOUT rendering an
   * image. This lets the frontend show the actual prompt for user approval
   * before any image-render credit is spent. Charges exactly the one
   * prompt-generation credit (via `generateCharacterVisualPrompts` itself) —
   * the caller then passes the approved text back as `approvedPrompt` /
   * `approvedNegativePrompt` on `generateCharacterImage` or
   * `generateCharacterSheet` so that LLM leg is never re-run (and never
   * double-charged) for the same spend. This preview only ever runs the
   * plain-turnaround leg (no `requestedSheetType`) — it does not (and, per
   * the plan, need not) preview any of the 14 Character Design Bible sheet
   * formats.
   */
  previewCharacterPrompt: verticalDramaProcedure
    .input(seriesScope.extend({ characterId: z.string().min(1) }))
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
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );
      const presetVisualIdentity = await resolveCharacterPresetVisualIdentity(
        tenantId,
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );
      const faceSourceReference = await resolveFaceSourceReferenceForCharacter(
        { tenantId, userId, seriesId },
        character,
      );

      let promptResult;
      try {
        promptResult = await generateCharacterVisualPrompts({
          userId,
          tenantId,
          seriesId,
          characterId,
          characterKey: character.characterKey,
          name: character.name,
          role: character.role,
          description,
          storyContext: seriesRow
            ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
            : undefined,
          targetAudienceRegion,
          presetVisualIdentity,
          faceSourceReference,
        });
      } catch (err) {
        if (err instanceof InsufficientCreditsError) {
          throw new TRPCError({ code: "FORBIDDEN", message: err.message });
        }
        if (err instanceof VdSchemaValidationError) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character visual prompt generation failed",
        });
      }

      return {
        portraitPrompt: promptResult.portraitPrompt,
        turnaroundPrompt: promptResult.turnaroundPrompt,
        negativePrompt: promptResult.negativePrompt,
        model: promptResult.model,
      };
    }),

  /**
   * Generate a real character reference portrait: (1) run the installed
   * `vertical-drama-character-visual-bible` skill as a direct, credit-gated
   * LLM call to produce a portrait prompt + negative prompt (see
   * `verticalDramaCharacterImageGeneration.ts`), then (2) render that prompt
   * into an actual image via `mediaGenerationService.generateImage` (the
   * SYNCHRONOUS single-prompt-in/single-image-out method — the same one
   * `media.ts`'s `generateImage` mutation calls; chosen over
   * `generateImageAsync` because this is a plain text-prompt portrait with
   * no user-uploaded reference image and no need for job polling). The
   * rendered image is registered as a canonical `media_assets` row (never a
   * bare provider URL, matching this table's own doc comment) and linked
   * into the durable character-asset stock via the existing
   * `verticalDramaCharacterStockService.linkAsset` path — `approved: false`
   * / `qcStatus: "pending"` — so it enters the SAME human-approval queue as
   * imported assets; nothing here bypasses review.
   *
   * Two SEPARATE credit charges occur (never double-counted for the same
   * spend): the prompt-generation LLM call is credited inside
   * `generateCharacterVisualPrompts` itself; the image render is credited
   * here, mirroring `media.ts`'s own check-credits -> call -> deduct-credits
   * convention (`mediaGenerationService.generateImage` does not deduct
   * credits itself — the caller always does, using the backend-reported
   * `creditsUsed` when available).
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): when the caller
   * already ran `previewCharacterPrompt` and had the user approve the exact
   * text, pass it here to skip the internal `generateCharacterVisualPrompts`
   * call entirely — the prompt-generation credit was already charged once,
   * at preview time, and must not be charged again here. When absent,
   * behavior is unchanged from before this option existed.
   */
  generateCharacterImage: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
        // Caller-selected image model (character tab's own model picker) —
        // validated + must be enabled; falls back to `DEFAULT_MODELS.image`
        // when absent. See `resolveCharacterImageModelId`.
        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
        // Required only when the selected model is MCP-transport (e.g.
        // `higgsfield/*`, `magnific-mcp/*`) — see
        // `resolveVdCharacterMcpTransportMetadata`.
        mcpConnectionId: z.string().max(64).optional(),
        // Optional explicit reference-image-picker override (Phase D1,
        // `planning/vertical-drama-reference-picker-outfit-lock/plan.md`) —
        // when present, pins the identity-lock reference image to this exact
        // character-asset link instead of auto-resolving the newest approved
        // `primary_portrait` via `getPrimaryPortraitUrl`. Absent: behavior is
        // byte-identical to today's auto-resolution.
        referenceAssetLinkId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting — reuses the shared `mediaGenerationLimiter` (this
      // mutation performs a paid LLM prompt-generation call PLUS a paid
      // image render, so it belongs under the same per-user cap as
      // `media.ts`'s own generation mutations). Checked first, before any
      // DB reads/writes or paid calls.
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
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );
      const presetVisualIdentity = await resolveCharacterPresetVisualIdentity(
        tenantId,
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );

      // 0. Identity-lock reference — resolve BEFORE prompt generation (Phase
      //    D2, `planning/vertical-drama-reference-picker-outfit-lock/plan.md`
      //    section B) so its presence can be passed into
      //    `generateCharacterVisualPrompts` as the `hasOwnReferenceImage`
      //    fact — the skill (not this router) is then the sole author of the
      //    identity-lock instruction language woven into the prompt,
      //    including the outfit/clothing/accessories/shoes lock this fixes.
      //    Attaches the character's existing approved portrait (if any) as a
      //    `referenceImageUrls` input so the render is conditioned on the
      //    actual likeness. Absent on a character's very first portrait AND
      //    it has no parent/twin-source portrait to borrow either (nothing
      //    to reference yet); present on every regeneration afterward, and
      //    defaults to the parent/twin-source's portrait on a brand-new
      //    variant/twin's first render (Phase F1,
      //    `planning/vertical-drama-twin-variant-completeness/plan.md` W1).
      const referencePortraitUrl = await resolveReferencePortraitUrl(
        { tenantId, userId, seriesId },
        characterId,
        input.referenceAssetLinkId,
        character.parentCharacterId ?? character.sharesFaceWithCharacterId,
      );

      // 1. Prompt generation — credit-gated + deducted internally. Skipped
      //    entirely when the caller already ran `previewCharacterPrompt` and
      //    supplies the user-approved text via `approvedPrompt` (that credit
      //    was already charged once, at preview time).
      let portraitPrompt: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;

      if (input.approvedPrompt) {
        portraitPrompt = input.approvedPrompt;
        negativePrompt = input.approvedNegativePrompt;
      } else {
        const faceSourceReference = await resolveFaceSourceReferenceForCharacter(
          { tenantId, userId, seriesId },
          character,
        );
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: character.role,
            description,
            storyContext: seriesRow
              ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
              : undefined,
            targetAudienceRegion,
            presetVisualIdentity,
            faceSourceReference,
            hasOwnReferenceImage: Boolean(referencePortraitUrl),
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Character visual prompt generation failed",
          });
        }
        portraitPrompt = promptResult.portraitPrompt;
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      // 2. Pre-flight credit check for the image render — a SEPARATE charge
      //    from the prompt-generation LLM call above. Prices + generates
      //    against the CALLER-SELECTED model (character tab's own picker),
      //    falling back to `DEFAULT_MODELS.image` when none was selected —
      //    previously this always priced + generated with
      //    `DEFAULT_MODELS.image`, silently ignoring the selected model.
      const resolvedImageModelId = await resolveCharacterImageModelId(input.selectedImageModelId);
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const imageCreditCost = calculateCreditCost(pricingModel, { numImages: 1 });

      // Zero-cost models (e.g. Higgsfield/Magnific MCP — billed via MCP
      // subscription, not credits) skip the reserve/refund cycle entirely —
      // same convention as `verticalDramaEpisodes.ts`'s
      // `generateStartFrameImage` (`deductCredits`/`refundCredits` throw on
      // amount <= 0 by design; see creditService.ts).
      const shouldChargeImageCredits = imageCreditCost > 0;
      if (shouldChargeImageCredits) {
        const hasImageCredits = await hasEnoughCredits(userId, imageCreditCost);
        if (!hasImageCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for portrait image render. Required: ${imageCreditCost}`,
          });
        }
      }

      // MCP-transport models (e.g. higgsfield/*, magnific-mcp/*) must be
      // dispatched through the service's MCP branch, not the default
      // gateway_api/Python-backend path — see
      // `resolveVdCharacterMcpTransportMetadata`.
      const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
      });

      // 3. Submit — async (matches `media.generateImageAsync` + `media.getTask`
      //    convention; shows in Media History; avoids a long-blocking
      //    mutation). Credits are RESERVED now; `media.getTask` reconciles
      //    against actual usage once the task completes/fails, same as
      //    `media.ts`'s own async mutations. The caller polls
      //    `media.getTask({taskId})`, then finalizes by calling
      //    `resolveMediaAssetForImport` + `linkAsset` (both already-built,
      //    already-tested procedures) — no new "finalize" endpoint needed.
      if (shouldChargeImageCredits) {
        await deductCredits({
          userId,
          tenantId,
          amount: imageCreditCost,
          description: `Vertical Drama — generate character portrait (character #${characterId}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_character_portrait",
            seriesId,
            characterId,
            type: "reservation",
            creditCost: imageCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: portraitPrompt,
            negativePrompt,
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
            // Series provenance tag (project-scoped media panel filter) —
            // persisted verbatim into the media task's `parameters.extra_params`
            // (see PERSISTED_INTERNAL_EXTRA_PARAM_KEYS in mediaGenerationService.ts);
            // read back by `media.listTasks`'s optional `seriesId` filter.
            extraParams: { __vd_series_id: String(seriesId), __vd_character_id: String(characterId) },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterImage",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        if (shouldChargeImageCredits) {
          await refundCredits({
            userId,
            amount: imageCreditCost,
            description: `Refund: character portrait render failed to submit (character #${characterId})`,
            sourceType: "media_image",
            metadata: { feature: "vertical_drama_character_portrait", seriesId, characterId },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character portrait image generation failed to submit",
        });
      }

      return {
        taskId: task.id,
        portraitPrompt,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
      };
    }),

  /**
   * Generate a Character Design Bible sheet — ONE reference image for
   * whichever `sheetType` the caller requests (vertical-drama-character-
   * sheet-consolidation plan, Phase B). Consolidates what used to be two
   * separate mutations (`generateCharacterTurnaround` + the original
   * `generateCharacterSheet`) into one, resolving the format via
   * `resolveCharacterSheetType`:
   *  - `"auto"` (the default) resolves to `"turnaround"` — a 360/multi-angle
   *    composition read straight off `promptResult.turnaroundPrompt` (the
   *    always-required `turnaround_prompt` skill field), preserving today's
   *    cheaper/older default behavior.
   *  - `"full_combined"` and the 11 new Character Design Bible formats
   *    (`cover`, `character_profile`, `face_detail`, `expression_12`,
   *    `hair_reference`, `costume_breakdown`, `material_fabric`,
   *    `color_palette`, `pose_library`, `body_proportion`, `ai_prompt_lock`)
   *    all render `promptResult.sheetPrompt` — a genuinely skill-authored
   *    prompt for the requested format (see `skills/vertical-drama-character-
   *    visual-bible/skill.md`'s "Character Design Bible sheet types"
   *    section). This is the exact fix for the pre-existing skill-first
   *    architecture violation this endpoint used to contain: no prompt text
   *    is authored/concatenated in this file anymore — every character-
   *    facing string comes from the skill's own response.
   *
   * `approvedPrompt` / `approvedNegativePrompt` (optional): same skip-
   * regeneration contract as `generateCharacterImage` — when present, the
   * user-approved text (from `previewCharacterPrompt`) is used directly and
   * the internal `generateCharacterVisualPrompts` call (already charged once
   * at preview time) is not repeated.
   *
   * Returns `assetRole`/`assetMetadata` (via `resolveCharacterSheetAssetTag`)
   * so the caller can tag the eventual `linkAsset` call correctly once the
   * async render task completes — `"turnaround"` -> the pre-existing
   * `"character_sheet_turnaround"` role, `"full_combined"` -> the pre-
   * existing `"character_sheet_full"` role, every new format ->
   * `"character_design_bible"` (deliberately OUTSIDE
   * `CHARACTER_SHEET_ROLES` in `verticalDramaCharacterStock.ts` — several of
   * the new formats carry no face at all, so they must never be picked as a
   * second identity-lock reference for storyboard/shot generation).
   *
   * Async submit + poll, same convention as every other real generation in
   * this codebase (shows in Media History, correct credit deduction).
   */
  generateCharacterSheet: verticalDramaProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        approvedPrompt: z.string().min(1).optional(),
        approvedNegativePrompt: z.string().optional(),
        /** Which Character Design Bible sheet format to render — `"auto"`
         *  (default) resolves to `"turnaround"`. See
         *  `resolveCharacterSheetType`/`CHARACTER_SHEET_TYPE_VALUES`. */
        sheetType: z.enum(CHARACTER_SHEET_TYPE_VALUES).optional().default("auto"),
        /** Language of the STATS TEXT/labels on the sheet — the character's
         *  own name is never translated, always rendered exactly as given.
         *  NOTE: the skill does not yet accept a language input (see
         *  `skills/vertical-drama-character-visual-bible/schemas/
         *  input.schema.json`) — kept on the input contract for API-surface
         *  stability, currently unused by the handler pending skill support;
         *  never wired into a code-authored prompt string (that would be the
         *  exact violation this endpoint used to have). */
        sheetLanguage: z.enum(["en", "th"]).optional().default("en"),
        // Caller-selected image model — see `generateCharacterImage`'s same field.
        selectedImageModelId: z.string().trim().min(1).max(128).optional(),
        mcpConnectionId: z.string().max(64).optional(),
        // Optional explicit reference-image-picker override — see
        // `generateCharacterImage`'s identical field for the full contract.
        referenceAssetLinkId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const resolvedSheetType = resolveCharacterSheetType(input.sheetType);

      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const [seriesRow] = await db
        .select({
          title: verticalDramaSeries.title,
          genre: verticalDramaSeries.genre,
          tone: verticalDramaSeries.tone,
          bible: verticalDramaSeries.bible,
        })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, seriesId), eq(verticalDramaSeries.tenantId, tenantId)))
        .limit(1);
      const targetAudienceRegion = readTargetAudienceRegionFromBible(
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );
      const presetVisualIdentity = await resolveCharacterPresetVisualIdentity(
        tenantId,
        (seriesRow?.bible as Record<string, unknown> | null) ?? null,
      );

      const description = extractCharacterDescription(
        (character.data as Record<string, unknown> | null) ?? null,
      );

      // Identity-lock reference — resolved BEFORE prompt generation (Phase
      // D2, `planning/vertical-drama-reference-picker-outfit-lock/plan.md`
      // section B) so its presence can be passed into
      // `generateCharacterVisualPrompts` as the `hasOwnReferenceImage` fact —
      // the skill (not this router) is then the sole author of the identity-
      // lock instruction language woven into the prompt, including the
      // outfit/clothing/accessories/shoes lock this fixes. Attaches the
      // character's existing approved portrait (if any) as a
      // `referenceImageUrls` input so the render is conditioned on the
      // actual likeness — same established pattern `generateCharacterImage`
      // uses, including the parent/twin-source portrait fallback for a
      // brand-new variant/twin's first render (Phase F1,
      // `planning/vertical-drama-twin-variant-completeness/plan.md` W1).
      const referencePortraitUrl = await resolveReferencePortraitUrl(
        { tenantId, userId, seriesId },
        characterId,
        input.referenceAssetLinkId,
        character.parentCharacterId ?? character.sharesFaceWithCharacterId,
      );

      // Prompt generation — credit-gated + deducted internally. Skipped
      // entirely when the caller already ran `previewCharacterPrompt` and
      // supplies the user-approved text via `approvedPrompt` (that credit was
      // already charged once, at preview time) — same skip-regeneration
      // contract `generateCharacterImage` uses.
      let sheetPromptText: string;
      let negativePrompt: string | undefined;
      let promptModel: string | null = null;
      let visualBibleSummary: Record<string, unknown> | null = null;
      let promptCreditsUsed = 0;

      if (input.approvedPrompt) {
        sheetPromptText = input.approvedPrompt;
        negativePrompt = input.approvedNegativePrompt;
      } else {
        const faceSourceReference = await resolveFaceSourceReferenceForCharacter(
          { tenantId, userId, seriesId },
          character,
        );
        let promptResult;
        try {
          promptResult = await generateCharacterVisualPrompts({
            userId,
            tenantId,
            seriesId,
            characterId,
            characterKey: character.characterKey,
            name: character.name,
            role: character.role,
            description,
            storyContext: seriesRow
              ? { title: seriesRow.title, genre: seriesRow.genre ?? undefined, tone: seriesRow.tone ?? undefined }
              : undefined,
            targetAudienceRegion,
            presetVisualIdentity,
            faceSourceReference,
            hasOwnReferenceImage: Boolean(referencePortraitUrl),
            // Only sent for a NON-turnaround format — plain "turnaround" is
            // already fully covered by the always-required
            // `turnaround_prompt` field, so no extra skill work is requested
            // for it (see skill.md's "Character Design Bible sheet types").
            requestedSheetType: resolvedSheetType === "turnaround" ? undefined : resolvedSheetType,
          });
        } catch (err) {
          if (err instanceof InsufficientCreditsError) {
            throw new TRPCError({ code: "FORBIDDEN", message: err.message });
          }
          if (err instanceof VdSchemaValidationError) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err.message });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Character visual prompt generation failed",
          });
        }

        if (resolvedSheetType === "turnaround") {
          sheetPromptText = promptResult.turnaroundPrompt;
        } else {
          // `sheet_prompt` is schema-optional (legitimately absent when no
          // sheet type was requested) but MUST be present here since a
          // non-turnaround type was explicitly requested — surface a missing
          // value as an error (matching this file's existing
          // `VdSchemaValidationError` handling for other required-field
          // violations), never a code-authored fallback string.
          if (!promptResult.sheetPrompt) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Character visual bible skill did not return a sheet_prompt for requested sheet type "${resolvedSheetType}".`,
            });
          }
          sheetPromptText = promptResult.sheetPrompt;
        }
        negativePrompt = promptResult.negativePrompt;
        promptModel = promptResult.model;
        visualBibleSummary = promptResult.raw.visual_bible_summary;
        promptCreditsUsed = promptResult.creditsUsed;
      }

      // Pricing: the plain turnaround stays priced like a single image (same
      // as the old, now-merged `generateCharacterTurnaround`); every other
      // format (the pre-existing `full_combined` plus the 11 new Character
      // Design Bible formats) is priced like the old `generateCharacterSheet`
      // — a single, more complex multi-panel image call. Prices + generates
      // against the CALLER-SELECTED model — see generateCharacterImage's same
      // comment for rationale.
      const resolvedImageModelId = await resolveCharacterImageModelId(input.selectedImageModelId);
      const [pricingRow] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, resolvedImageModelId))
        .limit(1);
      const pricingModel = pricingRow ?? { creditCost: 10, configJson: null };
      const sheetCreditCost = calculateCreditCost(pricingModel, {
        numImages: resolvedSheetType === "turnaround" ? 1 : 2,
      });
      const shouldChargeSheetCredits = sheetCreditCost > 0;
      if (shouldChargeSheetCredits) {
        const hasCredits = await hasEnoughCredits(userId, sheetCreditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for character sheet render. Required: ${sheetCreditCost}`,
          });
        }
      }

      const transportMetadata = await resolveVdCharacterMcpTransportMetadata({
        tenantId,
        actorUserId: userId,
        assetType: "image",
        modelId: resolvedImageModelId,
        configJson: pricingModel.configJson,
        mcpConnectionId: input.mcpConnectionId,
      });

      if (shouldChargeSheetCredits) {
        await deductCredits({
          userId,
          tenantId,
          amount: sheetCreditCost,
          description: `Vertical Drama — generate character sheet (${resolvedSheetType}) (character #${characterId}, reserved)`,
          sourceType: "media_image",
          metadata: {
            feature: "vertical_drama_character_sheet",
            seriesId,
            characterId,
            sheetType: resolvedSheetType,
            type: "reservation",
            creditCost: sheetCreditCost,
            modelId: resolvedImageModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateImageAsync(
          {
            prompt: sheetPromptText,
            negativePrompt,
            model: resolvedImageModelId,
            numImages: 1,
            aspectRatio: "9:16",
            ...(referencePortraitUrl ? { referenceImageUrls: [referencePortraitUrl] } : {}),
            // Series provenance tag — see generateCharacterImage's comment.
            extraParams: { __vd_series_id: String(seriesId), __vd_character_id: String(characterId) },
            publicUrl: ctx.publicUrl ?? undefined,
            ...(transportMetadata ? { transportMetadata } : {}),
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.generateCharacterSheet",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        if (shouldChargeSheetCredits) {
          await refundCredits({
            userId,
            amount: sheetCreditCost,
            description: `Refund: character sheet render failed to submit (character #${characterId})`,
            sourceType: "media_image",
            metadata: { feature: "vertical_drama_character_sheet", seriesId, characterId, sheetType: resolvedSheetType },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character sheet image generation failed to submit",
        });
      }

      const assetTag = resolveCharacterSheetAssetTag(resolvedSheetType);

      return {
        taskId: task.id,
        sheetType: resolvedSheetType,
        sheetPrompt: sheetPromptText,
        negativePrompt,
        promptModel,
        visualBibleSummary,
        creditsUsed: { promptGeneration: promptCreditsUsed },
        assetRole: assetTag.role,
        assetMetadata: assetTag.metadata,
      };
    }),

  /* ------------------------------------------------------------------------ */
  /* W12-A voice chain — per-character voice casting                          */
  /* ------------------------------------------------------------------------ */

  /**
   * Lock (or clear, `voiceConfig: null`) a character's voice casting. No
   * paid generation — a plain metadata write, mirroring `updateCharacter`'s
   * ownership-scoped read-modify-write convention. `lockedAt`/`lockedByUserId`
   * are ALWAYS server-stamped from request context, never taken from client
   * input (see `verticalDramaCharacterVoiceConfigInputSchema`, which omits
   * both fields from what the client can even send).
   */
  setCharacterVoiceConfig: verticalDramaVoiceChainProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        voiceConfig: verticalDramaCharacterVoiceConfigInputSchema.nullable(),
        idempotencyKey: z.string().trim().min(1).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      const nextVoiceConfig: VerticalDramaCharacterVoiceConfig | null = input.voiceConfig
        ? { ...input.voiceConfig, lockedAt: new Date().toISOString(), lockedByUserId: userId }
        : null;

      const [row] = await db
        .update(verticalDramaCharacters)
        .set({ voiceConfig: nextVoiceConfig, updatedAt: new Date() })
        .where(
          and(
            eq(verticalDramaCharacters.id, characterId),
            eq(verticalDramaCharacters.tenantId, tenantId),
            eq(verticalDramaCharacters.userId, userId),
            eq(verticalDramaCharacters.seriesId, seriesId),
          ),
        )
        .returning();

      await recordVoiceChainAuditEvent({
        eventType: "vertical_drama_voice_cast",
        endpoint: "setCharacterVoiceConfig",
        userId,
        seriesId,
        characterId,
        metadata: {
          cleared: nextVoiceConfig === null,
          voiceModelId: nextVoiceConfig?.voiceModelId ?? null,
          voiceId: nextVoiceConfig?.voiceId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      return {
        character: characterRowToDto(row as VerticalDramaCharacterRow, { includeVoiceConfig: true }),
      };
    }),

  /**
   * Flattened voice catalog for the series' voice-casting picker. Reuses the
   * EXACT machinery the series-trailer voice picker uses — the `mediaModels`
   * table (`modelType: "audio"`, enabled only) for the model list, then
   * `media.listModelFieldOptions` (via a real in-process tRPC caller into the
   * already-exported `mediaRouter` — never a duplicated network-fetch/caching
   * implementation) for each model's dynamic-or-static voice options, exactly
   * as `VerticalDramaSeriesTrailerPanel.tsx`'s `voiceOptionsQuery` does
   * client-side. Falls back to the model's own flat `voices` column when
   * neither a voice field nor dynamic options are found (the SAME final
   * fallback tier that panel's `modelVoicesColumnOptions` uses — e.g. Gemini
   * TTS models that expose no dynamic voice field at all). Read-only.
   */
  listVoiceCatalog: verticalDramaVoiceChainProcedure
    .input(seriesScope)
    .query(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx.tenantId);
      const userId = ctx.user.id;
      const seriesId = parseId(input.seriesId, "series id");
      await loadOwnedSeries(tenantId, userId, seriesId);

      const models = await db
        .select({
          modelId: mediaModels.modelId,
          voices: mediaModels.voices,
          configJson: mediaModels.configJson,
        })
        .from(mediaModels)
        .where(and(eq(mediaModels.modelType, "audio"), eq(mediaModels.isEnabled, true)));

      const { mediaRouter } = await import("./media");
      const caller = mediaRouter.createCaller(ctx);
      const voices: VerticalDramaVoiceCatalogEntry[] = [];

      for (const model of models) {
        const fieldKey = resolveVoiceCatalogFieldKey(model.configJson as Record<string, unknown> | null);
        let options: Array<{ value: string; label: string; previewUrl?: string }> = [];
        if (fieldKey) {
          try {
            const result = await caller.listModelFieldOptions({
              modelId: model.modelId,
              fieldKey,
              limit: 500,
            });
            options = result.options;
          } catch (error) {
            // One model's dynamic voice-option fetch (e.g. a transient
            // network error reaching a provider) must never break the whole
            // catalog — fall through to the static `voices` column below.
            debugError("verticalDramaCharacters.listVoiceCatalog", "Voice option fetch failed", error);
          }
        }
        if (options.length === 0 && Array.isArray(model.voices) && model.voices.length > 0) {
          options = (model.voices as string[]).map((voice) => ({ value: voice, label: voice }));
        }

        for (const option of options) {
          const { language, ageTag } = parseVoiceCatalogLabelMetadata(option.label);
          voices.push({
            voiceModelId: model.modelId,
            voiceId: option.value,
            label: option.label,
            ...(language ? { language } : {}),
            ...(ageTag ? { ageTag } : {}),
            ...(option.previewUrl ? { previewUrl: option.previewUrl } : {}),
          });
        }
      }

      return { voices };
    }),

  /**
   * Paid, credit-gated preview of a candidate (or already-cast) voice —
   * synthesizes a short sample line so the caller can hear a voice before
   * locking it in. Submitted via the SAME async submit -> `media.getTask`
   * poll -> credit reserve/reconcile machinery every other paid generation
   * mutation in this router uses (`mediaGenerationService.generateAudioAsync`
   * directly — never `media.ts`'s own procedures, same convention as
   * `generateCharacterImage`/`generateCharacterSheet` above). Never persists
   * anything — `voiceConfig`
   * here is a candidate to audition, not a cast (`setCharacterVoiceConfig` is
   * the separate, explicit lock action).
   */
  previewCharacterVoice: verticalDramaVoiceChainProcedure
    .input(
      seriesScope.extend({
        characterId: z.string().min(1),
        voiceConfig: verticalDramaCharacterVoiceConfigInputSchema.optional(),
        sampleText: z.string().trim().max(120).optional(),
      }),
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
      const characterId = parseId(input.characterId, "character id");
      await loadOwnedSeries(tenantId, userId, seriesId);
      const character = await loadOwnedCharacter(tenantId, userId, seriesId, characterId);

      // Caller-supplied candidate voiceConfig takes priority (auditioning a
      // NOT-YET-cast voice); falls back to the character's already-locked
      // casting so "preview the current cast voice" needs no extra input.
      const candidateVoiceConfig: Partial<VerticalDramaCharacterVoiceConfig> | undefined =
        input.voiceConfig ??
        ((character.voiceConfig as VerticalDramaCharacterVoiceConfig | null) ?? undefined);

      if (!candidateVoiceConfig?.voiceModelId || !candidateVoiceConfig?.voiceId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No voice configuration to preview — cast this character first, or supply a voiceConfig to audition.",
        });
      }

      const sampleText = input.sampleText
        ? sanitizeSpeakableLineForDelivery(input.sampleText).slice(0, 120)
        : buildFixedThaiVoicePreviewSample(character.name);

      const pricingModel = await resolveAudioModelPricing(candidateVoiceConfig.voiceModelId);
      const creditCost = calculateCreditCost(pricingModel, { text: sampleText });

      // Zero-cost models skip reserve/refund entirely — same convention as
      // `generateCharacterImage`'s matching comment.
      const shouldChargeCredits = creditCost > 0;
      if (shouldChargeCredits) {
        const hasCredits = await hasEnoughCredits(userId, creditCost);
        if (!hasCredits) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Insufficient credits for voice preview. Required: ${creditCost}`,
          });
        }
        await deductCredits({
          userId,
          tenantId,
          amount: creditCost,
          description: `Vertical Drama — character voice preview (character #${characterId}, reserved)`,
          sourceType: "media_audio",
          metadata: {
            feature: "vertical_drama_character_voice_preview",
            seriesId,
            characterId,
            type: "reservation",
            creditCost,
            modelId: candidateVoiceConfig.voiceModelId,
          },
        });
      }

      const userToken = getCharacterPortraitUserToken(ctx);
      let task;
      try {
        task = await mediaGenerationService.generateAudioAsync(
          {
            text: sampleText,
            model: candidateVoiceConfig.voiceModelId,
            voice: candidateVoiceConfig.voiceId,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId,
              traceId: crypto.randomUUID(),
              source: "trpc.verticalDramaCharacters.previewCharacterVoice",
              stage: "submission",
            },
          },
          userToken,
        );
      } catch (err) {
        if (shouldChargeCredits) {
          await refundCredits({
            userId,
            amount: creditCost,
            description: `Refund: character voice preview failed to submit (character #${characterId})`,
            sourceType: "media_audio",
            metadata: { feature: "vertical_drama_character_voice_preview", seriesId, characterId },
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Character voice preview failed to submit",
        });
      }

      await recordVoiceChainAuditEvent({
        eventType: "vertical_drama_voice_preview",
        endpoint: "previewCharacterVoice",
        userId,
        seriesId,
        characterId,
        creditsCharged: creditCost,
        metadata: {
          voiceModelId: candidateVoiceConfig.voiceModelId,
          voiceId: candidateVoiceConfig.voiceId,
          sampleTextLength: sampleText.length,
          taskId: task.id,
        },
      });

      return { taskId: task.id, creditCost };
    }),
});

export type VerticalDramaCharactersRouter = typeof verticalDramaCharactersRouter;
