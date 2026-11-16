# Section 04 — Live UX, DEV Deploy and UAT

**Requirements:** R37-04 through R37-07
**Objective:** Enroll the existing Runner under a separate DEV identity, execute one genuine harmless Codex task, and verify exact Mission/Task evidence.

**Owned scope:** Isolated Modular Runner config/data root; DEV-only Mission/Task integration if needed; focused integration and browser evidence; R03.7 handoff/traceability.

**Prerequisites:** Sections 01–03 pass and modular DEV DB/runtime is healthy.

**Deliverable:** Actual Harness heartbeat, canonical Mission-bound Job/Attempt/Session execution, real Codex result/events/receipt, exact Task Control deep link and verified modular DEV release.

**Completion predicate:** The exact job is visible under the actual Harness in LIVE Mission Control, opens the exact Task/Attempt with preserved return context, contains only captured evidence, and navigation creates no work. DEV deployment source SHA and health are confirmed.

**Verification/evidence:** Redacted canonical IDs, activity/event cursor, genuine output receipt, Mission/Task browser navigation, target ID and release source SHA; owner UAT only through normal MFA flow.

**Fallback/blocker strategy:** Never convert failed runtime execution into synthetic success. Continue deployable independent code; report pairing or authenticated UAT as pending when no authorized browser session is available.

**Dependencies:** Section 03. **Acceptance:** Completion requires real DEV evidence; synthetic prototype records are explicitly excluded.
