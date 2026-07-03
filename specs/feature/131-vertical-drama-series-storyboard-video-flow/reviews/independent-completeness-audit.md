# Independent Completeness Audit

Date: 2026-07-03
Auditor: fresh multi-agent pass (independent of the prior self-review / spec-completeness-round-2 PASS)

## Method

Six parallel auditors each cross-checked a slice of the authoritative `spec.md`
(2710 lines, §1–§22) against `claude-plan.md` and the nine section files, WITHOUT
trusting the earlier "PASS" reviews. Every reported gap was re-verified with grep
before fixing (no false positives). Nine parallel fix passes then closed the gaps
with additive-only edits; `claude-plan.md` was updated for the cross-cutting items.

## Result

GAPS FOUND: 45 (≈11 HIGH, ≈24 MEDIUM, ≈10 LOW) — all closed.

Root pattern: the section-level deliverables (what implementers follow) under-specified
exact contracts/enums/constants/named-types that `spec.md` pins; several requirements
were absent from BOTH the sections AND `claude-plan.md` (i.e. dropped from the source
spec during synthesis), which a self-review could not surface.

## Gaps Closed By Section

| Section | Notable gaps closed |
|---|---|
| section-01 | §10.3 `VerticalDramaValidationErrorReport`/debug snapshot + repair-on-failure; §10.2 full skill metadata defaults; §10.1 preserved capability flags; §6.9/§6.10 nested output-field + enum-vocab fixtures + separate metadata namespace; `fallback_prompt_only` label |
| section-02 | §7.4 fallback profile `vertical_drama_60s_9_shots` `[8,8,8,4,8,8,4,8,4]` + validation; §7.6 `VerticalDramaMemoryKind` (9 values incl. `retcon_proposal`); `MemoryRetrievalPolicy`/`SeriesPolicy`/`SeriesBible`; lossless upstream input + `target_age_group`; `AssetRecordSnapshot` parity; §11.5 `RunResult`/`VideoRoutingDecision`/`NormalizedEpisodeInput`/`ProviderCapabilities`/`Warning` |
| section-03 | §8.2 create-series wizard steps; §8.1 series-list fields + Thai button; §8.3 full workspace tab set |
| section-04 | §7.6 retcon semantics + memory-bundle compaction/fatigue; §11.5 failed-validation rule; §15 archive + blanket idempotency |
| section-05 | `single_frame_per_shot` mode; image-model reason codes; three regeneration controls; §6.4 per-frame QC checklist/repair template/video-input manifest; non-destructive failed-crop repair |
| section-06 | §12.1 deterministic idempotency key + `episodePlanHash`; `extraParams.source` literal + full ID set + skill IDs; `companionAudioUpdatedAt`; §8.5 episode-panel display fields |
| section-07 | dialogue `mode` + `audioStrategy` enum; native-audio-vs-TTS regeneration messaging |
| section-08 | provider adapter interface + 4 named adapters (incl. deterministic `MockVideoProvider`); §9.2 runtime config + tenant beta defaults; `timed_out` + stable error mapping; §16 QC `score`/`passed` + required-checks list + continuity/tie-in QC stages; tie-in disclosure + mandatory approval + `productSource` provenance; bearer-token/webhook-secret safety |
| section-09 | §12.2 provider job IDs + stable statuses ingestion; `assemblyManifestId` link-back; fallback-profile trim/timing |

## Verification

| Check | Result |
|---|---|
| `check-sections.py` | state `complete`, progress `9/9`, no missing, no warnings |
| `check-ui-contracts.py` | 9 section files checked, 9 UI-affecting |
| Term-presence sweep | all previously-absent HIGH terms now present in section files |
| Markdown integrity | code-fence parity balanced in all edited files |

## Round 2 — Spec-Internal Integrity & Consistency Re-Check

Date: 2026-07-03 (same day, second pass)

Round 1 treated `spec.md` as authoritative and only checked plan coverage. Round 2
turned the lens on the SPEC ITSELF (internal contradictions, undefined types,
ambiguities) plus a consistency re-check of the round-1 parallel edits. Four
auditors: spec-internal integrity, GitHub-guide parity depth, cross-cutting
security/data/staleness, and post-edit drift. Every finding was grep-verified;
several agent claims were rejected as false positives.

