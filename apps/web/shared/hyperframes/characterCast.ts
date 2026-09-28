import { z } from "zod";

// Marketplace Auto Review — creation-time drama casting
// (planning/marketplace-flexible-shots-and-creation-casting/plan.md, W2;
// widened to a 4-person roster by
// planning/marketplace-four-character-cast/plan.md P1).
//
// Lets the creation-time request seed the staged pipeline's
// `customReferenceManifest` with the scene's characters BEFORE the first story
// plan is authored, so `deriveStagedCastFromManifest` (in
// `marketplaceAutoReviewStagedPipelineService.ts`) already sees a non-empty
// cast at `buildStagedPlanAndMetadataForInit` time and the very first plan
// is solo-vs-conversation aware (skill-first: this is a FACT — who is in
// the scene — never creative content).
//
// Each entry must resolve to *some* image: either a VD portrait
// (`portraitAssetId`, resolved server-side to an absolute URL — VD portrait
// URLs are frequently relative paths, see
// `planning/marketplace-two-character-conversation/plan.md` §3.7) or an
// already-resolved `url` (e.g. a freshly uploaded reference image). Neither
// present is rejected at the input boundary.

/**
 * Cast roles.
 *
 * `host`/`guest` are the two SPEAKING LEADS — they alone drive
 * `resolveStagedConversationMode` and the two-person dialogue engine, exactly
 * as before this widening. `support` is the additive third tier: a character
 * who is in the frame to carry a story beat (business, reaction, an optional
 * short line) without becoming a third conversational voice. See the plan's
 * "2 leads + up to 2 supporting" decision — it is what lets the roster grow to
 * 4 without rewriting the dialogue planner.
 */
export const MARKETPLACE_CHARACTER_CAST_ROLES = ["host", "guest", "support"] as const;
export type MarketplaceCharacterCastRole =
  (typeof MARKETPLACE_CHARACTER_CAST_ROLES)[number];

/** The two roles that own dialogue turns. Everything else is supporting. */
export const MARKETPLACE_CHARACTER_CAST_LEAD_ROLES = ["host", "guest"] as const;

export function isMarketplaceCastLeadRole(
  role: string | null | undefined,
): boolean {
  return role === "host" || role === "guest";
}

/**
 * Ceiling for a cast member's `descriptor`.
 *
 * The picker joins `Description | Personality | Backstory | Identity lock |
 * Wardrobe rules` (falling back to the series bible's `refinedCharacters`
 * entry), so a fully-profiled character genuinely needs room — 400 was enough
 * for a job title plus one sentence and cut the personality off everything
 * richer, which defeats the point of sending it at all.
 */
export const MARKETPLACE_CHARACTER_DESCRIPTOR_MAX = 900;

export const MarketplaceCharacterCastEntrySchema = z
  .object({
    characterName: z.string().trim().min(1).max(120),
    characterRole: z.enum(MARKETPLACE_CHARACTER_CAST_ROLES).optional(),
    /** The VD row this entry renders as — a LOOK (variant) row when the user
     *  picked one, which is why it is not necessarily the family root. */
    vdCharacterId: z.string().max(64).optional(),
    /** The look family's base character. Present only for VD-sourced entries
     *  that resolved to a variant, so a per-shot look switcher can find the
     *  sibling looks without re-deriving the family from the portrait URL. */
    vdBaseCharacterId: z.string().max(64).optional(),
    /** The look's own label ("ชุดลำลอง"), when this entry is a variant. */
    variantLabel: z.string().max(64).optional(),
    vdSeriesId: z.string().max(64).optional(),
    portraitAssetId: z.string().max(64).optional(),
    url: z.string().min(1).max(2048).optional(),
    ageRange: z.string().max(60).optional(),
    /**
     * Who this character IS, in one line — occupation / narrative role /
     * short description, joined by the picker.
     *
     * Without it the story planner only ever learned a NAME and an age, so a
     * flight-operations coordinator and a barista produced the same generic
     * review script with a different name attached
     * (`planning/marketplace-four-character-cast/plan.md`). The VD picker
     * already fetches `occupation`/`narrativeRole`/`description` and used to
     * drop all three at this boundary. Rendered verbatim into the planner's
     * cast roster — a FACT about the person, never creative direction.
     */
    descriptor: z.string().max(MARKETPLACE_CHARACTER_DESCRIPTOR_MAX).optional(),
    /**
     * Explicit minor grounding for this character.
     *
     * Required-by-convention rather than by schema (legacy runs have no value).
     * `project_marketplace_minor_safety_qa_grounding`: SILENCE reads as "a
     * minor may be present" downstream and can block an entire run's images.
     * With a 4-person roster the old "the first character entry is the
     * guardian" heuristic is simply wrong, so the guardian must be derived
     * from this fact instead. `false` is an affirmative "this character is an
     * adult"; `undefined` stays unknown and keeps the conservative behavior.
     */
    depictsMinor: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.portraitAssetId && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "characterCast entries must include either portraitAssetId or url",
        path: ["portraitAssetId"],
      });
    }
  });

