/**
 * Vertical Drama Series — Text Overlay Suite DB-touching auto-text/derivation
 * resolution (task #34, `planning/vertical-drama-end-card-teaser/plan.md` v2).
 *
 * A DEDICATED, small service file (not folded into
 * `verticalDramaEpisodeVideoAssembly.ts`, which already has its own
 * DB-mock-sensitive test suite — see that file's `resolveEpisodeTextOverlayRunInputs`
 * doc comment for the pure/DB-free half of this feature) so BOTH
 * `verticalDramaEpisodes.ts` (single-episode `assembleEpisodeVideo`/
 * `getEpisodeDetail`) and `verticalDramaSeries.ts` (season-batch
 * `assembleSeasonVideos`) can resolve the SAME auto-derived text/cards
 * without duplicating the DB-fetch logic (neither router imports the OTHER
 * router — see both routers' own "narrow `vi.mock` sibling test" doc
 * comments — but both may freely import a shared SERVICE like this one).
 *
 * `verticalDramaStoryBible.ts` is imported LAZILY (dynamic `import()`) inside
 * `resolveVdEndCardAndOpenerAutoTexts`, mirroring
 * `verticalDramaEpisodes.ts`'s own `resolveEpisodeDraftAvailable` convention:
 * that module transitively imports `enabledLlmModels.ts` ->
 * `../routers/llmProviders.ts`'s `adminProcedure`, which router test suites'
 * `../../_core/trpc` mocks never provide — a static import here would risk
 * breaking any test file that imports THIS module. `verticalDramaSeriesMemory.ts`
 * has no such transitive dependency (already statically imported by both
 * routers today), so it is imported normally.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaCharacters, verticalDramaSeries } from "../../drizzle/schema";
import { verticalDramaSeriesMemoryService } from "./verticalDramaSeriesMemory";
import type { VerticalDramaStartFramePlan } from "@shared/verticalDramaSeries";
import type { VdDialogueTimelineClip } from "@shared/verticalDramaSeries/dialogueAudioTimeline";
import {
  defaultCardStyleVariantForKind,
  deriveCharacterIntroCards,
  deriveEpisodeIndicatorLabel,
  deriveTitleBumperLines,
  listEnabledWatermarkSlots,
  parseSeriesWatermarkConfig,
  resolveEndCardText,
  resolveOpenerRecapText,
  resolveEpisodeIndicatorCornerAutoAvoid,
  type VdCharacterIntroSourceFrame,
  type VdDerivedCharacterIntroCard,
  type VdEndCardTextSource,
  type VdOpenerRecapTextSource,
  type VdSeriesWatermarkConfig,
  type VdTextOverlayPlan,
  type VdWatermarkPosition,
} from "@shared/verticalDramaSeries/textOverlay";
// The render-engine service (`verticalDramaEpisodeVideoAssembly.ts`) has no
// import of THIS module (one-directional — see that file's own import list),
// so importing its pure `resolveEpisodeTextOverlayRunInputs` + types here is
// safe (no circular dependency). This is a plain service-to-service import,
// distinct from the router-to-router imports this feature's routers avoid.
import {
  resolveEpisodeTextOverlayRunInputs,
  type RunAssemblyJobTextOverlayEventInput,
  type RunAssemblyJobWatermarkImageInput,
  type VdEpisodeTextOverlayCardInput,
  type VdEpisodeTextOverlayCharacterIntroInput,
} from "./verticalDramaEpisodeVideoAssembly";

export interface VdTextOverlayAutoTextOwner {
  tenantId: string;
  userId: number;
  seriesId: number;
}

export interface VdResolvedEndCardAutoText {
  text: string;
  source: VdEndCardTextSource;
}

export interface VdResolvedOpenerRecapAutoText {
  text: string;
  source: VdOpenerRecapTextSource;
}

export interface VdEndCardAndOpenerAutoTextsResult {
  endCard: VdResolvedEndCardAutoText;
  openerRecap: VdResolvedOpenerRecapAutoText;
}

/**
 * Resolve the end-card and opener-recap auto-derived text for one episode
 * (plan.md "แหล่งข้อความอัตโนมัติ"): loads the series' `bible` (for the
 * active breakdown item's `cliffhanger_line`) and the series' memory bundle
 * (for unresolved hooks + the prior episode's `episode_summary`), then
 * applies the pure priority resolvers from
 * `@shared/verticalDramaSeries/textOverlay.ts`. `manualEndCardText`/
 * `manualOpenerRecapText` (the episode's OWN saved `textOverlayPlan.endCard
 * .text`/`.openerRecap.text` when `source === "manual"`) always win when
 * present — see `resolveEndCardText`/`resolveOpenerRecapText`'s own doc
 * comments for the full priority order.
 */