### Rejected (false positives, verified against repo/spec)
- "Astryx is an undefined UI term" — Astryx IS a real repo dependency (package.json, main.tsx). No change.
- "Seedance 2.0 alias has no backing model" — Seedance 2.0 exists in the repo model registry. No change.
- "Assembly manifest sub-objects unspecified" — `VerticalDramaAssemblyManifest` is fully typed at §7.3 (ffmpegConcatPlan/subtitlePlan/audioBgmPlan/exportSettings). No change.

### Spec defects fixed in `spec.md` (15)
- **HIGH** undefined/renamed types: `VerticalDramaProviderRoutingDecision`→`VideoRoutingDecision`; `qcReports: VerticalDramaQcReport[]`→`VerticalDramaQcResult[]`; added defs for `VerticalDramaCharacterDelta`, `VerticalDramaApprovalState`, `VerticalDramaVideoClipProviderRequest`, `VerticalDramaProviderDownloadResult`, `VerticalDramaLocation/Relationship/Prop`; bound `EpisodeScript/Shotgrid/StartFramePlan/MotionPromptPack` to §6.9; added missing `productReferenceAssetIds` field.
- **MEDIUM** contradictions: §8.4 dialogue/audio stage reordered to follow start-frame approval (canonical §11.1); collapsed `fallback_text_to_video`/`fallback_prompt_only` to one app outcome + raw; added upstream→app age-group mapping.
- **MEDIUM** cross-cutting: added §11.7 `VerticalDramaAuditEvent` (paid-gen/approval/repair/archive), §12.3 soft-archive/orphan-prevention rule, and per-episode max-spend enforcement.
- **LOW**: dropped orphan `targetEpisodeCount: 50`; canonicalized Veo model IDs vs parity term; disambiguated duplicate `### 7.2` headings (7.4–7.6 anchors preserved).

### Plan consistency fixed
- `claude-plan.md §5` stage list now uses the canonical `VerticalDramaPipelineStage` enum (it had invented a non-canonical 15-step narrative with "contact-sheet"/"QC" as standalone stages).
- `section-06` `assemblyManifestId` (+ other spec-optional extraParams) moved out of "required at handoff creation" — it is back-filled at assembly, so requiring it at creation contradicted section-09; `shotNumber` (required) / `clipNumber` (optional) aligned to spec §12.

### Round-2 verification
- Renamed/undefined types: all resolved (each now defined exactly once; drift refs = 0).
- `check-sections.py` complete 9/9, no warnings; `check-ui-contracts.py` 9/9.
- Code-fence parity balanced in `spec.md` (96), `claude-plan.md`, and edited sections.
- Round-1 shared identifiers re-confirmed consistent across all 8 families.

## Round 3 — UI/UX Deep Audit (history, prompts, repair, simplicity)

Date: 2026-07-03 (third pass, UI-focused)

Four auditors targeted the four user-stated UI requirements: (1) complete & easy /
not complex, (2) always look back at old history, (3) view prompts, (4) actually
repair a problematic image. 26 gaps found — the data model was history-complete, but
the BROWSE/ACTION UI was thin. All closed via 6 per-section fix passes plus spec §8.6/§8.7
and claude-plan §9 additions.

### #2 History (biggest structural gap — "ย้อนดู history ตอนเก่า ๆ ได้ตลอด")
- **Run history**: `listEpisodeRuns` procedure + Runs sub-list + read-only Run Detail route `/episodes/:episodeId/runs/:runId` rendering any past run's full artifact ledger (section-04/03/09).
- **Version lineage**: per-shot/frame supersede chain browsing with old-vs-new compare + re-select (section-05/06).
- **Memory timeline**: `listMemoryEvents` + Memory tab as append-only event timeline incl. past retcon proposals (section-04).
- **Candidate archive**: replaced/unselected candidates stay viewable (section-05).
- **Always available**: history/review surfaces render read-only for completed episodes & archived series (section-03).

### #3 Prompts ("ดู prompt")
- **Re-view prompts used** for completed runs (per shot/cell/clip), not just pre-generation (section-06/04).
- **Editable video prompt + append-only edit history** (`editedByUserId`/`editedAt`/original) (section-06).
- **Image-side prompts in the SB panel** (contact-sheet/per-cell/negative + candidate lineage), formatted (not raw JSON) payload preview (section-06).

