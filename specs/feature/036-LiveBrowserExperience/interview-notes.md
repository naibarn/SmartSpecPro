# Interview Notes

## Q1. Which entry surface should Phase 1 use?

`entry_surface: extend_automation_modal`

Lower adoption friction for phase 1; reuse the existing creation flow and add a dedicated workspace later if usage expands.

## Q2. Which live browser transport approach should Phase 1 use?

`phase1_transport: managed_live_browser`

Faster to ship and lower infra risk than owning a noVNC stack early.

## Q3. How broad should Phase 1 session scope be?

`phase1_scope: user_owned_sessions_only`

Keeps permissions, lifecycle, and support simpler for v1.

## Q4. How should runtime state be persisted?

`persistence: db_backed_live_sessions_now`

Worth doing now for canonical ownership, auditability, recovery, and future admin/policy controls; use Redis only as runtime/cache.

## Q5. Should admin attach be enabled in Phase 1?

`admin_attach: disabled_phase1`

Safer for privacy/compliance in v1; add admin observe after session policy and audit trails are proven.
