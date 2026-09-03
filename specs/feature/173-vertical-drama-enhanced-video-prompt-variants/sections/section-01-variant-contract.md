# Section 01 — Legacy/Enhanced variant contract and active projection

## Objective

Store a successful Legacy prompt and a successful Enhanced prompt as separate,
complete bundles while keeping the existing `clip.prompt` projection compatible
with all current video-render consumers.

## Scope

- shared TypeScript types and schema validation;
- old-pack reader that treats existing `clip.prompt` as Legacy;
- full-bundle variant persistence;
- explicit Apply/restore projection;
- client-only viewed selection versus persisted active selection;
- split-shot group-atomic Apply and group fingerprint;
- input/model/media fingerprints and stale status;
- render-task provenance and prompt-mismatch preservation;
- row-lock/compare-and-swap merge rules;
- contract and concurrency tests.

## Invariants

1. Creating an Enhanced result never changes active projection fields.
2. Applying a variant changes all matching prompt-bundle fields atomically.
3. Existing packs without variant metadata remain valid.
4. A variant is not ready when its target model, capability fingerprint, or
   canonical media bundle is stale.
5. A late job result cannot replace a newer variant or active projection.
6. `viewedVariant` is never persisted as active render state; after the store
   exists only Apply changes `activeVariant`. First store creation seeds
   `activeVariant: "legacy"` without changing the active prompt.
7. A split-shot Apply either projects every matching clip or projects none.
8. Existing media is retained when prompt provenance changes.
9. The first lazy store creation persists `activeVariant: "legacy"`; this is a
   state stamp, not a change to the existing active prompt.
10. Every existing motion-pack writer preserves the additive store or marks its
    affected variant stale; no old writer may erase it through a whole-pack
    replacement.

## Data shape

Use the main spec's `VerticalDramaVideoPromptVariantStore` shape at the one
canonical location `motionPromptPack.clips[].videoPromptVariants`. A pack-level
reader may index these clip properties for the UI, but must not become a second
source of truth or use first-clip-wins behavior.

The Legacy snapshot is lazy: it is created only when the first Enhanced result
for a clip succeeds. The snapshot copies the current complete active bundle,
including dialogue, audio, frame analysis, cast-position lock, motion profile,
effective identity risk, motion-contract status, model target, and quality
metadata. Its canonical input fingerprint is a deterministic hash of that
pre-feature Legacy bundle, selected target ID, and any server-resolved media
evidence available at snapshot time; it must not imply an Enhanced Agent run.
Variant warnings/assumptions/research provenance stay attached as diagnostics;
`identityQc` and `videoTask` remain render-task/media state and are not prompt
variants.

Persist the exact Feature 170 `VideoShotMediaBundle` selection by asset ID,
media type, role, order, segment, revision, and fingerprint; never persist raw
provider URLs in a variant. Actual authorization and provider transport are
re-resolved by Core at render time.

For a split shot, store a shot-group fingerprint over ordered clip IDs, speaker
windows, dialogue/audio bundles, prompt hashes, target-model fingerprints, and
media-bundle fingerprints. This prevents one sub-shot from silently drifting
from the variant applied to the rest of the shot.

## Apply algorithm

```text
load owned episode
  → lock/re-read latest pack
  → locate exact clip and variant
  → validate Enhanced exact target/fingerprints or Legacy existing mismatch gate
  → copy complete variant to active projection
  → set activeVariant
  → persist audit/provenance atomically
```

On any conflict, return `PROMPT_VARIANT_STALE` or
`PROMPT_VARIANT_CONFLICT` and leave the active prompt unchanged.

Render-task provenance must include variant ID/hash, terminal prompt hash,
target-model ID/capability fingerprint, media-bundle fingerprint, and the group
fingerprint when applicable. A later Apply never deletes an older rendered
asset; it marks a non-matching asset `prompt_mismatch` and requires explicit
re-render.

## Required tests

