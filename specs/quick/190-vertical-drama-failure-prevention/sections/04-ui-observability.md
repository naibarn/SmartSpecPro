# Section 04 — UI, Accessibility, and Observability

## UI/UX contract

### Target user

ผู้สร้าง Vertical Drama ที่ต้องตัดสินใจว่าจะ review policy candidate หรือ resume งานที่หยุด และ operator ที่ต้องแยกปัญหา application/provider/worker

### Surface inventory

- `VerticalDramaDeepStoryDraftsPanel`: primary status, candidate/recovery banner, confirmation CTA
- episode/storyboard review: affected shot and preserved candidate
- admin/ops view: job correlation, heartbeat age, queue/domain mismatch, recovery attempts
- notification/action link: กลับไปยัง series/job เดิม ไม่สร้าง submission ใหม่

### Component and state matrix

| State | User sees | Allowed action |
|---|---|---|
| running | phase, round, last progress | wait/cancel only if supported |
| policy_blocked | shot, field, rule, preserved candidate | review/edit; no media |
| detector_uncertain | evidence and explanation | review/explicit accept only under policy contract |
| recoverable | completed/remaining, checkpoint time | one owner-scoped resume |
| no_checkpoint | cannot safely resume | start a new intentional run |
| worker_stalled | infrastructure reason and last checkpoint | resume/retry only when guard passes |
| draining | deployment in progress | wait; no new submission |
| operator_review | correlation and next step | operator action |
| succeeded | result and audit pointer | view/use result |

### Responsive and accessibility requirements

- banner and evidence readable at narrow viewport without hiding the primary reason
- Thai/English copy stays semantically equivalent
- `aria-live` announces state transitions without repeating long evidence
- CTA has focus order, disabled/pending state and keyboard confirmation
- color is supplementary to text/icon; high-risk and infrastructure states are distinguishable without color

### Observability contract

Emit structured, redacted events keyed by `tenantId/seriesId/jobId/dispatchId/runId`:

- safety decision and detector version
- repair attempt/result and candidate state
- checkpoint/heartbeat age
- BullMQ/domain reconciliation outcome
- recovery CTA result and credit decision
- readiness/drain transition

## Proof

Component/router tests, browser evidence for every state, metric query examples, alert dry run และ correlation จาก incident fixture