export type MarketplaceCharacterCastEntryInput = z.infer<
  typeof MarketplaceCharacterCastEntrySchema
>;

/** Roster ceiling — VD-picked and self-uploaded characters count together
 *  against this ONE number (the user's "นับรวมกันไม่เกิน 4 ตัว"). Mirrored by
 *  `deriveStagedCastFromManifest` downstream and by both client surfaces. */
export const MARKETPLACE_CHARACTER_CAST_MAX = 4;

/** At most one host and one guest; every further character is `support`. */
export const MARKETPLACE_CHARACTER_CAST_MAX_LEADS = 2;

export const MarketplaceCharacterCastInputSchema = z
  .array(MarketplaceCharacterCastEntrySchema)
  .max(MARKETPLACE_CHARACTER_CAST_MAX)
  .optional();

/**
 * Assign roles to a roster: honor whatever the caller set, then fill the
 * remaining entries positionally (host, then guest, then support).
 *
 * Shared by the creation-time seeder and the manifest->cast derivation so the
 * two can never disagree about who the leads are. Three invariants:
 *
 * 1. **Never two hosts (or two guests).** The dialogue engine destructures
 *    exactly one of each (`buildShotDialogueTurnsTH/EN`,
 *    `buildStagedTwoVoiceDescriptor`), and roles used to be assigned purely by
 *    pick order, so older persisted metadata really can carry duplicates. A
 *    duplicate lead loses its claim and is re-filled below — with two
 *    characters that means `[host, host] -> [host, guest]`, which keeps the run
 *    a two-person conversation instead of silently collapsing it to solo.
 * 2. **An explicit `support` stays support.** It must never be promoted into a
 *    lead slot just because a lead seat happens to be free — that is the user
 *    saying "this person is not a main speaker".
 * 3. **At least one lead, whenever anyone is cast.** A roster of nothing but
 *    `support` would leave the dialogue engine with no voice at all, so the
 *    first entry is promoted to host as a floor.
 */
export function assignMarketplaceCastRoles<T extends { characterRole?: string }>(
  entries: readonly T[],
): Array<T & { characterRole: MarketplaceCharacterCastRole }> {
  let hostTaken = false;
  let guestTaken = false;
  const claimed = entries.map((entry) => {
    if (entry.characterRole === "host" && !hostTaken) {
      hostTaken = true;
      return { ...entry, characterRole: "host" as MarketplaceCharacterCastRole };
    }
    if (entry.characterRole === "guest" && !guestTaken) {
      guestTaken = true;
      return { ...entry, characterRole: "guest" as MarketplaceCharacterCastRole };
    }
    if (entry.characterRole === "support") {
      return {
        ...entry,
        characterRole: "support" as MarketplaceCharacterCastRole,
      };
    }
    // Unset, or a duplicate lead that lost its claim — decided below.
    return { ...entry, characterRole: null as MarketplaceCharacterCastRole | null };
  });

  const assigned = claimed.map((entry) => {
    if (entry.characterRole) {
      return entry as T & { characterRole: MarketplaceCharacterCastRole };
    }
    if (!hostTaken) {
      hostTaken = true;
      return { ...entry, characterRole: "host" as const };
    }
    if (!guestTaken) {
      guestTaken = true;
      return { ...entry, characterRole: "guest" as const };
    }
    return { ...entry, characterRole: "support" as const };
  });

  if (assigned.length > 0 && !assigned.some((entry) => isMarketplaceCastLeadRole(entry.characterRole))) {
    return assigned.map((entry, index) =>
      index === 0 ? { ...entry, characterRole: "host" as const } : entry,
    );
  }
  return assigned;
}
