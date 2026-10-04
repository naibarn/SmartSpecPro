# Resource-aware verification policy

The purpose is to verify the task without allowing one finishing session to starve or crash other long-running sessions on the same host.

## Principle

Repository-wide health verification and per-session correctness are different concerns.

A parallel implementation session should normally execute only **scoped, bounded-cost verification**. Expensive global verification belongs to a serialized Integration Controller, dedicated CI runner, or quiet verification window.

## Lane selection

### FAST — low-risk isolated changes

Typical examples:

- display-only UI changes;
- layout/style/labels/visibility;
- localization/copy;
- documentation;
- static assets;
- isolated non-behavioral configuration metadata.

Default checks:

- `git diff --check`;
- inspect changed files and imports/exports;
- cheap targeted lint/syntax/component/unit test if already available;
- no full-repo typecheck;
- no full monorepo build;
- no E2E unless user-visible interaction changed and the harness is already available at low cost.

### TARGETED — isolated behavior changes

Examples:

- component state or event handling;
- isolated API/service logic;
- small route/handler changes;
- narrowly scoped shared helper behavior.

Default checks:

- directly affected unit/component/integration tests;
- package/subproject typecheck only if genuinely scoped;
- package/subproject build only if bounded and relevant;
- limit test worker concurrency when supported;
- no full-repo check by default.

### HEAVY_PENDING — shared/high-risk/global changes

Examples:

- package manifests or lockfiles;
- root compiler/build configuration;
- schema/migrations;
- auth/authorization/security/secrets;
- billing/credits;
- deployment/runtime bootstrap;
- shared cross-application contracts;
- broad core routing/state changes;
- repository policy that explicitly requires a global check.

Session behavior:

- run safe scoped checks;
- commit and push the branch;
- record the exact expensive gates still required;
- stop as `READY_FOR_HEAVY_VERIFICATION`;
- do not hold the implementation session open waiting for a quiet machine.

## Global heavy checks

Examples include full monorepo typecheck, full build, full test suite, all-browser E2E, dependency reinstall across the workspace, or any known command that causes high RAM/CPU pressure.

These MUST NOT be run automatically by a normal implementation session during parallel development.

Preferred execution order:

1. dedicated CI/external runner;
2. isolated integration/verification host;
3. serialized local heavy-verification slot during a safe resource window.

## Baseline failures

For FAST/TARGETED lanes, compare with baseline only when the comparison itself is bounded-cost. Do not double the cost of a dangerous global command just to prove it also fails on main.

If a global/baseline issue is unrelated and expensive to reproduce, record it as deferred for the controller.

## Escalation

Any FAST or TARGETED change becomes HEAVY_PENDING if it also changes:

- lockfiles/package manifests;
- global/shared compiler config;
- migration/schema files;
- security/auth/billing/deployment boundaries;
- shared runtime bootstrap or build tooling;
- a critical shared contract used by multiple applications.

## Goal

The system optimizes for both correctness and continuity:

```text
small session finishes quickly
+ long-running sessions keep running
+ expensive verification is serialized elsewhere
+ high-risk work still fails closed before main promotion
```
