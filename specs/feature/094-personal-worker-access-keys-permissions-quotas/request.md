# Request

Build a user-facing worker access control plane so each user can self-service the workers they own.

Key requirements:

- Add a dedicated tab in user Settings where a user can create worker access keys, list them, revoke them, and set optional expiry.
- The created key must be unique, not reused, and shown only once at creation time.
- The key is handed to Hermes, OpenClaw, ZeroClaw, or future compatible worker runtimes so they can register back into SmartSpecPro.
- The system must record enough metadata about the worker and its host/runtime for later audit and debugging.
- The UI and help content must be available in English and Thai.
- After registration, the user must be able to define permissions and credit quotas for the worker.
- Quotas must support hourly, daily, weekly, and monthly limits, with optional no-limit behavior.

Repository context:

- SmartSpecPro already has worker registration, worker runtime metadata, worker budget enforcement, bilingual help content, and a Settings page with tabs.
- Existing patterns should be reused instead of building a separate control plane.

Non-negotiables:

- Fail closed on tenant boundaries and ownership.
- Do not reveal worker access secrets after creation.
- Keep permissions explicit and auditable.
- Keep the solution flexible enough for Hermes, OpenClaw, and future worker families without hard-coding Hermes-only logic.
