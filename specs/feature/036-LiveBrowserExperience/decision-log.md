# Decision Log

## Step 2 - Review mode

- Options considered: `external_llm`, `self_review`
- Decision taken: `self_review`
- Mode used: `auto`
- Rationale: Environment validation succeeded for the plugin root, but no external review credential was available (`gemini_auth` missing and `OPENAI_API_KEY` unset). The skill requires review, so self-review is the valid fallback.

## Step 4 - Session setup script resolution

- Options considered: fail on the documented `setup-session.py` path, resolve the plugin-specific setup script
- Decision taken: use `scripts/checks/setup-codex-session.py`
- Mode used: `auto`
- Rationale: The checked-in plugin variant exposes `setup-codex-session.py` and supports `self_review`, which matches the required workflow. Failing on the documented path would have blocked planning for a tooling mismatch rather than a product issue.

## Step 5 - Decision mode

- Options considered: `ask_every_choice`, `smart_auto`, `auto_by_default`
- Decision taken: `smart_auto`
- Mode used: `asked`
- Rationale: User selected `smart_auto`, so high-impact planning decisions will be surfaced while low-impact workflow choices are auto-resolved.

## Step 7 - Web research scope

- Options considered: topics `1-5`, `skip`
- Decision taken: `apply_all`
- Mode used: `asked`
- Rationale: User requested all proposed web research topics, so the plan will incorporate transport, runtime coordination, security, UX, and reconnect guidance instead of relying only on local codebase patterns.

## Step 8 - Phase 1 entry surface

- Options considered: `new_workspace`, `extend_automation_modal`
- Decision taken: `extend_automation_modal`
- Mode used: `asked`
- Rationale: The user wants lower adoption friction in Phase 1 and prefers reusing the current automation creation flow before introducing a separate dedicated workspace later.

## Step 8 - Phase 1 transport

- Options considered: `novnc_stack`, `managed_live_browser`
- Decision taken: `managed_live_browser`
- Mode used: `asked`
- Rationale: The user prioritizes faster delivery and lower infrastructure risk over owning the live viewport stack immediately.

## Step 8 - Phase 1 scope

- Options considered: `user_owned_sessions_only`, `include_workflow_attached_sessions`
- Decision taken: `user_owned_sessions_only`
- Mode used: `asked`
- Rationale: Restricting Phase 1 to owner-user sessions keeps permissions, lifecycle management, and support complexity under control.

## Step 8 - Persistence strategy

- Options considered: `db_backed_live_sessions_now`, `redis_runtime_first_db_later`
- Decision taken: `db_backed_live_sessions_now`
- Mode used: `asked`
- Rationale: The user prefers canonical durable ownership, auditability, and recovery semantics now, with Redis used only for runtime coordination and caching.

## Step 8 - Admin attach

- Options considered: `disabled_phase1`, `domain_admin_observe_only`
- Decision taken: `disabled_phase1`
- Mode used: `asked`
- Rationale: The user wants Phase 1 to bias toward privacy and compliance simplicity; admin observation can follow after policy and audit trails are proven.

## Step 14 - Review integration

- Options considered: auto-apply all review items, auto-apply low-impact items and ask on high-impact architecture, defer integration
- Decision taken: auto-applied low-impact test and ownership clarifications; pending user confirmation on runtime-hosting choice
- Mode used: `auto`
- Rationale: Under `smart_auto`, low-impact items should be integrated directly, while the runtime boundary for authoritative live sessions is a high-impact architectural choice that needs user confirmation.

## Step 14 - Runtime hosting choice

- Options considered: `dedicated_live_runtime`, `celery_orchestrated_runtime`
- Decision taken: `dedicated_live_runtime`
- Mode used: `asked`
- Rationale: The user selected a dedicated long-lived Python runtime for authoritative live sessions, which better matches lease management, reconnect handling, immediate command processing, and recovery than Celery-style finite task execution.
