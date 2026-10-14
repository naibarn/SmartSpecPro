# Section 04 — Working UI Acceptance

**Owned paths:** disposable Mini-App fixture and existing Agents SDK/browser UAT harness only.

**Prerequisites:** Sections 01–02 allow an authorized local run. Use a non-production fixture and subscription adapter already present.

**Deliverable:** one visible UI behavior implemented, tested, repaired after a deterministic defect, resumed after interruption, and verified in a reachable browser with a developer-facing preview link and durable evidence.

**UI/UX Contract:**
- User/job: developer asks for a small usable Mini-App UI change and receives the running result.
- Surface: isolated app preview, one real interaction/state transition.
- States: loading, ready, changed/success, validation/error, resumed.
- Responsive: desktop and mobile viewport retain usable controls and readable output.
- Accessibility: keyboard operation, visible focus, semantic controls and labels.
- Copy: clear English labels/errors for this fixture; no user-facing authorization internals.
- Browser proof: real click/input and resulting state, no page/console errors; trace and screenshot bound to source SHA/run ID.

**TDD:** deterministic UI behavior test plus browser UAT; first injected failure is repaired and retested.

**Acceptance:** final verification receipt refers to exact workspace/source, tests, browser run and preview URL; local evidence is not SPEC-224 protected Runner acceptance.

**Risks:** unreachable preview/runtime is a capability blocker, not browser PASS.

**Merge readiness:** fixture-only change, scoped verification and normal protected integration.
