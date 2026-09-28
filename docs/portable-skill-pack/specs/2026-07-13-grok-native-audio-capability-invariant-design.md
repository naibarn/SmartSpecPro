# Grok Video Native-Audio Capability Invariant

Date: 2026-07-13
Status: Approved direction (Design A), pending written-spec approval

## Problem

Vertical Drama treated `higgsfield/grok_video` as a separate-TTS model even
though Grok Video must support native audio regardless of provider. The episode
still retained its dialogue in `motionPromptPack.clips[].dialogue`, but prompt
generation was explicitly instructed not to embed the transcript. This made the
video prompt appear to have lost dialogue.

This is a regression of a rule that had already been implemented for the Kie
Grok Imagine Video 1.5 static entry. The rule did not survive the addition of
other provider catalogs because capability ownership is duplicated:

1. Static `modelRegistry.ts` entries may set explicit capability flags.
2. DB-only models derive capabilities only from `configJson.hasAudio` or
   `configJson.nativeAudio`.
3. MCP seed definitions describe audio support in prose/default parameters but
   cannot declare the capability in their typed contract.
4. Seed upserts replace `configJson`, so a manually repaired DB row can regress
   on the next catalog refresh.
5. Existing tests verify individual entries, not the cross-provider Grok family
   invariant.

The same investigation found two adjacent correctness gaps:

- the multi-speaker speaker-switch generator lacks the native-audio verbatim
  compliance retry already used by the single-speaker generator;
- regenerated storyboards can coexist with downstream start-frame and motion
  artifacts from an older storyboard revision.

## Product Invariant

For every media model whose type is `video` and whose normalized model identity
belongs to the Grok family:

```text
nativeAudioDialogue = true
supportsNativeAudio = true
```

The invariant is provider-independent. It applies to Higgsfield, Kie,
Magnific, KNPLabs, and future providers. Provider metadata may add more
capabilities but may not downgrade either Grok native-audio flag to `false`.
Image-only Grok models are excluded.

For native-audio Vertical Drama prompts, every persisted dialogue line must
appear verbatim in the final provider-facing prompt after every sanitizer,
length-QC, style-token, and formatting pass.

## Considered Approaches

### A. Family invariant plus explicit catalog metadata (chosen)

Resolve Grok native audio centrally, write explicit metadata in all catalogs,
backfill existing rows, and enforce the final prompt contract. This has two
layers intentionally: the resolver prevents runtime regressions from incomplete
catalogs, while explicit seed metadata keeps admin/UI/catalog data truthful.

Trade-off: more tests and a small amount of duplicated persisted metadata, but
runtime correctness no longer depends on every provider integration remembering
the rule.

### B. Patch current provider rows only

Add `hasAudio: true` to the two Higgsfield rows and current Kie rows. This is
fast but fails again when a new provider or Grok alias is introduced.

Rejected because this is how the previous fix escaped its original scope.

### C. Embed dialogue for every video model

Ignore model capability and always place dialogue in the motion prompt.

Rejected because separate-TTS models could produce duplicate or conflicting
speech and because it destroys the existing audio-routing contract.

## Architecture

### 1. Canonical Grok video-family classifier

Create one pure exported classifier near the model capability resolver. It
accepts the model type plus all stable identity surfaces available at runtime:

- public `modelId`;
- `configJson.providerModelId`;
- `configJson.mcp.providerModelId`;
- aliases/name/provider fields when available.

Matching is normalized and token-aware so these examples resolve true:

- `higgsfield/grok_video`;
- `higgsfield/grok_video_v15`;
- `grok-imagine/text-to-video`;
- `grok-imagine/image-to-video`;
- `grok-imagine-video-1-5-preview`;
- `grok-video-3`;
- future `magnific-mcp/...grok...video...` identifiers.

The classifier must first require `type === "video"`; `grok_image`,
`grok-imagine/text-to-image`, and upscale/image tools must remain excluded.

`resolveVerticalDramaCapabilities` applies this classifier before returning.
For a Grok video it force-enables both audio flags even when a catalog row is
missing them or explicitly contains a stale `false` value.

### 2. Catalog and seed contract

Extend MCP media seed definitions with explicit optional capability fields.
`buildConfigJson()` persists both canonical signals used elsewhere:

```json
{
  "hasAudio": true,
  "nativeAudio": true
}
```

Every existing Grok video seed sets these fields. Static Grok video entries use
the same true values. Model descriptions/default parameters are not treated as
capability metadata.

Add an idempotent TypeScript catalog backfill path that loads candidate
`media_models` rows and calls the same exported classifier used by runtime. Do
not reimplement family detection as an independent SQL `LIKE` expression. It
must update only the two audio capability keys and preserve unrelated provider
configuration. Production execution is a separate explicit operation;
implementation and tests must not silently mutate production.

The backfill supports `--report` (default) and an explicit `--apply` mode.
Before apply, export the affected row ids/model ids/config JSON into a timestamped
backup file and print deterministic restore instructions.

### 3. Native-dialogue prompt compliance

Extract the existing single-speaker verbatim check/corrective retry into one
shared internal helper and use it for both single-speaker and speaker-switch
generation.

The enforcement sequence is:

1. Generate the structured prompt result.
2. If native audio is enabled, compare every resolved/persisted dialogue line
   against the prompt using quote/whitespace normalization.
3. Retry once with a bounded compliance correction containing the exact missing
   lines.
4. If the retry is still incomplete, deterministically append only the missing
   quoted dialogue lines with speaker and delivery context.
5. Run brand/policy sanitation and prompt-length QC using protected verbatim
   fragments.