export async function resolveVdEndCardAndOpenerAutoTexts(
  owner: VdTextOverlayAutoTextOwner,
  episodeNumber: number,
  manualTexts: { endCardText?: string | null; openerRecapText?: string | null } = {}
): Promise<VdEndCardAndOpenerAutoTextsResult> {
  const [seriesRow] = await db
    .select({ bible: verticalDramaSeries.bible })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    )
    .limit(1);

  let cliffhangerLine: string | undefined;
  if (seriesRow?.bible) {
    // Lazy import — see this file's own header doc comment for why.
    const { getActiveBreakdown, readItemCliffhangerLine } = await import(
      "./verticalDramaStoryBible"
    );
    const bible = seriesRow.bible as Record<string, unknown>;
    const item = getActiveBreakdown(bible).find(
      i => i.episodeNumber === episodeNumber
    );
    cliffhangerLine = item ? readItemCliffhangerLine(item) : undefined;
  }

  const bundle = await verticalDramaSeriesMemoryService.buildEpisodeMemoryBundle(
    owner,
    episodeNumber
  );
  const priorSummary = bundle.episodeSummaries
    .filter(s => s.episodeNumber < episodeNumber)
    .sort((a, b) => b.episodeNumber - a.episodeNumber)[0]?.summary;

  return {
    endCard: resolveEndCardText({
      manualText: manualTexts.endCardText,
      cliffhangerLine,
      unresolvedHooks: bundle.unresolvedHooks,
    }),
    openerRecap: resolveOpenerRecapText({
      manualText: manualTexts.openerRecapText,
      priorEpisodeSummary: priorSummary,
      episodeNumber,
    }),
  };
}

/**
 * Resolve character-intro-card labels for one episode's start-frame plan
 * (plan.md "ช็อตแรกที่ตัวละครโผล่"): joins each `requiredCharacterRefs` key
 * against the series' character roster (`vertical_drama_characters`) via the
 * pure `deriveCharacterIntroCards` helper. Returns `[]` when `frames` is
 * empty (no start-frame plan generated yet) — never throws.
 */
export async function resolveVdCharacterIntroCardsForEpisode(
  owner: VdTextOverlayAutoTextOwner,
  frames: readonly VdCharacterIntroSourceFrame[]
): Promise<VdDerivedCharacterIntroCard[]> {
  if (frames.length === 0) return [];

  const characterRows = await db
    .select({
      characterKey: verticalDramaCharacters.characterKey,
      name: verticalDramaCharacters.name,
      role: verticalDramaCharacters.role,
    })
    .from(verticalDramaCharacters)
    .where(
      and(
        eq(verticalDramaCharacters.tenantId, owner.tenantId),
        eq(verticalDramaCharacters.userId, owner.userId),
        eq(verticalDramaCharacters.seriesId, owner.seriesId)
      )
    );

  return deriveCharacterIntroCards(frames, characterRows);
}

export interface VdSeriesTextOverlayContext {
  seriesTitle: string;
  targetEpisodeCount: number;
  watermark: VdSeriesWatermarkConfig | null;
}

/** Load the series-level fields the Text Overlay Suite needs (title, target
 *  episode count, watermark config) — a narrow, single-row read. */
