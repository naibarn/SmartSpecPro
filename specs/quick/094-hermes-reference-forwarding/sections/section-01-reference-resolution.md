# Section 01: Reference resolution

Ownership:
- Hermes media reference resolver
- Vertical Drama Hermes start-frame call sites
- Focused service and router tests

TDD expectations:
- Reproduce the legacy prefixed-storage-key miss.
- Prove required references fail closed.
- Prove optional generic references retain current behavior.

Acceptance checks:
- Focused Vitest suites pass.
- TypeScript check passes for the web workspace.
- Production job payload has ordered non-empty references.

Risk:
- Broadening lookup must not weaken tenant/user ownership predicates.

