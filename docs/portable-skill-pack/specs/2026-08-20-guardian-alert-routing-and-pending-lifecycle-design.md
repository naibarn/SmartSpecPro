# Guardian alert routing and pending lifecycle

## Problem

System-generated feedback was being correlated to open Guardian incidents by
loose title keyword matching. A feedback notification could therefore open
`/admin/system-guardian?incident=<id>` even though the user needed the Feedback
Hub. High-priority duplicate system tickets could also reopen a modal alert.
Guardian pending counts were not scoped the same way as the pending list, and
expired critical approvals remained `pending` indefinitely.

## Design

1. Feedback notifications always target the Feedback Hub. Any linked incident
   remains structured metadata and is not used as the primary action target.
2. Incident correlation accepts only an explicit incident reference in the
   ticket context. Missing references remain unlinked rather than guessed from
   title text.
3. Duplicate system tickets remain auditable but do not create another admin
   alert. Human-submitted feedback continues to notify normally.
4. Direct Guardian notifications carry a structured incident action URL and
   tenant-scoped admin recipients. The Guardian page resolves `?incident=` and
   displays the linked incident. Global incidents (`tenantId IS NULL`) are
   visible to admins alongside incidents for their current tenant.
5. Pending approval count/list use the same tenant join and exclude expired
   approvals. The expiry worker marks all expired approvals, including critical
   ones, as `expired`; the linked incident remains available for triage.

## Compatibility and safety

The client repairs already-persisted feedback notifications whose structured
target still points to Guardian. No notification or approval rows are deleted,
and no schema migration is required. Approval decisions reject expired rows.

## Verification

Focused Vitest coverage covers legacy feedback deep links, explicit incident
references, duplicate alert suppression, and approval expiry. Typecheck and
changed-surface tests remain required before publication.