export async function loadVdSeriesTextOverlayContext(
  owner: VdTextOverlayAutoTextOwner
): Promise<VdSeriesTextOverlayContext> {
  const [row] = await db
    .select({
      title: verticalDramaSeries.title,
      targetEpisodeCount: verticalDramaSeries.targetEpisodeCount,
      watermark: verticalDramaSeries.watermark,
    })
    .from(verticalDramaSeries)
    .where(
      and(
        eq(verticalDramaSeries.id, owner.seriesId),
        eq(verticalDramaSeries.tenantId, owner.tenantId),
        eq(verticalDramaSeries.userId, owner.userId)
      )
    )
    .limit(1);
  return {
    seriesTitle: row?.title ?? "",
    targetEpisodeCount: row?.targetEpisodeCount ?? 0,
    watermark: parseSeriesWatermarkConfig(row?.watermark),
  };
}

/**
 * Resolve an episode's saved `textOverlayPlan` (+ the series' watermark
 * config) into the render engine's `overlays`/`watermarkImages` inputs (task
 * #34; dual watermark, `planning/vd-dual-watermark/plan.md`) — the ONE
 * shared implementation both `verticalDramaEpisodes.ts`'s
 * `assembleEpisodeVideo` (single-episode) and `verticalDramaSeries.ts`'s
 * `assembleSeasonVideos` (season batch) call, so the two render paths can
 * never drift (mirrors `resolveEpisodeAdBannerRunInputs`'s own "resolve
 * saved plan -> render engine contract" shape, generalized to be reusable by
 * both routers since ad banners' own version is deliberately router-local —
 * see that function's doc comment for why THIS feature made the opposite
 * choice). `includeWatermark` is the render-time opt-out (default-on-when-
 * configured — plan.md "default เปิดเมื่อซีรีส์ config ไว้"), applied as a
 * SINGLE all-or-nothing toggle covering BOTH watermark slots; text/mid-
 * episode-card/character-intro kinds have NO separate render-time toggle —
 * whatever is `enabled` in the SAVED plan is what renders.
 *
 * `listEnabledWatermarkSlots` (`@shared/verticalDramaSeries/textOverlay.ts`)
 * is the ONE place that knows slot 1 is stored inline and slot 2 lives under
 * `secondary` — every enabled slot here becomes either its own
 * `watermark_text` overlay event (TEXT slots) or its own entry in
 * `watermarkImages` (IMAGE slots), tagged with `slotId` so both render
 * engines can give each its own asset/layer. Configured watermark positions
 * are authoritative; when the episode indicator would collide with a top
 * corner, the indicator moves to the other top corner when available.
 */
