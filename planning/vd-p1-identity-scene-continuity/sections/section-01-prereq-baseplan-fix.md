<!-- SECTION: section-01-prereq-baseplan-fix -->

# Section 01 — Current baseline recapture

The filename is retained for manifest compatibility. The historical `basePlan`
router fix is obsolete in the current checkout and must not be implemented.

## Deliverables

- Re-resolve current symbols and record HEAD SHA/date.
- Recapture focused video-prompt and start-frame suite file lists.
- Store fail sets before changes; compare identities, never only counts.
- Record TypeScript errors by file/code/message for later delta comparison.
- Document the known focused failure: stale expectation of two LLM executions while
  the current bounded fallback path makes four.
- Update `baselines/README.md`, Gate A/B lists and fail-set artifacts using current
  evidence.

## Procedure

1. Run the narrow existing suites from `apps/web` with the basic reporter.
2. Capture full output before extracting fail names; never pipe the live run through
   `tail`.
3. Confirm the suspected stale assertion by reading the current fallback loop and
   test, but do not change production code in this section.
4. Record unrelated/pre-existing failures separately.
5. Freeze refreshed commands and fail sets for sections 02–15.

## Done when

- Baseline artifacts name exact command, SHA, date, exit code and failing tests.
- No implementation source file changed.
- Every later section can perform a fail-set identity diff against this capture.

## Implementation record — 2026-08-01

- HEAD: `9eda150ce11fecdc673d8505095e76435219cc22`.
- Gate A: 5 failed / 261 passed; canonical failures stored in
  `baselines/gate-a-failset-current.txt`.
- Gate B: 57 failed / 610 passed; canonical current set stored in
  `baselines/gate-b-failset-after.txt`.
- Typecheck: 63 existing errors; changed-surface comparison is required later.
- Production source changed: none.
- Review: baseline-only section complete; no MUST_FIX gap found. The old count-based
  claims are retained only in README audit history.
