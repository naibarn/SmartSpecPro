# Spec: Recurring Execution and Notifications

## Goal

Turn composed agency flows into recurring automation that delivers outputs and alerts reliably.

## In scope

- Schedule creation from natural-language requests
- Recurring run orchestration
- Execution windows and staggering
- Per-item completion status for multi-output jobs
- In-app alerts and email notifications
- Timezone and local-time semantics
- Missed-run policy, catch-up behavior, and skip rules
- Idempotency, duplicate suppression, and retry boundaries
- Daily quota / expected-output semantics for jobs like “2 presentations every morning” or “5 videos per day”
- Partial rerun and backfill behavior

## Existing anchors

- Chat scheduling and alert parsing
- Notification/email infrastructure
- Existing alert and task failure services

## Dependencies

- Requires `04-agency-flow-composer`
- Requires destination/project semantics from `03-destination-and-project-resolution`

## Provides to later splits

- Recurring automation substrate
- Delivery and user notification semantics
- Retry and status model for daily jobs

## Required output from deep plan

- A production-grade schedule contract that includes timezone, cadence, run window, catch-up policy, and idempotency keying
- A delivery model for multi-output jobs with `expected`, `in_progress`, `completed`, `failed`, and `partial` states
- Notification triggers for:
  - run started
  - item completed
  - run partially completed
  - run failed
  - run skipped
- Guidance for when to materialize outputs immediately versus when to wait for a daily batch threshold
- User-facing lifecycle operations for already-created recurring programs
- Notification preference model for user-level and program-level delivery behavior

## Key decisions to make in deep plan

- Whether recurring schedules target an agency definition or a resolved run template
- How to model per-day expected output count and partial completion
- What alert granularity is acceptable by default
- How the system behaves after downtime or quota exhaustion

## Lifecycle operations

Deep plan should define how users can operate recurring automation after creation, including:

- pause and resume
- edit cadence and execution window
- override or skip a specific day
- rerun only failed or missing items
- backfill historical windows when appropriate
- stop or archive the recurring program without deleting produced outputs

## Notification preferences

Deep plan should define notification controls such as:

- item-by-item alerts vs daily summary
- success-only vs failure-only vs mixed notifications
- in-app vs email channel preferences
- quiet hours and batching windows
- dedupe rules to avoid excessive alerts for high-frequency recurring programs
