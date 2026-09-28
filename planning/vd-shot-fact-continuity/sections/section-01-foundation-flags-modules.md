<!-- SECTION: section-01-foundation-flags-modules -->

# Section 01 — Foundation: two flags, two pure modules

| | |
|---|---|
| **Depends on** | – (first section) |
| **Blocks** | every other section |
| **Flag** | registers both; consumes neither |
| **Test** | `cd apps/web && npx vitest run shared/verticalDramaSeries/__tests__/shotPresence.test.ts shared/verticalDramaSeries/__tests__/shotObjectLedger.test.ts --reporter=basic` |

This section adds **no call sites**. Flag-off byte-identity is therefore true by
construction, and both gates (the P1 branch's Gate A / Gate B) must be *identical*,
not merely a subset. Any movement means something unrelated was touched.

---

## 1. Background for an implementer with no context

Vertical Drama turns a written drama series into short vertical videos. A
sub-episode has 9 numbered **shots**; each gets a **start frame** image (an LLM
authors the image prompt, a paid model renders it) and then a video clip animated
from that still.

Two production failures motivate this branch:

- **(A)** A character who is only *mentioned* in dialogue — most often the person on
  the other end of a **phone call** — is drawn as physically present.
- **(B)** An object changes identity between shots: a photo taken with a **mobile
  phone** in shot 3 is examined on the back of an **SLR camera** in shot 4.

Neither is fixable by prompt wording, because the underlying facts are not recorded
anywhere. This section builds the two deterministic modules that will hold them.

**House pattern to copy:** `shared/verticalDramaSeries/audienceAgeRating.ts` —
constant tuple → derived union → type guard → lenient `resolveX(unknown)` → render
helper, with a header stating the skill-first split. Runner-up worth skimming for the
"never throws, never judges" doctrine: `retentionFacts.ts:1-30`.

---

## 2. Flags

Register both, mirroring the shipped `verticalDramaRetentionHooks` flag. **Four sites
each**, all in `shared/featureFlags.ts` plus the admin grouping:

1. `TenantFeatureFlags` interface — beside the other `verticalDrama*` members
2. `ALLOWED_FEATURE_FLAGS`
3. `FEATURE_FLAG_DEFAULTS` — **`false`** for both
4. `client/src/components/admin/tenantFeatureFlagGroups.ts` — the existing
   `"Vertical Drama Series"` group, Thai descriptions

```ts
verticalDramaShotPresence: boolean;  // F140 Part A — per-shot character presence
                                     // (in_frame / voice_only / mentioned); only
                                     // in_frame characters become image references
verticalDramaShotObjects: boolean;   // F140 Parts B+C — per-shot objects, the episode
                                     // object ledger, and previous-shot context in
                                     // the per-shot image prompt
```

Plus a frozen key tuple and a registration predicate, exactly like the P1 branch's
`VERTICAL_DRAMA_P1_FEATURE_FLAG_KEYS`:

```ts
export const VERTICAL_DRAMA_SHOT_FACT_FEATURE_FLAG_KEYS = [
  "verticalDramaShotPresence",
  "verticalDramaShotObjects",
] as const satisfies readonly TenantFeatureFlagKey[];

export function areVerticalDramaShotFactFeatureFlagsRegistered(): boolean;
```

**Router resolvers** — one focused helper per flag, resolved **once per request**,
threaded into services as an optional boolean defaulting to `false`. Copy
`resolveVerticalDramaRetentionHooksFlag` verbatim, including its optional chaining
(`flags?.x === true`): ~30 existing router tests mock `getTenantFeatureFlags` as a
bare `vi.fn()` resolving `undefined`, and a direct property read would throw the
moment a call site is wired.

> **Why two flags, not one.** Sections 02–03 *subtract* characters from renders — that
> can change who appears in future renders of an already-approved episode. Sections
> 04–05 only *add* context. Different blast radius, so they must roll out and roll
> back independently.

---

## 3. `shared/verticalDramaSeries/shotPresence.ts`

Pure, zero imports, browser-safe.

```ts
export const VD_SHOT_PRESENCES = ["in_frame", "voice_only", "mentioned"] as const;
export type VdShotPresence = (typeof VD_SHOT_PRESENCES)[number];

export function isVdShotPresence(value: unknown): value is VdShotPresence;

/**
 * Lenient coercion of a raw `presence` value from skill JSON or persisted jsonb.
 * NEVER throws. Anything unrecognized — absent, null, a typo, a new value from a
 * future skill version — resolves to "in_frame".
 *
 * The default is deliberately the INCLUSIVE one: every existing draft in production
 * has no `presence` field, and defaulting to in_frame is what makes this branch
 * behavior-preserving on legacy data. A conservative default (excluding people) would
 * silently remove characters from episodes that render correctly today.
 */
export function resolveShotPresence(raw: unknown): VdShotPresence;

/** True only for "in_frame" — the single predicate every image-side consumer uses. */
export function isRenderablePresence(presence: VdShotPresence): boolean;

/**
 * Split a shot's declared characters into the ones that become image references and
 * the ones that are deliberately excluded (with their reason, for the audit field
 * and the QC warning). Order is preserved; nothing is sorted or deduped.
 */
export function partitionShotCharactersByPresence<T extends { presence?: unknown }>(
  characters: readonly T[],
): { inFrame: T[]; excluded: Array<{ character: T; presence: VdShotPresence }> };
```

Header comment must state: which feature and flag; that `voice_only` characters
**keep every dialogue-side behavior** and are excluded from *image composition only*;
and that the module never infers presence from text — inferring presence from text is
precisely the bug being removed.

---

## 4. `shared/verticalDramaSeries/shotObjectLedger.ts`

Pure, zero imports, browser-safe. Deterministic — same input, byte-identical output,
forever. No clock, no randomness.

```ts
export const VD_SHOT_OBJECT_ROLES = [
  "in_hand",     // held or operated by a character — the INSTRUMENT case
  "focus",       // what the shot is visually about (the photo being examined)
  "in_scene",    // present set dressing that matters
  "referenced",  // spoken about, NOT visible — the object twin of "mentioned"
] as const;
export type VdShotObjectRole = (typeof VD_SHOT_OBJECT_ROLES)[number];

export interface VdShotObject {
  name: string;
  role: VdShotObjectRole;
  /** Names the object this one is the output/derivative of, e.g. a photo ← a phone. */
  fromObject?: string;
  /** The authoring layer's claim that this shot introduces the object. Advisory —
   *  the ledger decides introduction by first appearance, not by this flag. */
  introduced?: boolean;
}

export interface VdObjectLedgerEntry {
  /** Display name as first written. */
  name: string;
  /** Normalized key: trim → lowercase → collapse whitespace. */
  key: string;
  introducedInShot: number;
  lastSeenInShot: number;
  /** Every role this object has held, in first-seen order. */
  roles: VdShotObjectRole[];
  /** Resolved ledger key of the object this derives from, when resolvable. */
  fromKey?: string;
  /** True when two different display names normalized to this key in one episode —
   *  the ambiguity signal. Consumers must emit NO established-object fact for an
   *  ambiguous entry rather than risk asserting the wrong identity. */
  ambiguous?: boolean;
}

export type VdEpisodeObjectLedger = Map<string, VdObjectLedgerEntry>;
```

```ts
/** Lenient per-object coercion. Never throws; unknown role → "in_scene";
 *  an entry with a blank name is dropped. */
export function resolveShotObject(raw: unknown): VdShotObject | undefined;

/**
 * Fold the episode's shots (ascending shot order) into the ledger. Pure and
 * deterministic. Later shots update `lastSeenInShot` and append unseen roles;
 * `introducedInShot` is set by FIRST appearance and never moves.
 */
export function buildEpisodeObjectLedger(
  shots: readonly { shotNumber: number; objects?: readonly unknown[] }[],
): VdEpisodeObjectLedger;

/**
 * The objects THIS shot references that were established in an EARLIER shot —
 * i.e. exactly the set that must not be re-invented. Excludes objects introduced by
 * this same shot (nothing to carry) and ambiguous entries (§ambiguity rule).
 */
export function resolveEstablishedObjectsForShot(
  ledger: VdEpisodeObjectLedger,
  shotNumber: number,
  shotObjects: readonly VdShotObject[],
): VdObjectLedgerEntry[];

/**
 * One compact fact line naming each established object and where it came from.
 * Returns undefined when there is nothing to say — never an empty label.
 * Example: `established objects (do not re-invent): มือถือของมายด์ — introduced in shot 3, in hand`
 */
export function renderEstablishedObjectsFact(
  entries: readonly VdObjectLedgerEntry[],
): string | undefined;

/**
 * The causal line for objects that derive from an earlier one.
 * Example: `ภาพถ่ายในมือถือ is the output of มือถือของมายด์ (shot 3) — the device must match`
 * This is the line that fixes the phone→SLR failure. Returns undefined when no
 * shot object carries a resolvable `fromObject`.
 */
export function renderObjectLineageFact(
  ledger: VdEpisodeObjectLedger,
  shotObjects: readonly VdShotObject[],
): string | undefined;

/** The exact first line of the rendered previous-shot block. Section 06's skill
 *  gate conditions on this literal — changing it is a cross-file breaking change. */
export const VD_PREVIOUS_SHOT_CONTEXT_HEADER: string;

/**
 * The reference-only previous-shot block (section 05). Deliberately ONE shot, not a
 * history: the goal is continuity with the immediately preceding beat, and a growing
 * transcript would eat the prompt budget the P1 branch just created.
 * Returns undefined when there is no previous shot.
 */
export function renderPreviousShotContextBlock(input: {
  shotNumber: number;
  summary?: string;
  objects?: readonly VdShotObject[];
  inFrameCharacterNames?: readonly string[];
  continuityNotes?: string;
}): string | undefined;
```

### 4.1 Rules that must be encoded here, not at call sites

| Rule | Behavior |
|---|---|
| **Ambiguity is fail-open** | Two different display names normalizing to one key ⇒ mark `ambiguous` and emit **no** established-object fact for it. Asserting the wrong object identity is worse than asserting none — that is the failure being fixed. |
| **Introduction never moves** | `introducedInShot` is the first appearance. A later shot re-declaring `introduced: true` does not reset it. |
| **`referenced` does not establish** | An object only spoken about does not become an established visual object; it may still appear in the ledger with that role, but `resolveEstablishedObjectsForShot` excludes entries whose every role is `referenced`. |
| **Unresolvable `fromObject` is dropped** | If the named source is not in the ledger, emit no lineage line rather than a dangling one. |
| **No sorting, no dedup of shot objects** | Authoring order carries meaning; keep it. |
| **Caps** | Object name trimmed to 120 chars; at most 8 objects per shot; at most 6 established entries rendered per fact line. Log (do not throw) when trimming. |

---

## 5. Tests first

Both suites are **zero-mock** pure-module tests. Templates:
`shared/verticalDramaSeries/__tests__/videoPromptModelFamily.test.ts` (happy path →
boundary → precedence → null-safety → frozen-set assertion) and
`__tests__/imagePromptLanguage.test.ts` (minimal shape).

```
shotPresence.ts
  resolveShotPresence returns the value for each of the three valid strings
  ...returns "in_frame" for undefined, null, "", a number, an object, a typo
  ...normalizes case and surrounding whitespace ("In_Frame ", "VOICE_ONLY")
  ...never throws for deeply malformed input
  isRenderablePresence is true ONLY for in_frame
  partitionShotCharactersByPresence puts an undeclared character in `inFrame`
      ← the legacy-data guarantee: today's drafts must behave exactly as today
  ...excludes voice_only and mentioned, reporting each one's resolved presence
  ...preserves input order and does not mutate the input array
  VD_SHOT_PRESENCES is a frozen set (toEqual on the tuple)

shotObjectLedger.ts
  buildEpisodeObjectLedger folds shots in ascending order
  introducedInShot is the FIRST appearance and never moves on re-declaration
  lastSeenInShot advances; roles accumulate in first-seen order without duplicates
  two display names normalizing to one key mark the entry ambiguous
  an ambiguous entry is EXCLUDED from resolveEstablishedObjectsForShot
      ← the fail-open rule; getting this backwards asserts a wrong identity
  an object introduced by THIS shot is not "established" for this shot
  an entry whose every role is "referenced" is not established
  resolveShotObject drops a blank name, coerces an unknown role to in_scene, never throws
  renderEstablishedObjectsFact returns undefined for []
  ...names each entry with its introducing shot and role
  ...caps at 6 entries
  renderObjectLineageFact emits the causal line for a resolvable fromObject
      ← THE phone→photo test: shot 4's photo names shot 3's phone
  ...returns undefined when fromObject names something not in the ledger
  renderPreviousShotContextBlock returns undefined with no previous shot
  ...emits the exact header, then only the supplied fields, omitting empties
  ...is one shot, never a history (assert the full block against a fixture)
  every exported function is deterministic and does not mutate its inputs
  VD_SHOT_OBJECT_ROLES is a frozen set
```

**The three tests that matter most:** the legacy-default one (an undeclared character
stays in frame), the ambiguity one (a colliding key emits nothing), and the lineage
one (the photo names the phone). If any of those is written backwards, the branch
either breaks working episodes or fails to fix the reported bug.

---

## 6. Done when

1. Both flags exist in all four sites with `false` defaults; the frozen tuple and the
   registration predicate are exported; both router resolvers exist, fail closed, and
   read the flags once per call.
2. Both pure modules exist with exactly the §3/§4 surface, zero imports, and header
   comments stating the skill-first split and the `voice_only`-keeps-dialogue rule.
3. Both suites green with zero mocks.
4. `grep` proves neither module is imported by any service, router or component yet,
   and neither is added to `shared/verticalDramaSeries/index.ts` (the newest modules
   are imported by direct path).
5. `pnpm check` adds no new errors.
6. The P1 branch's Gate A is unchanged and its Gate B fail-set is **identical** — not
   a subset. This section touches no existing behavior.