- old pack parse/projection;
- absent/malformed/future schema reader preserves the existing active projection;
- first Enhanced snapshot preserves Legacy byte-for-byte;
- apply Enhanced and restore Legacy;
- negative/audio/dialogue/model metadata move together;
- changed media revision/model profile blocks Apply;
- user edit preserves the other variant;
- Enhanced edit uses a variant-scoped save and clears/revalidates terminal hash;
- split-shot incomplete group blocks all projection and complete group applies
  atomically;
- switching active variant preserves old media and records mismatch provenance;
- clip-scoped deep merge retains unknown pack fields and does not overwrite a
  concurrent Feature 170 update;
- every existing motion-pack writer (model selection, start-frame completion/
  staleness, dialogue refresh, Legacy generation/repair, storyboard handoff,
  and episode repair) preserves `videoPromptVariants` or marks the affected
  variant stale;
- runtime validation rejects malformed/future stores without changing the
  active Legacy-compatible projection;
- concurrent Legacy/Enhanced completion permutations;
- late job and duplicate idempotency guards.

## UI/UX Contract

### Target User / JTBD
- Role: Vertical Drama creator.
- Goal: preserve the current prompt while a variant is stored and later selected.
- Entry point: existing Storyboard prompt card.
- Success outcome: stored state and active-render state are never confused.

### Existing Pattern Reference
- Searched: `rg` for `VerticalDramaStoryboardPanel`, `InlineEditablePromptBox`,
  prompt generation, and stale/error status under `apps/web/client/src`.
- Found: `VerticalDramaStoryboardPanel.tsx` and
  `VerticalDramaEpisodePage.tsx` existing prompt/editor patterns.
- Decision: reuse. This section supplies data semantics only; it must not create
  a parallel UI state source.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Prompt card | Existing Vertical Drama Storyboard route | Consume active/viewed metadata only |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Variant reader/selector data | Shared contract module | Validated state | Clip JSONB store |
| Prompt editor | Existing Storyboard components | UI only, not canonical state | Server projection |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Existing status remains stable while store is read | Contract/component tests |
| empty | Legacy is shown; Enhanced is not implied | Reader tests |
| error | Invalid Enhanced metadata is explained without clearing Legacy | Reader tests |
| success | Viewed and active variants are independently labeled | UI integration tests |
| disabled/focus/hover | No state mutation from display-only interaction | Component tests |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Existing prompt card remains usable | Browser evidence in section 03 |
| tablet 768x1024 | Variant metadata wraps safely | Browser evidence in section 03 |
| desktop 1440x900 | No change to card hierarchy | Browser evidence in section 03 |
| small-mobile 360x800 | Long diagnostics do not clip | Browser evidence in section 03 |
| laptop 1024x768 | N/A; covered by desktop/tablet checks | Logged in section 03 |
| wide-desktop 1280x800 | N/A; no new layout owner here | Logged in section 03 |

### Accessibility Acceptance
- Keyboard path and focus remain owned by the existing editor.
- Active/viewed/stale semantics are text/ARIA data, not color-only.
- Existing contrast and reduced-motion baseline is preserved.

### Copy Contract
- Tone: concise, explicit, Thai-first with English fallback.
- Primary language(s): Thai and English.
- Required labels: Legacy, Enhanced, active render, preview, stale, invalid.
- Validation/error copy: never claim an invalid store is a successful Enhanced result.
- Empty/loading/success copy: use the section 03 localization keys.
- Localization/fallback notes: missing Thai keys fall back to English safely.

### Browser Evidence Required
- Follow `skills/orchestra/references/ui-browser-verification.md`; section 03
  owns the actual screenshots/E2E evidence for this shared contract.

## Implementation Record

- Implemented the canonical store and validation in
  `apps/web/shared/verticalDramaSeries/videoPromptVariants.ts`.
- Added the optional `videoPromptVariants` clip field so old packs remain
  Legacy-compatible and existing projections are unchanged until Apply.
- Reused the Feature 170 `videoShotMediaBundleSchema`; raw provider URLs are
  not part of the persisted variant contract.
- Added contract tests covering Legacy seeding, Enhanced persistence, apply,
  stale/fingerprint rejection, merge behavior, and malformed input (7 tests).
- Browser evidence remains owned by section 03 and is not claimed here.
