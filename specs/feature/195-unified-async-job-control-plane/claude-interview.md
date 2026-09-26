# Feature 195 Interview

## Decisions

- User approved implementation of all six specs without further confirmation.
- Feature 195 is first because every later feature requires durable execution truth.
- Existing `worker_jobs`/outbox and Feature 186 migration patterns are authoritative; no parallel queue or job ledger.
- Whole-repository typecheck is prohibited because of RAM constraints.
- Focused tests, migration safety and explicit unresolved environment proof are required.

## Cross-spec contract

Feature 195 provides Job admission, lifecycle, attempts, lease/fencing, event/outbox and cancellation contracts to Features 196–200. It does not own Goal/Plan, Runner device identity, Chat UX, MCP upstream management or Agent provider sessions.

