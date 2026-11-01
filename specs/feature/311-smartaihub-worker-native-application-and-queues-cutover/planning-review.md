# SPEC-311 practical consistency review — 2026-11-01

Review scope: normative requirements, eight implementation sections, dependency ordering and planned verification. Documentation review only; no runtime proof.

- All 20 explicit requirement IDs map to sections and planned positive/negative tests.
- Clarified that Worker-native excludes proxy-to-Container/legacy-origin execution; health/deploy completion cannot close acceptance.
- Kept unsupported native/Python agent dependencies as explicit cutover blockers; no automatic Container exemption or unauthorized agent-runtime replacement.
- Kept database hosting, development tenant execution and administration access unchanged; added shared-db consumer ownership/fencing and rollback requirements.
- Queue ack follows durable settlement/responsibility transfer; retries cannot be represented as exactly-once transport. Preserve side-effect reconciliation.
- Auth/email and Queue work can progress after the foundation without waiting for all domain features. Shared Worker entrypoint/context changes are serialized during implementation.
- Completeness is inventory-based, not a sample of familiar screens; dynamic/new active endpoints reopen coverage. Discovery is intentionally the first section because no exhaustive inventory has yet been proven.
- Readiness and production traffic interlocks remain in existing controls. The 24-hour Staging soak must outlive former Container/profile boundaries, with real dependencies unavailable and authorized recipients/test data.

Open implementation uncertainties: actual complete active inventory; Worker compatibility for password/2FA/SMTP and Python Agents API dependencies; actual existing Hyperdrive/network binding permissions; native render dependencies; measured performance/cost thresholds. These are assigned to sections, not represented as completed proof.

Next action: section 01 inventory/portability/database spike. Owner request in this turn is specification creation, not execution of all eight sections or production traffic changes.

Verification record (quick profile, baseline e9aa827c788acbb9967accc2b3f4b5616ed28d7b, 2026-11-01T00:18Z): fresh host resource evidence showed 24,247 MiB available memory. `check-sections.py --planning-dir <SPEC-311>` confirmed eight planning section files and valid manifest; its “complete” describes section documents, not implementation. Scoped document checks confirmed 20 unique normative requirement IDs mapped to eight sections, valid internal Markdown links/JSON, and all runtime requirements OPEN. Canonical handoff validation and generated-index consistency checks passed; completion eligibility correctly remains false. No application tests, build, database mutation, deployment or DNS change was performed for this documentation task.
