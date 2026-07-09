# Spec Sync Audit — 2026-07-09 (v0.4 → v0.5)

Scope: synchronize spec 131 with everything shipped between v0.4 (2026-07-07)
and 2026-07-09 — roughly ten production waves tracked in
`planning/vertical-drama-production-grade-upgrade/plan.md`,
`planning/vertical-drama-ad-banner-overlay/plan.md`,
`planning/vertical-drama-tie-in-replan/plan.md`, and
`planning/vertical-drama-share-links/plan.md`. Documentation-only pass — no
code files were read-depended-on for facts beyond spot-verification; no code
was edited.

## Method

1. Read `spec.md` (v0.4, 3804 lines) and `sections/index.md` in full before
   editing.
2. Read the four planning docs above plus
   `planning/vertical-drama-character-consistency/research-2026-07-09.md` in
   full.
3. Read `section-08` and `section-13` in full to confirm task #31's
   in-flight edits (§13.1 defer path, §7.7.2 `tieIn` type, §7.7.3 deliberate
   re-plan paragraph) before writing anything, to avoid duplication/
   contradiction.
4. Spot-verified every load-bearing claim against actual code with `grep`/
   `sed` (no SocratiCode MCP tool was available in this session's toolset —
   this is the documented fallback, not a preference):
   `shared/featureFlags.ts` (all 27 vertical-drama flags, exact F-codes),
   `server/services/verticalDramaStoryJobs.ts` (queue name, dedupe/
   exclusivity design), `shared/verticalDramaSeries/adBannerPresets.ts` (10
   style ids, doc comments), `shared/verticalDramaSeries/formatProfiles.ts`
   (3 tiers, exact numeric thresholds), `server/services/
   verticalDramaStoryBible.ts` (`VD_SEASON_CRITIQUE_FINDING_KINDS`, all 10
   kinds with their deterministic/LLM-only source), `server/services/
   verticalDramaFinalRenderGraph.ts` (10 caption preset ids via
   `HyperframesFinalCompositeSubtitlePresetSchema`), `server/services/
   verticalDramaEpisodePipeline.ts` (`resolveEpisodeTieInPlacement`,
   `tieInReplanFlagOn`), `server/services/verticalDramaCharacterStock.ts`
   (`pickBestCharacterSheetAsset` priority order), and
   `drizzle/schema.ts` (confirmed `adBannerPlan`/`voiceConfig`/
   `qualityPolicy`/`visualIdentityJson` columns exist; confirmed NO
   `vertical_drama_series_share_links` table).
