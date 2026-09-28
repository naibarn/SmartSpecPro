<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && npx vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-flags-modules
section-02-presence-contract-reconcile
section-03-presence-downstream-prune
section-04-object-contract-ledger
section-05-object-previous-shot-injection
section-06-drafting-and-prompt-skills
section-07-qc-verification-rollout
END_MANIFEST -->

# Implementation Sections — Feature 140 (VD Shot Fact Continuity)

Source: `../claude-plan.md` + `specs/feature/140-vertical-drama-shot-fact-continuity/spec.md`.
All work is in `apps/web`. Lands **after** the P1 branch
(`planning/vd-p1-identity-scene-continuity/`) — see `../claude-plan.md` §4.

Two tenant flags, both default **false**:
`verticalDramaShotPresence` (sections 02–03, it *subtracts* characters from renders)
and `verticalDramaShotObjects` (sections 04–05, it only *adds* context). Separate
because their blast radius differs and they must roll back independently.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| 01 foundation (flags + 2 pure modules) | – | all | – |
| 02 presence contract + reconcile | 01 | 03, 06 | Yes (with 04) |
| 03 presence downstream + prune | 02 | 07 | No |
| 04 object contract + ledger | 01 | 05, 06 | Yes (with 02) |
| 05 object + previous-shot injection | 04 | 06, 07 | No |
| 06 drafting + prompt skills | 02, 05 | 07 | No |
| 07 QC + verification + rollout | 03, 06 | – | No |

## Execution Order

1. **01** — foundation (nothing else may start first)
2. **02** and **04** — parallel; different files, different flags
3. **03** (after 02) and **05** (after 04) — parallel
4. **06** — needs both contracts to exist before teaching them
5. **07** — joint verification, flag-off parity, rollout

## Section Summaries

### section-01-foundation-flags-modules
Register both tenant flags (four sites each) and build the two pure modules:
`shotPresence.ts` (enum, lenient resolver defaulting to `in_frame`, in-frame filter)
and `shotObjectLedger.ts` (the deterministic episode-wide fold plus the two fact
renderers). Zero call sites — flag-off byte-identity is trivial here by construction.

### section-02-presence-contract-reconcile
The core of failure (A). Adds `presence` to the draft and storyboard character
entries, then fixes the deterministic reconcile in
`verticalDramaStoryboardGeneration.ts:899-952`: the substring match stops feeding
`required_character_refs`, and the speaker force-add becomes presence-aware.
`speakingOrder`, `required_character_count` and the camera-widening remap all count
only `in_frame`.

### section-03-presence-downstream-prune
Everything that must stop re-adding what section 02 excluded: the repair pass's
union-merge becomes presence-aware, a user-invoked `pruneNonPresentCharacterRefs`
mutation cleans existing episodes, the fail-closed portrait guard stops blocking
renders for `voice_only` characters, and the new
`VD_START_FRAME_UNSTAGED_CHARACTER` warning closes VD's long-standing asymmetry
(it warns when a character is missing, never when one is wrongly present).

### section-04-object-contract-ledger
Adds `objects[]` to the draft shot, builds the episode object ledger from the shot
drafts, and persists it — including the `projectStartFramePlan` carry-over without
which it dies on the next plan regeneration. Settles the one open design question:
how this ledger relates to Feature 138's scene-level `activeProps`.

### section-05-object-previous-shot-injection
The phone→SLR fix. Two fact lines (established objects; `from_object` causal link)
plus the `previous_shot` reference-only block threaded into the per-shot prompt —
which is what finally makes `## 10. CONTINUITY LOCKS` an obeyable instruction rather
than an order issued without the data.

### section-06-drafting-and-prompt-skills
Teaches the three skills the new facts: the architect must name instruments and
declare `voice_only`; the storyboard skill's "speaker must be in frame" rule gains
its carve-out; the cinematic-narrative skill's continuity rule is bound to the real
`previous_shot` block by a gate that fails if either side is removed.

### section-07-qc-verification-rollout
The object-drift warning, the flag-off parity proof across every touched builder, the
two-shot phone/photo regression as an acceptance test, the real-LLM gate additions,
and the rollout/rollback runbook.
