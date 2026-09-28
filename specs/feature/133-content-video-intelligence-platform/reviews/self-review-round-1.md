# Plan Self-Review — Round 1 (adversarial)

Reviewer stance: skeptical senior architect reading `claude-plan.md` cold,
cross-checking against `claude-spec.md`, `claude-interview.md`,
`claude-research.md`.

## Scorecard

| Category | Verdict | Notes |
|---|---|---|
| Structural integrity | PASS | Clear dependency order, reuse contract, risks table. |
| Completeness vs spec | **FAIL → fixed** | Caption-cues→text-layers + SRT/VTT export were named but not wired into the compiler/router. |
| Implementability | **FAIL → fixed** | `ResolvedAssetMap` + who resolves assets + who builds `assetManifest` were undefined. |
| Internal consistency | **FAIL → fixed** | `TemplateBuildContext` vs compiler `ctx` naming diverged. |
| Edge cases | **FAIL → fixed** | Concurrent `saveDocument` had no base-revision guard; preview-profile downscale/concurrency not referenced. |

## Findings & resolutions

1. **Caption cues unwired (Completeness).** `SceneSchema.captionCues` exists and
   the reuse table cites `renderTranscriptCuesAsVtt/Srt`, but no step turned cues
   into Remotion text layers, and SRT/VTT export had no home.
   → Fix: add a compiler step emitting caption text layers from `captionCues`
   (respecting `captions.presetId`/`burnIn`), and a router `exportCaptions`
   procedure returning SRT/VTT via the reused renderers. When `captions.burnIn`,
   captions go through the `ass_burn` post-pass instead of text layers.

2. **Asset resolution undefined (Implementability).** The compiler is pure and
   takes `resolvedAssets`, but nothing said who builds that map or the payload
   `assetManifest`.
   → Fix: define `ResolvedAssetMap` (assetId → { url (storage-proxy), sha256?,
   role }) and locate resolution in a new `videoProjectAssetResolver.ts` called
   by the router's `compileProject`/`queueRender` (owner-checked `mediaAssets`/
   `libraryItems` lookups, spec §17.1). The queue function derives
   `assetManifest` by walking the compiled config's layer `src` values +
   audio-track assets.

3. **Build-context naming (Consistency).** §4.1 `TemplateBuildContext` vs §2.3
   compiler `ctx`.
   → Fix: single `TemplateBuildContext = { format, brandKit, assetResolver }`
   used by both; compiler constructs it once and passes it to `template.build`.

4. **saveDocument concurrency (Edge).** Two tabs/sessions could clobber
   revisions.
   → Fix: `saveDocument` takes `baseRevision`; reject with `CONFLICT` if it does
   not equal the current `video_projects.revision` (optimistic concurrency),
   mirroring the presentation autosave precedent.

5. **Preview profile (Edge/Completeness).** Plan mentioned preview/final but not
   the spec §18.2 downscale (≤540×960, fps≤15) or the 1-concurrent-preview cap.
   → Fix: state the preview downscale in `compileProject`/`queueRender` and the
   per-user concurrency cap in the queue function.

All five fixed directly in `claude-plan.md`; re-read changed sections — no new
cross-reference breaks introduced (§9 router now references §2/§3 symbols that
exist; §5.1 assetManifest now sourced from §2 compiler output).