### #4 Repair ("สั่งซ่อมภาพที่มีปัญหาได้จริง" — 2 blocking HIGH closed)
- **Repair-instruction dialog** on the frame card / ApprovalBar, wired to the repair route with exact target + user instruction → new non-destructive version (section-05/04).
- **Clickable QC `recommendedRepairs`** pre-filled with action/instruction/target (section-06/08).
- Per-candidate reject/flag with reason; repair job status/result + credit confirm before paid repair (section-05/08).

### #1 Simplicity ("เข้าใจง่าย ไม่ซับซ้อน")
- 15 stages grouped into ~4 labeled phases with ONE `next_action` CTA (section-04).
- Progressive tab disclosure (fresh series shows Overview+Episodes) (section-03).
- Retcon-proposal review/approval surface (a required decision that had no UI) (section-04).
- Breadcrumbs (Series › Episode › SB), approval action states, wizard states, stage-runner reduced-motion.

### Round-3 verification
- `check-sections.py` complete 9/9, no warnings; `check-ui-contracts.py` 9/9 (all UI-affecting).
- Code-fence parity balanced in all 8 edited files.
- New surfaces/procedures grep-confirmed present; spec §8.6/§8.7 give the plan its spec basis.

## Round 4 — Feature Addition: Sub-Shot Decomposition (edited-cut video feel)

Date: 2026-07-03 (fourth pass — new capability requested)

Added an opt-in capability so each main shot can be decomposed into 2-5 **sub-shots**
(short quick-cut sub-clips) for an edited, real-footage feel with faster scene changes,
instead of one stretched 8-second motion. Design invariants: sub-shot durations SUM to the
parent main-shot duration, the episode stays 60s, and the storyboard stays 9 shots/frames —
so the default (flag off) is unchanged.

- **Spec anchor (`spec.md`)**: new §7.4 "Sub-Shot Decomposition" with `VerticalDramaSubShotPolicy`
  + `VerticalDramaSubShot` contracts and timing/provider/degrade rules; §6.5 `sub_shot_plan`
  output + clip `parent_shot_number`/`sub_shot_number`; §12 extraParams sub-shot fields; §16 QC
  sub-shot checks + `repair_sub_shot`/`adjust_sub_shot_timing`; §17 flag `verticalDramaSeriesSubShots`;
  §8.4 sub-shot editor note.
- **Design**: default `auto` mode targets 2-3 per shot, option to raise `maxPerShot` to 4-5,
  `minSubShotSeconds` floor ~1.2s, `N = min(target, floor(D/minSubShotSeconds))` so short shots get
  fewer cuts. Opt-in flag (default off) + capability-gated: each sub-shot becomes its own short
  provider clip only when the provider supports it; otherwise degrade "as feasible" (fewer cuts, or
  collapse to the single parent clip) with a recorded reason.
- **Propagated** to section-01 (skill `sub_shot_plan`), 02 (contracts + validation), 03 (flag + editor
  surface), 04 (motion-prompt-stage planning; no new pipeline stage), 06 (per-sub-shot handoff tasks +
  editable panel), 07 (dialogue/subtitle timing spans cuts), 08 (routing decomposition + capability gate
  + QC + repair), 09 (assembly concatenates ordered sub-clips), plus claude-plan §7/§12.

### Round-4 verification
- `check-sections.py` complete 9/9, no warnings; `check-ui-contracts.py` 9/9.
- Code-fence parity balanced across spec.md + claude-plan + all 8 touched sections.
- Flag `verticalDramaSeriesSubShots` consistent across spec §17, section-03, claude-plan §12 (14 flags total).
- `VerticalDramaSubShot`/`SubShotPolicy` defined once in spec and mirrored in section-02; `transitionIn`
  enum consistent; timing invariant (sum-to-parent, 60s, 9-shot) asserted across 7 files; flag-off = no
  regression stated in every touched section.

## Residual Risk

Planning artifacts are now complete against `spec.md` at the exact-field/enum/constant
level, `spec.md` is internally consistent (no undefined types, no contradictory stage
orders), plan↔spec identifiers agree, and the UI covers full history browsing, prompt
visibility/edit history, end-to-end image repair, and a simplified phase-grouped flow.
Runtime implementation (deep-implement) must still verify model/provider capabilities
against the live model registry, as the prior review noted. Component names vary slightly
between claude-plan and section files (e.g. RunHistoryPanel vs RunDetailView) — harmonize
at implementation time.
