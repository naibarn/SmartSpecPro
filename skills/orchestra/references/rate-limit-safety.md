# Rate-Limit & Overload Safety

Read this before and during any multi-wave dispatch. Applies to all hosts.

Orchestra already caps concurrency (max 4 agents per wave). This reference adds the
missing failure-handling half: what to do when the API pushes back.

## Hard stop conditions

Stop dispatching immediately and do NOT blind-retry when any of these occur:

- A sub-agent Result Report indicates a rate-limit / HTTP 429 / "usage limit
  reached" / overloaded / "server error after partial output" outcome.
- Two or more agents in the same wave fail with throttling/overload errors.
- A sub-agent stalls with no output past the host's stall timeout.

## Response protocol

1. **Halt the wave.** Do not start the next wave or re-dispatch failed agents yet.
2. **Preserve partial work.** Record each agent's returned partial result and exact
   error in `orchestra/progress.md` (Claude Code now returns a subagent's partial
   work to the parent on rate-limit cutoff — capture it).
3. **Report clearly to the user** with: which wave, which agents/roles, which model,
   the exact error class, and how much of the wave completed. Then STOP.
4. **Resume only on user go-ahead**, and when resuming, reduce fan-out (e.g. 4 → 2),
   prefer sequential execution for the remaining tasks, and stagger dispatch.

## Preventive defaults

- Keep first-wave width at the concurrency cap only when tasks are truly disjoint;
  otherwise start narrower.
- Route all non-planning work to GPT-5.6 Terra per `references/model-routing.md`; reserve
  GPT-5.6 Sol for planning-only packets so a broad agent wave does not consume planning
  capacity unnecessarily.
- Remember subagent-heavy runs can use ~7x the tokens of a single thread — treat a
  sudden burst of 429s as a signal to serialize, not to retry harder.
