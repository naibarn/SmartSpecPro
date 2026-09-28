# TDD Guidance

## Tests first

1. Schema assertions: nullable `commentId`, read table unique/index contract.
2. Router tests: nested attachments, internal privacy, attachment ownership/
   image validation, closed reply/upload rejection, owner/admin close, mark-read
   tenant scope, unread ordering/filter/count.
3. Auto-close tests: closes stale active tickets, preserves recent/closed rows,
   and is idempotent.
4. Client tests: three-times preview class/structure, reply file selection and
   cleanup/link payload, nested reply images, lightbox opening/navigation,
   unread-first rendering, mark-on-open, closed composer, and fake-timer alert.

## Expected red conditions

- Current schema cannot associate comment images.
- Current `addComment` has no attachment IDs and current user detail would expose
  all attachments, including future internal-note attachments.
- Current list has no read receipt or unread ordering.
- Current composer has no file input and current owner page has no close action.

## Test setup

- Use existing Vitest/jsdom conventions for client tests.
- Use mocked Drizzle chains/callers following existing feedback tenant tests.
- Use fake timers for two-hour/30-minute alert behavior.
- Do not depend on external storage/provider calls; assert storage route inputs
  and protected-media component props.
