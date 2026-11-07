# Section 03 — Partial Assembly and Truthful Fallback

## Requirement IDs

NB-03, NB-04, CPE-10, CPE-11

## Objective

Allow supported partial assembly from technically successful clips despite advisory warnings while accurately representing missing/placeholder media.

## Owned paths

`verticalDramaEpisodeVideoAssembly.ts`, `resolveClipsForAssembly`, assembly router/UI, `assemblyManifest` and assembly tests.

## Tasks

1. Reconcile route/UI access to existing explicit `allowPartial` semantics.
2. Ensure a CPE score/warning cannot change clip-selection or final assembly readiness.
3. Include only verified completed clips; keep missing clips visible and partial status explicit.
4. Preserve hard failure for zero usable clips, corrupt/unsafe media, invalid timeline, or ownership failure.
5. Ensure still-image/placeholder output carries a distinct label and never populates generated-video fields.

## Completion predicate

Unit/integration/UI tests prove warning-tolerant full/partial assembly, technical rejection, truthful manifest/status and preserved standalone clips.

## Prerequisites and fallback

Requires sections 01 and 02. If partial assembly is not supported in a route, do not silently opt users in; retain successful clips and surface the existing explicit action or a clearly labeled gap.

## Focused tests and evidence

Cover all clips complete, one technical clip failure with explicit partial assembly, one CPE warning, zero usable clips, corrupt/unsafe required media, invalid timeline and still-image/placeholder fallback. Verify route, manifest and UI label agree and standalone successful clips remain accessible.

## Unresolved assumptions

Confirm route/UI support and user authorization semantics for `allowPartial` before exposing it. The plan does not assume that still-image fallback may be represented as generated video.
