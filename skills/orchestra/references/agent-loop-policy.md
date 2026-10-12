# Agent Loop Policy

Autonomous development should continue through ordinary errors instead of stopping because of arbitrary iteration, tool-call, repair-round, or estimated-cost counters. The goal is delivered code and a testable preview.

For each ready slice: **implement → focused check → protected integration → build/preview → test/debug → repeat**. A failed test, missing development migration, merge conflict, unavailable optional verifier or stale base triggers technical repair or a better strategy. After two identical no-progress attempts, change the approach rather than retrying blindly.

Resource and platform capacity should be respected; do not spawn uncontrolled parallel agents or exceed an explicit user-provided spending limit. If a tool has genuine hard execution limits, checkpoint state and use the existing authorized continuation mechanism; never interpret an arbitrary skill counter as human approval being required.

At each completed wave/checkpoint and before a known context/session boundary, **write** the existing `orchestra/progress.md` (or the existing WorkUnit HandOff for non-Orchestra tasks): what works, worktree/base/commit/Main SHA, active step, open defects, tests actually run, and exact next action. Keep `orchestra/backlog.md` aligned with pending work; use the existing [progress template](loop-progress-template.md) without arbitrary counters. No separate gate ledger is required for routine work. Human escalation is for a concrete missing product choice or external permission, not for 'continue fixing it'.