6. Validate again at the persistence/provider-submission boundary. Never persist
   or submit a native-audio prompt that fails the invariant.

Length QC must accept protected fragments. Compression may shorten motion prose
but cannot remove or paraphrase dialogue. If the combined mandatory dialogue
alone exceeds the provider cap, return an explicit precondition/quality error
rather than silently truncating it.

For non-native models, the existing separate-TTS behavior remains unchanged.

### 4. Storyboard/downstream revision safety

Generate a deterministic revision fingerprint from the canonical storyboard
shot data. Downstream storyboard-derived artifacts record the source revision:

- start-frame plan;
- dialogue-audio plan when shot-mapped;
- motion-prompt pack;
- assembly manifest and shot-indexed overlays/plans where applicable.

When a storyboard is regenerated, existing downstream artifacts are preserved
but marked stale with the old/new revisions and `storyboard_changed` reason.
They must not be submitted for paid generation until regenerated or explicitly
reconciled. The UI surfaces the stale state instead of showing old content as if
it belonged to the new storyboard.

Legacy artifacts without revision metadata are treated as provenance-unknown.
They remain viewable/exportable, but paid generation requires a one-time
regeneration/reconciliation so existing user data is not deleted.

### 5. Regression observability and ownership

The model capability resolver is the sole runtime owner of the Grok family
invariant. Provider adapters, UI components, and prompt generators consume its
result; they must not create new provider-specific Grok exceptions.

Emit a bounded structured warning when a Grok video reaches the resolver with
missing or false persisted audio metadata and the family invariant repairs it.
Record model id, provider, and repaired capability names, without user prompt or
dialogue content. Add counters/log events for compliance retries,
deterministic-dialogue fallback, and stale-artifact blocks so a future catalog
regression becomes visible before users report missing dialogue.

The invariant test suite is part of the normal web test/CI surface and scans
every exported/static/seeded Grok video definition. A provider catalog change
that introduces a Grok video without explicit native-audio metadata must fail
CI even though the runtime fallback remains safe.

## Data Flow

```text
catalog/DB model
  -> canonical Grok video-family classifier
  -> resolved native-audio capabilities
  -> per-shot dialogue resolution
  -> single or speaker-switch prompt generation
  -> shared verbatim compliance enforcement
  -> protected sanitize/length QC/final formatting
  -> final invariant validation
  -> persist + provider submission
```

Storyboard regeneration follows a separate revision path:

```text
new storyboard
  -> compute revision
  -> persist storyboard
  -> mark older downstream artifacts stale (preserve content)
  -> block paid use until regenerated/reconciled
```

## Failure Handling

- Missing provider capability metadata: family invariant supplies the correct
  runtime value.
- Stale explicit `false`: family invariant wins and invariant tests fail the
  catalog audit.
- LLM omits a line: one corrective retry, then deterministic append.
- Prompt cap conflict: explicit error with required/available character counts;
  no silent transcript loss.
- Seed refresh: explicit Grok metadata is re-applied, preventing regression.
- Storyboard changes: downstream artifacts are preserved but blocked as stale.
- Legacy artifact: viewable, but provenance warning and regeneration gate apply.
- Catalog metadata regression: runtime repairs it, emits a structured warning,
  and CI fails the catalog invariant test.

## Testing Strategy

### Capability invariants

- table-driven tests for every enabled Grok video row in the static registry,
  MCP seed catalogs, and DB-model conversion fixtures;
- provider matrix covering Higgsfield, Kie, Magnific, KNPLabs, and an unknown
  future provider;
- negative cases for Grok image, upscale, and non-Grok video models;
- test proving stale explicit `false` cannot downgrade a Grok video;
- catalog audit test that fails when any Grok video seed omits explicit audio
  metadata.

### Prompt compliance

- single-speaker and multi-speaker prompts with all lines present;
- LLM omission corrected by retry;
- retry omission repaired by deterministic append;
- protected dialogue survives length QC and final formatter/provider payload;
- non-native model remains transcript-free and routes dialogue to TTS;
- Thai quotes/whitespace and multiple speakers preserve exact text/order.

### Revision safety

- storyboard regeneration records a new revision and marks every relevant
  downstream artifact stale without deleting it;
- stale/legacy artifacts cannot enter paid generation;
- UI/API response exposes actionable stale metadata;
- regenerating downstream artifacts clears the stale state by writing the new
  source revision.

## Rollout

1. Ship classifier and invariant tests first; runtime immediately treats every
   Grok video correctly even before DB backfill.
2. Ship explicit seed metadata and idempotent backfill tooling.
3. Ship shared prompt-compliance enforcement.
4. Ship storyboard revision/stale guards and UI warning.
5. Run backfill only after a read-only report and backup of affected model rows.
6. Re-run catalog audit and targeted Vertical Drama prompt tests after backfill.
7. Roll back by restoring only the backed-up `configJson` values; the runtime
   family invariant remains safe independently of persisted metadata.

## Acceptance Criteria

- Episode 42 with `higgsfield/grok_video` resolves as native audio and embeds
  both dialogue lines verbatim in its regenerated video prompt.
- Every Grok video model from any provider resolves both native-audio flags as
  true.
- Adding a new provider Grok video without explicit audio metadata fails the
  catalog invariant test but still resolves safely at runtime.
- Speaker-switch prompts cannot persist with missing dialogue lines.
- Prompt refinement/formatting cannot silently remove protected dialogue.
- Regenerating a storyboard cannot silently reuse downstream artifacts from an
  older revision.
- No existing downstream artifact is deleted by the stale-artifact migration.
