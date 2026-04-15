# Section 03 - Intake Normalization And Routing Boundaries

## Goal

Implement intake normalization so business work can enter the platform from chat and non-chat sources without becoming chat-dependent.

## Scope

- Normalize intake from chat, forms, API, webhook, document, and scheduled-trigger entry points.
- Classify each intake into work type, requester, business domain, urgency, risk, approvals, and default owner or queue.
- Route low-confidence intake into triage.
- Ensure consequential runs cannot exist without a linked work item.

## Implementation Notes

- Keep intake normalization on the web control plane.
- Preserve traceability from intake source to request and case.
- The output of this section should be a canonical request/case/task path that later sections can enrich.

## Likely Files

- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/teamWorkItem.ts`
- `apps/web/server/routers/*intake*` or new router files
- `apps/web/server/services/*intake*` or new service files

## Tests First

- Assert a non-chat intake path creates a `work_request` and `work_case`.
- Assert classification populates work type, requester, domain, urgency, risk, and default owner or queue.
- Assert low-confidence intake routes to triage.
- Assert consequential runs cannot exist without a linked work item.

## Acceptance Notes

- Chat is only one intake surface, not the data model.
- The platform can accept business work from multiple channels without splitting lifecycle state.

## Implemented Files

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`

## Deviation

- The first pass normalizes intake through the Work OS router and service boundary; deeper chat/form/webhook-specific UX entrypoints remain for a later UI pass.