export async function resolveVdEpisodeTextOverlayEngineInputs(params: {
  owner: VdTextOverlayAutoTextOwner;
  episodeNumber: number;
  episodeTitle?: string | null;
  plan: VdTextOverlayPlan | null;
  startFramePlan: VerticalDramaStartFramePlan | null;
  motionClips: VdDialogueTimelineClip[];
  includedClipNumbers: number[];
  includeWatermark: boolean;
}): Promise<{
  overlays: RunAssemblyJobTextOverlayEventInput[];
  watermarkImages: RunAssemblyJobWatermarkImageInput[];
  overlaysIncluded: number;
}> {
  const { owner, plan } = params;
  const seriesContext = await loadVdSeriesTextOverlayContext(owner);

  const needsAutoText = Boolean(plan?.endCard?.enabled || plan?.openerRecap?.enabled);
  const needsCharacterIntro = Boolean(plan?.characterIntroCards?.enabled);
  const [autoTexts, characterIntroCards] = await Promise.all([
    needsAutoText
      ? resolveVdEndCardAndOpenerAutoTexts(owner, params.episodeNumber, {
          endCardText: plan?.endCard?.text,
          openerRecapText: plan?.openerRecap?.text,
        })
      : Promise.resolve(null),
    needsCharacterIntro
      ? resolveVdCharacterIntroCardsForEpisode(
          owner,
          (params.startFramePlan?.frames ?? []).map(frame => ({
            shotNumber: frame.shotNumber,
            requiredCharacterRefs: frame.requiredCharacterRefs,
          }))
        )
      : Promise.resolve([]),
  ]);

  // Watermark slots (dual watermark — series/title logo + channel logo,
  // `planning/vd-dual-watermark/plan.md`). `listEnabledWatermarkSlots` is
  // the ONE place that knows slot 1 is stored inline and slot 2 lives under
  // `secondary`; `includeWatermark` is a single all-or-nothing render-time
  // opt-out covering BOTH slots (returns `[]` when off).
  const enabledWatermarkSlots = params.includeWatermark
    ? listEnabledWatermarkSlots(seriesContext.watermark)
    : [];

  const watermarkTexts: Array<{
    text: string;
    position: VdWatermarkPosition;
    opacity: number;
    marginPx: number;
  }> = [];
  const watermarkImages: RunAssemblyJobWatermarkImageInput[] = [];

  for (const { slotId, slot } of enabledWatermarkSlots) {
    // Watermark positions are user-configured and authoritative. Do not move
    // either slot to make room for the episode indicator; the indicator is
    // adjusted below instead.
    const position = slot.position;

    if (slot.type === "text" && slot.text?.trim()) {
      watermarkTexts.push({
        text: slot.text.trim(),
        position,
        opacity: slot.opacity,
        marginPx: slot.marginPx,
      });
    } else if (slot.type === "image" && slot.imageUrl?.trim()) {
      watermarkImages.push({
        slotId,
        imageUrl: slot.imageUrl.trim(),
        position,
        opacity: slot.opacity,
        scalePct: slot.scalePct,
        marginPx: slot.marginPx,
      });
    }
  }

  const cardsInput: VdEpisodeTextOverlayCardInput[] = (plan?.cards ?? [])
    .filter(card => card.enabled)
    .map(card => ({
      id: card.id,
      kind: card.styleVariant ?? defaultCardStyleVariantForKind(card.kind),
      text: card.text,
      shotNumber: card.anchor.shotNumber,
      offsetSec: card.anchor.offsetSec,
      durationSec: card.durationSec,
      position: card.position,
    }));

  const characterIntroInput: VdEpisodeTextOverlayCharacterIntroInput[] = needsCharacterIntro
    ? characterIntroCards
    : [];

  const episodeIndicatorPosition =
    plan?.episodeIndicator?.enabled
      ? resolveEpisodeIndicatorCornerAutoAvoid({
          episodeIndicatorPosition: plan.episodeIndicator.position,
          watermarkPositions: enabledWatermarkSlots.map(({ slot }) => slot.position),
        }).position
      : undefined;

  const { overlays, overlayCount } = resolveEpisodeTextOverlayRunInputs({
    endCard:
      plan?.endCard?.enabled && autoTexts
        ? {
            text: autoTexts.endCard.text,
            durationSec: plan.endCard.durationSec,
            showFollowLine: plan.endCard.showFollowLine,
            styleVariant: plan.endCard.styleVariant,
          }
        : null,
    openerRecap:
      plan?.openerRecap?.enabled && autoTexts && autoTexts.openerRecap.text
        ? { text: autoTexts.openerRecap.text, durationSec: plan.openerRecap.durationSec }
        : null,
    titleBumper: plan?.titleBumper?.enabled
      ? plan.titleBumper.text?.trim()
        ? { primary: seriesContext.seriesTitle || "—", secondary: plan.titleBumper.text.trim() }
        : deriveTitleBumperLines({
            seriesTitle: seriesContext.seriesTitle,
            episodeNumber: params.episodeNumber,
            episodeTitle: params.episodeTitle,
          })
      : null,
    episodeIndicator: plan?.episodeIndicator?.enabled
      ? {
          label: deriveEpisodeIndicatorLabel(
            params.episodeNumber,
            seriesContext.targetEpisodeCount
          ),
          position: episodeIndicatorPosition ?? plan.episodeIndicator.position,
        }
      : null,
    characterIntroCards: characterIntroInput,
    cards: cardsInput,
    watermarkTexts,
    motionClips: params.motionClips,
    includedClipNumbers: params.includedClipNumbers,
  });

  return { overlays, watermarkImages, overlaysIncluded: overlayCount };
}
