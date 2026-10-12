# Completion Loop

Use this for **ongoing development and later gap closure**, not as an extra gate before every commit or merge.

1. Identify the next incomplete section or observable functional gap.
2. Implement or repair it; run a focused check and integrate a coherent checkpoint through the existing protected Git path.
3. Build/preview when applicable, test behavior, and repeat the debug/fix loop.
4. Record what completed, current step, `resume_from` (the earliest **actually incomplete** step), unfinished requirements, unrun checks, external dependencies, changed files/commits, and next actions in the existing HandOff. For an existing Orchestra multi-wave session, update `orchestra/progress.md`, `orchestra/backlog.md` and `orchestra/lifecycle.md` if present; do not replace their prior authoritative evidence.
5. Stop only the affected work path when an actual external permission/product decision or repository-required protection prevents it; continue independent ready work.

On retry/resume inspect state and actual files/commits, invalidate only affected evidence, and redo the smallest failing step; never discard completed unaffected work. A seven-stage ledger, mandatory TDD round, mandatory reviewer round, clean-round quota, or absence of **all** open gaps is **not** a prerequisite to integrate useful development code. Report `IMPLEMENTATION_COMPLETE`, `VALIDATION_PENDING`, and `ACCEPTED` distinctly; do not label pending verification as passed.
