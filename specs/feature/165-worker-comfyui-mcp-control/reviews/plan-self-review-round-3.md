# Plan self-review round 3 — testability and tooling

Status: PASS after fixes.

- Removed the Jest-only `--runInBand` command from the Web test gate; the plan
  now uses focused Vitest patterns followed by the repository test script.
- Rust tests remain inline Cargo tests, while Web tests remain Vitest/jsdom.
- Each section has TDD cases, an implementation exit criterion, and a final
  integration gate. Provider credentials/GPU and browser evidence are marked
  environment-dependent instead of being implied by local tests.
