# Section 04 - Workflow and Agency Integration

## Goal

Allow Virtual Workflow and Agencies Swarm to invoke social video actions in the background without opening the UI.

## Scope

- Extend `builtin-social-actions`
- Inject `tenantId` server-side
- Route to `meta`, `tiktok`, or `youtube`
- Keep freeform query-to-payload mapping compatible with current behavior
- Preserve structured errors for unsupported actions

## Files Likely Touched

- `apps/web/server/routes/internalSocialActions.ts`
- `apps/web/server/routes/internalSocialTool.ts`
- `apps/web/server/routers/agency.ts`
- `python-backend/app/services/agency_tools.py`
- `python-backend/app/tasks/agency_creator_task.py`

## Acceptance Criteria

- Agency tools can invoke social actions without UI
- Workflow nodes can trigger provider-specific execution
- Unsupported provider/action combinations are blocked early
- Tenant isolation is preserved end to end
