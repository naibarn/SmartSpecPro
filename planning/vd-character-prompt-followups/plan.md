# VD character prompt — three follow-ups from the 2026-07-31 audit

Date: 2026-07-31
Status: approved for implementation (owner: "แก้ไขให้ครบทุกข้อก่อน")
Source: the audit reported after fixing the media false-failure class.

## Item 1 — Series-default region has no deterministic enforcement (MEDIUM)

**Today:** an explicit per-character region gets four layers — fact in payload, instruction line,
validator retry (D1), and a code-side prepend fallback (D2, `ensureRegionEthnicityAnchorPresent`,
`shared/verticalDramaSeries/targetAudienceRegion.ts:376-384`). But D1/D2 are gated on
`resolvedCharacterRegion.isExplicit === true`
(`server/services/verticalDramaCharacterImageGeneration.ts` ~1229-1236, 2340-2356, 2593-2598,
2765-2781, 2957-2962). A character that inherits the **series-level default** region gets the
instruction line only — no safety net if the model ignores it.

**User-visible consequence:** someone who sets the region once at series level (and reasonably
believes they "already chose") gets weaker fidelity than someone who sets it per character.

**Fix:** extend the same D1 (validator + corrective retry) and D2 (anchor prepend) path to the
series-default source, not just `isExplicit`. The anchor keywords already exist for every region
(`VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_ANCHOR_KEYWORDS`), so this is reusing an existing guard,
not authoring new creative text. Keep the global hardcoded `"thai"` last-resort default OUT of
deterministic enforcement if it was never a user choice — enforce what the USER actually selected
(series-level or per-character), not a system fallback nobody picked. State clearly which sources
end up enforced.

## Item 2 — `LEAD_STAR_MARKERS` puts creative criteria + a numeric threshold in TypeScript (LOW→MEDIUM)

**Today:** `verticalDramaCharacterImageGeneration.ts:1523-1612` hardcodes vocabulary lists
(`LEAD_STAR_MARKERS`, `LEAD_APPEAL_MARKERS`, `LEAD_ROLE_DRIFT_MARKERS`) plus a numeric threshold
(`starSignals < 1 || appealSignals < 2`) in `findLeadPromptQualityIssues` (~1630-1695). It never
writes prose (so it is not the worst violation), but it grades the skill's output against a
checklist the skill was never given.

**Evidence it costs real money/latency:** journalctl 2026-07-31 09:59:43 and 10:00:32 —
`[vd_planning_retry] ... failed schema validation ... "must contain unmistakable camera-ready lead
beauty language (at least one role-specific star marker and two appeal signals); the skill output
reads too ordinary for a principal lead"` — for `google/gemini-3.1-flash-lite`, forcing retries.

**Decision — make the skill the AUTHOR and keep TS as the VERIFIER.** Not a straight deletion of
the gate (it was incident-driven), and not an LLM judge (adds cost/latency to every portrait).
Instead adopt the exact pattern the audit already blessed for ethnicity: the skill is explicitly
TOLD what a principal-lead portrait prompt must contain, and TS only verifies that what the skill
was instructed to produce is present. The bug today is a HIDDEN rubric; the fix is to publish the
rubric into `skill.md` so the model can actually satisfy it, and to source the vocabulary from one
place rather than a TS-private list.

Precedent: `targetAudienceRegion.ts:141-149, 367-374` — "TS computes/guards facts, the skill owns
creative prose."

Requirement: after the change, a reader must be able to point at `skill.md` and see the criteria
that the validator enforces. No criteria may exist only in TypeScript.

## Item 3 — Series title over-clamped to 100 chars (LOW)

**Today:** `clampDraftForCreateSeries` / `clampTitleAndToneForCreateSeries` (and the
`clampTitleOptionsForCreateSeries` helper added earlier today) clamp `draft.title` and every
`titleOptions` entry against `CREATE_SERIES_FIELD_LIMITS.genre` (**100**) even though the wizard's
title field accepts `CREATE_SERIES_FIELD_LIMITS.title` (**255**).

**CAUTION — this may be deliberate, verify before changing.** In the client,
`applyPresetDraft` feeds the resolved title into `resolveGenreAfterPresetDraft(prev.genre,
draft.category, resolvedTitle)`, i.e. the title can act as a GENRE fallback, and genre really is
capped at 100. Blindly raising the clamp to 255 could push an over-long value into the genre field
and reintroduce exactly the `too_big` BAD_REQUEST class fixed earlier today.

**Fix:** separate the two concerns — clamp the value destined for the TITLE field at 255, and clamp
only the value destined for the GENRE field at 100. Do not simply swap the constant. Add a
regression test proving neither field can exceed its own server limit.

Note the skill also instructs `"title" MUST be at most 100 characters`; if the runtime limit becomes
255, reconcile the skill prose so the instruction and the enforced limit agree (skill-first: the
skill states the creative guidance, TS enforces the transport bound).

## Hard constraints (all items)

- SKILL-FIRST: no creative rule, adjective vocabulary, or quality threshold may live only in TS.
- Additive/safe: no DB schema change, no migration.
- Both TH and EN for any user-visible string.
- Do not regress today's shipped fixes (genreHint clamp, premise rescue, mode-first wizard,
  media false-failure handling).

## Execution

Items 1 and 2 share `verticalDramaCharacterImageGeneration.ts` and the
`vertical-drama-character-visual-bible` skill → ONE agent, sequential.
Item 3 is confined to `verticalDramaPresetSynthesis.ts` (+ client clamp call sites if needed) →
separate agent, safe to run in parallel.

Dual-case skill trap applies to every skill edit: `skill.md` and `SKILL.md` must stay byte-identical.

## Verification

- Item 1: test that a series-default (non-explicit) region still yields a prompt containing the
  region anchor after a non-compliant model response.
- Item 2: test that the criteria live in skill.md and that the validator still catches a genuinely
  ordinary lead prompt; confirm the skill text now states the rubric.
- Item 3: test that a >100-char title reaches the title field intact while the genre-bound value
  stays <=100.
- Full affected suites green; `pnpm check` adds zero new errors (baseline 60 project-wide).