5. Queried the live `tenants.featureFlags` column directly (`psql`) for
   `tenant-001` and `tenant-ZCSKEM9s` rather than trusting the plan log's
   prose claims — this caught one real discrepancy (see Findings #1 below).
6. Wrote spec v0.5 (surgical edits + new subsections, no renumbering of
   existing §1-§23 top-level sections) + new `section-16-ad-banner-overlay.md`
   + light touches to section-01/03/04/05/06/08/09/13/14 + `sections/index.md`.
7. Ran a grep self-audit for stale claims and stale absolute line-number
   cross-references (an unavoidable side effect of inserting ~900 lines into
   spec.md) across every file this task owns.

## Findings

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | MEDIUM | `planning/vertical-drama-production-grade-upgrade/plan.md`'s progress log marks task #19 (Story Lock, F131V) "[x]" done/deployed, which could be misread as "rolled out." Direct DB query of `tenants.featureFlags` for both tenants that have every other 2026-07-08/09 flag enabled shows `verticalDramaSeriesStoryLock` is **absent from both** — the code shipped but the flag has never been turned on anywhere. | Documented precisely in spec §17 and §23.1 with the verification method stated, instead of assuming deployed-code implies enabled-flag. |
| 2 | MEDIUM | Task #32 (read-only share links) has a complete, owner-approved design doc (`planning/vertical-drama-share-links/plan.md`, "ทำให้เลย" 2026-07-09) that could be mistaken for "in progress." Verified on disk: no `vertical_drama_series_share_links` table in `drizzle/schema.ts`, no `verticalDramaShare` router file, no `createSeriesShareLink`/`SeriesShareLink` symbol anywhere in `apps/web`, no flag registered in `shared/featureFlags.ts`. | Added spec §24, explicitly headed "PROPOSED, NOT YET IMPLEMENTED," summarizing the design as a forward-looking contract rather than documenting it as shipped. |
| 3 | LOW | §8.2.1 and §8.7 both called `generateStoryBible`/"Generate story" "the one paid exception" / "the one action... genuinely paid" — false since task #28's four async story-job actions (§8.2.3) are also genuinely paid. | Both corrected in place; §8.2.1 keeps a `> 2026-07-08 correction:` note rather than silently rewriting history. |
| 4 | LOW | §21 decision 5 said final MP4 assembly "should use the existing... render-export path when available," framing a dedicated render engine as a fallback/deferred choice. Task #21 (2026-07-09) built a purpose-made Node ffmpeg render graph instead. | Marked with strikethrough + a "Superseded 2026-07-09" note rather than deleted, preserving the historical decision record. |
| 5 | LOW | §10.1 / §15 / section-01 all said "the eight" skill folders; 13 exist on disk (verified via `ls apps/web/skills \| grep vertical-drama`). | All three corrected with an explicit "shipped folders beyond the original 8" callout, keeping the original 8 MVP-wave list intact for historical accuracy. |
| 6 | LOW (self-introduced, caught in self-audit) | Inserting ~900 lines into `spec.md` invalidated every hardcoded absolute line-number cross-reference in section-04/05/06/08 (e.g. `(§11.6, L1686)`, `spec lines 1251-1254`) — these files are owned by this task. | Stripped the stale absolute line numbers, kept the already-present (and still valid, since no existing top-level/sub-section was renumbered) `§X.Y` references. Verified with a final repo-wide grep — zero remaining hits. |

## Delta Map (spec section → what changed)

| Delta | Task(s) | New/changed spec section(s) | New/changed section file(s) |
|---|---|---|---|
| A. Async story jobs | #28 | §8.2.3 (new) | (mechanism documented in spec only — generic across the 4 mutations) |
| A(context). Deep story drafts + premium mode | #10/W10, W11 | §8.2.3 (new) | — |
| B. Season dramaturgy critic | #29 | §6.8.2, §16.2 (new) | section-14 (pointer + disambiguation) |
| C. Format profiles | #23 | §7.8 (new) | — |
| D. Ad banner overlay | #30 | §6.8.3, §13.3 (new) | section-16-ad-banner-overlay.md (new file), sections/index.md |
| E. Tie-in aware deep drafts | #22 | §13.2 (new) | — |
| F. Beyond-plan sanity | #26 | §11.8 (new) | — |
| G. Final render suite | #21 | §12.2 (note) + §12.4 (new) | section-09 (extended) |
| H. Character reference v2 | #27-A | §9.3 (new) | section-05 (extended) |
| I. Share links | #32 | §24 (new, PROPOSED/NOT IMPLEMENTED) | — |
| J. Flags & rollout | — | §17 (10 flags added + DB-verified rollout note) | section-03 (extended) |
| K. Small debts | #24 | §8.7, §23.1 footer | — |
| (found, not in A-K) Voice casting | #15/W12 | §14.2 (new, brief) | — |
| (found, not in A-K) Story Lock | #19 | §16.3 (new, brief) | — |
| (self-audit) Stale claims | — | §8.2.1, §8.7, §21, §10.1/§15 | section-01 |
| (self-audit) Stale line-number refs | — | — | section-04, 05, 06, 08 |
| Version/changelog | — | §0 (new), header | — |
| Traceability | — | §23.1 (new) | — |

## Scope Decisions (explicit, not silent gaps)

- **Voice Chain (§14.2) and Story Lock (§16.3) got brief coverage, not
  full section-file treatment.** These two were not named in the task's
  A-K delta list; they are documented because omitting a live, tenant-facing
  (Voice Chain) or code-shipped (Story Lock) behavior entirely would leave
  the spec silently wrong on two fronts §14 and §16 already made claims
  about (voice continuity, repair semantics). Full section-file-depth
  documentation (e.g., a dedicated section-17 for voice casting) was judged
  out of scope for this pass — flagging for a follow-up sync if the team
  wants section-file-level depth here.
- **section-02 (contracts-persistence-assets) was NOT updated**, even
  though it's the stated "shape owner" for new persistence contracts by
  section-13's own convention. The new columns (`adBannerPlan`,
  `voiceConfig`, `qualityPolicy`, `visualIdentityJson`) are confirmed to
  exist in `drizzle/schema.ts` and are documented at the point of use in
  spec.md and section-05/16, but section-02's own "Data Model"/"Core
  Contracts" enumeration was not extended to list them. Flagged as a
  follow-up.
- **section-07 (audio-dialogue-subtitles) and section-10 (UI redesign)**
  were not touched. Voice Chain detail lives only in spec §14.2; deep-draft
  UI and tie-in Overview badges are described in spec §8.2.3/§13.2 but not
  mirrored into section-10's implementation record. Flagged as follow-up if
  section-file-level implementation detail is wanted for these.
- **`vertical-drama-preset-synthesizer` and `vertical-drama-shot-video-prompt`
  skill folders** are acknowledged to exist (§10.1 note) but their contracts
  were not investigated — they predate this sync pass's task list and were
  out of scope for the A-K deltas.
- Ad Banner Overlay was placed as **§13.2/§13.3** (subsections of the
  existing §13 Product Tie-In chapter) rather than a new top-level §-number,
  to satisfy "place logically near §13" without renumbering §14-§23 and
  every cross-reference to them throughout the document — a renumbering
  that size was judged too high-risk for a documentation-only pass with no
  code-side verification step available.

## Unverifiable / TODO Claims

None of the A-K delta claims were left unverifiable — every headline fact
(flag names, queue name, preset ids, tier thresholds, finding kinds, subtitle
preset ids, tenant rollout state, share-links disk status) was grep/psql
-verified against the actual repository and database, not taken on faith
from the planning docs. The planning docs were used for narrative framing
(why a decision was made) but every concrete noun/number in the spec traces
to a `grep`/`sed`/`psql` command run during this session.
