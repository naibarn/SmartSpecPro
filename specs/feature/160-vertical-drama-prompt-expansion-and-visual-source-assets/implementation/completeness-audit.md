# Feature 160 implementation completeness audit

Audit date: 2026-08-23

This is the post-implementation audit after the five planned gap-review rounds.
The audit followed the actual UI -> tRPC -> service -> DB -> story assurance
boundaries, rather than treating the presence of a schema or component as
proof that the flow was complete.

## Findings and remediation

| Boundary | Finding | Remediation | State |
|---|---|---|---|
| Dialog-first expansion | The original premise remained unchanged until confirmation, but approved visual slots were not persisted into the active Source Pack. | `applyPromptExpansion` now CAS-applies the edited preview and upserts the approved slots with role-aware source kind and usage policy. The dialog passes the current pack version and waits for the pack query before enabling Apply. | Closed |
| Web/research expansion | The skill-first route could return a provider result without a structured source list. | The JSON parser and deterministic fallback preserve source metadata when available and emit an explicit verification warning when sources are absent. The route remains fail-safe: no source is treated as verified merely because AI returned text. | Closed with provider/browser verification pending |
| AI generated visuals | Story Sources previously stored the provider result URL with `managed: false`, which could expire and could not be used as a durable production asset. | Added `createGeneratedSourceAsset`: owner-scoped task settlement, managed-media ingestion, storage existence verification, and source-pack attachment with `mediaAssetId` plus canonical `/api/storage/files/...` URL. | Closed |
| Per-slot visual actions | The prompt endpoint existed without the corresponding slot-level UI actions. | Source Hub now exposes Generate prompt and Generate image per slot; the generated asset is attached to that existing slot and keeps its scene/reference/B-roll semantic role. | Closed |
| Visual canon propagation | The snapshot contract existed but the four assurance admission callers did not pass a visual snapshot. | Added source-pack capture/persistence and wired it into plan, deep generate, extend, and improve admissions. | Closed |
| B-roll authorization | Bind/validate accepted client-supplied segment JSON and did not prove owner-scoped source asset, media asset, storage object, or segment revision. | Server now re-resolves source asset, managed media, storage object, and latest segment revision before validating or inserting a binding. | Closed |
| News claim lifecycle | News schemas and in-memory evaluation existed, but claim/evidence corrections were not durable. | Added owner-scoped list/save/correction procedures and revision persistence for claims and evidence. The panel can load and persist claims when a series ID is supplied. | Closed |
| Scene/reference separation | Location/shop slots remain `scene_anchor`; product/software slots remain `reference`; B-roll remains a separate role. | Preserved in prompt slot derivation, Source Pack mapping, visual snapshot mapping, and shot B-roll binding contract. | Closed |
| Full draft alignment | Source pack digest and B-roll manifest were already part of the draft gate; the new snapshot now travels with assurance admission. | No automatic provider/browser render proof was available in this environment. | Code closed; runtime proof pending |

## Verification performed

- Section validators: 8/8 sections complete; UI contract validator passed.
- Focused Feature 160 tests: 4 files, 18 tests passed with the repository test
  `JWT_SECRET` configured.
- `git diff --check`: passed.
- Targeted typecheck review: no new diagnostics in Feature 160 services,
  routers, dialogs, or source hub. Full workspace typecheck still returns the
  pre-existing implicit-any diagnostics in `verticalDramaEpisodes.ts` around
  the character identity helper.

## Explicitly not claimed

- Browser keyboard/visual flow was not run because no browser connector or
  fixture was available.
- PostgreSQL migration application, production storage/provider generation,
  deployment, and live web-search result quality were not run in this audit.
- Existing provider URLs remain provenance metadata; production use requires
  the managed-media settlement path.

## Follow-up gate

Before release, run the browser flow for: open expansion dialog -> generate
preview -> edit -> cancel -> reopen -> apply -> inspect Source Pack slots;
generate image -> verify managed playback; upload footage -> create exact
segment -> bind to shot -> reject stale revision; and create/correct a news
claim. Then apply migrations 0243/0244 in a controlled environment and run
the DB-backed route tests.
