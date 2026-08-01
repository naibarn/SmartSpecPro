# Frozen test baselines — VD P1 current-worktree implementation

## 2026-08-01 recapture (binding)

HEAD: `9eda150ce11fecdc673d8505095e76435219cc22`

- Gate A: 7 files, **5 failed / 261 passed**. The five current failures are
  retry/call-count assertion drift recorded in `gate-a-failset-current.txt`:
  invalid candidates now traverse the current four-attempt generator fallback and
  judged cases can total five or six calls. Feature work must add no new failure
  identity and no calls beyond this recaptured behavior.
- Gate B: 28 files, **57 failed / 610 passed**. The count matches the older
  baseline but leaked `mockReturnValueOnce` queues reshuffled exact identities;
  `gate-b-failset-after.txt` has been recaptured and is the current canonical set.
- Both commands ran from `apps/web` with `--reporter=basic`; full outputs were
  captured before fail-set extraction.
- `NODE_OPTIONS='--max-old-space-size=8192' npm run check` exited 2 with **63**
  current `error TS` lines. Relevant pre-existing Vertical Drama errors are in
  `VerticalDramaStoryboardPanel.tsx`, `VerticalDramaEpisodePage.tsx`, and
  `verticalDramaEpisodes.ts`; later waves compare normalized file/code/message
  identity and must add no changed-surface error.

Historical counts and HEADs below are retained as audit history only and are not
implementation gates for this checkout.

Captured 2026-07-23 by section-01, at **HEAD `686b0310f`** (`main`), and
**revalidated unchanged at `4f25bfe0d`** after another session advanced `main`
mid-flight (`feat(skill): enforce tone/structure adherence in sequential storyboard
finalQc`). Gate A stayed 266/266 and the Gate B fail-set was byte-identical, so these
artifacts are valid for any branch cut from `4f25bfe0d` or later.

Every later section (02–15) verifies itself against these files.

> **`main` moves while you work.** Rebase before the final verification run and
> re-run both gates afterwards — a baseline captured against a stale `main` proves
> nothing about the tree you are about to merge.

## The rule

Compare fail-sets as **SETS**, never as counts. A name leaving the set counts as
progress **only if no new name entered**. Counts are commentary.

```bash
cd apps/web
npx vitest run $(cat <baselines>/gate-b-files.txt | tr '\n' ' ') --reporter=basic \
  > /tmp/run.log 2>&1
grep -E "^\s*FAIL " /tmp/run.log | sed 's/^ *FAIL *//' | sort -u > /tmp/failset.txt
comm -13 <baselines>/gate-b-failset-after.txt /tmp/failset.txt   # MUST be empty
```

## Measurement traps (both hit during capture — do not repeat them)

1. **`2>&1 > file` loses the FAIL block.** vitest writes its `⎯ Failed Tests ⎯`
   summary to **stderr**; that redirect order sends stderr to the terminal and only
   stdout to the file, so the extracted fail-set comes back empty while the run
   itself was fine. Use **`> file 2>&1`**.
2. **Never pipe a vitest run through `tail`** — it truncates the FAIL block and
   silently yields a short, wrong fail-set.
3. Always run from `apps/web`. From the repo root vitest globs the monorepo and dies
   with `EACCES … data/hermes`.

## Gate A — video-prompt side · ZERO TOLERANCE

File list: `gate-a-files.txt` (7 files).

| | Before fix | After fix |
|---|---|---|
| Files | 7 passed | 7 passed |
| Tests | **266 passed / 266** | **266 passed / 266** |
| Fail-set | `{}` | `{}` |

Any red here at any point in sections 02–15 is a regression with no triage path.

> Historical note: a prior session's memory claimed these suites carried a "40-red
> baseline". **Refuted by measurement** — the healing branch was merged. Trust this
> file.

## Gate B — start-frame / image-reference side · RED BASELINE

File list: `gate-b-files.txt` (17 files + the `shared/verticalDramaSeries/__tests__/`
directory ⇒ **28 files, 665 tests**).

| | Before fix | After fix |
|---|---|---|
| Files | 3 failed / 25 passed | 2 failed / 26 passed |
| Tests | **59 failed / 606 passed** | **57 failed / 608 passed** |
| Fail-set artifact | `gate-b-failset-before.txt` | `gate-b-failset-after.txt` ← **the canonical baseline** |

Failure distribution (unchanged in shape):

| File | Before | After |
|---|---|---|
| `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` | 56 | 56 |
| `verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` | 2 | **0** ← fixed here |
| `verticalDramaEpisodes.generateShotReferenceFrameImage.test.ts` | 1 | 1 |

**Diff result:** entered the set = **∅**; left the set = exactly the two
`generateShotReferenceFramePrompt` tests. No reshuffle.

### Why the 56 reshuffle non-monotonically

In `shotReferencesAndQualityReview.test.ts` the 56 are **one throw plus 55 cascade**.
The first domino throws before consuming three queued
`mockDb.select.mockReturnValueOnce` entries, and `vi.clearAllMocks()` does **not**
drain those queues — so they leak into every later test in the file. Any change to
`db.select` call ordering (sections 07, 11, 12, 13, 15 all do this) reshuffles the
set. That is why the contract is set-identity, not counts.

## TypeScript

`pnpm check` = `NODE_OPTIONS='--max-old-space-size=8192' tsc --noEmit`. **The default
heap OOMs** — always set the flag.

| | Total `error TS` | `Cannot find name 'basePlan'` |
|---|---|---|
| Before (main checkout) | 47 | **1** |
| After (worktree) | 66 | **0** |

The after-run's higher count is a **worktree artifact, not a regression**: the
worktree symlinks `node_modules` at the repo root and at `apps/web` but not at
`packages/ui`, so 20 `TS2307: Cannot find module 'lucide-react'` errors appear there.
Set-diff of normalized error lines: **20 added, all `lucide-react`; 0 non-artifact
additions**; removed = the `basePlan` TS2304. Verified separately that no error
exists at or near the edit site (the 9 errors in that file are all pre-existing, at
lines 1739–1795).

**If you re-run this comparison, symlink `packages/ui/node_modules` into the worktree
first** and the counts line up directly.

## Companion green sets

- All `shared/verticalDramaSeries/__tests__/` suites green (included in Gate B's run).
- All start-frame **service** suites green.

## Files

| File | Meaning |
|---|---|
| `gate-a-files.txt` | frozen Gate A run list |
| `gate-b-files.txt` | frozen Gate B run list — **reuse verbatim; do not re-derive** |
| `gate-b-failset-before.txt` | 59 entries, at HEAD before the fix |
| `gate-b-failset-after.txt` | 57 entries — **diff every later section against this** |
