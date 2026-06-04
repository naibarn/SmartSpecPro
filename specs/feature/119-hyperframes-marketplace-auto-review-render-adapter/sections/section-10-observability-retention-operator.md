# Section 10: Observability, Retention, and Operator Controls

## Goal

Make HyperFrames render jobs supportable in production through metrics, traceability, retention policy, safe diagnostics, and permission-gated operator actions.

This section prevents the new worker/runtime from becoming a black box.

## In Scope

- Structured metrics and logs.
- Correlation and trace IDs.
- Retention and purge service.
- Operator inspect/replay/cancel/template controls.
- Audit events.
- Safe diagnostics and redaction.

## Files To Create

- `apps/web/server/services/hyperframesOperatorService.ts`
- `apps/web/server/services/hyperframesRetentionService.ts`
- `apps/web/server/services/__tests__/hyperframesOperatorService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRetentionService.test.ts`

## Existing Files To Touch

- `apps/web/server/services/hyperframesRenderService.ts`
- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- audit/logging helpers if present
- worker/job registration code if metrics hooks are centralized

## Test First

Add failing tests for:

- correlation fields flow from API request to outbox/job, worker, artifact, timeline, Library, and audit metadata;
- raw signed URLs, local paths, stack traces, and secrets are redacted;
- operator inspect requires permission and returns sanitized diagnostics;
- replay rejects stale input hashes and unauthorized users;
- cancel requires permission and preserves completed Library items;
- template disable/enable is audited and affects template registry projection;
- dry-run purge returns counts without deleting;
- retention purge removes only eligible preview/transient artifacts and preserves Library/audit records.
- retention defaults match every HyperFrames artifact kind and purge skips Library-owned, active, locked, or retry-grace artifacts.

## Observability Fields

Every render job should carry:

- `traceId`;
- `correlationId`;
- tenant ID;
- user ID;
- product ID;
- auto review run ID;
- render job ID;
- outbox job ID;
- artifact IDs;
- Library item ID where finalized;
- composition input hash;
- template ID/version;
- platform profile;
- credit/idempotency refs;
- worker attempt number;
- failure category.

## Metrics

Track at minimum:

- jobs queued;
- jobs started;
- jobs completed;
- jobs cancelled;
- transient failures;
- permanent failures;
- dead-letter count;
- average queue time;
- average render duration;
- QA failure categories;
- Library finalize success/duplicate/failure;
- purge counts.

Use existing metrics/logging conventions if the repo already has them.

## Retention Policy

Retention classes and defaults:

| Artifact kind | Retention class | Default retention | Purge behavior |
|---|---|---|---|
| `hyperframes_input_json` | `review` | 30 days for unconfirmed preview; retained with Library item if finalized | purge raw product/evidence details after expiry unless referenced by final Library provenance |
| `hyperframes_composition_html` | `review` | 7 days for preview, 30 days for draft, retained only as hash/manifest for final Library | purge HTML body; keep hash/template/version metadata |
| `hyperframes_snapshot` | `temporary` or `review` | 7 days for preview, 30 days for failed QA, retained for golden fixtures only when explicitly marked | purge files and mark artifact row deleted/expired |
| `hyperframes_render_mp4` / `hyperframes_render_webm` | `review` or `library` | 7 days for preview-only, retained by Library policy after save | preview files purge after expiry; Library files follow Library retention/deletion rules |
| `hyperframes_subtitle_vtt` | `review` or `library` | same as paired render | purge with paired render unless saved to Library |
| `hyperframes_manifest` | `audit` | 90 days for failed/preview, retained with Library item for finalized output | redact private URLs before long retention |
| `hyperframes_sanitized_log` | `audit` | 30 days for normal failures, 90 days for dead-letter/operator replay | keep sanitized text only; never retain signed URLs |

Purge requirements:

- purge by tenant/run/artifact kind and retention class;
- never delete Library-owned artifacts through preview cleanup;
- preserve content hashes, template refs, product/run IDs, and manifest refs needed for provenance;
- skip purge when a render job is active, locked, or inside retry grace period;
- retry transient storage failures and dead-letter purge failures for operator review;
- include dry-run counts before destructive purge.

Expose dry-run purge before destructive purge.

## Operator Controls

Operator actions:

- inspect sanitized diagnostics;
- replay dead-letter job;
- cancel queued/running job;
- disable template;
- enable template;
- dry-run purge;
- repair artifact metadata only if safe and audited.

Operator APIs must be permission-gated, audited, and unavailable to normal product users.

## Acceptance Criteria

- Support can trace a user-facing render status to worker and artifact state.
- Unsafe diagnostics are redacted.
- Retention can be dry-run and tested.
- Exact retention defaults and skip rules are covered by tests.
- Operator replay/cancel cannot violate tenant, stale-hash, or permission checks.
- Template disable takes effect without deploy when the registry supports runtime state.

## Rollback Notes

Disable operator actions except inspect/cancel if needed. Retention purge should not delete durable Library assets.

## UI/UX Contract

### Target User / JTBD

Users need safe user-facing status while operators need sanitized diagnostics and controls to support failed render jobs.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | status and safe diagnostics |
| Storyboard Review | retry/fallback and QA diagnostics |
| Operator/admin tools | inspect, replay, cancel, template controls |
| Library | retention does not remove durable assets |

### Component Map

| Component | Observability dependency |
|---|---|
| Render panel | safe status and failure category |
| Timeline | correlation-ready stage events |
| Operator inspect | sanitized diagnostics |
| Purge/retention UI if added | dry-run counts and audit state |

### State Matrix

| State | Expected UI behavior |
|---|---|
| transient failure | retry if allowed |
| permanent failure | safe reason and fallback |
| dead-letter | operator-only replay path |
| template disabled | user blocker and Standard fallback |
| purge dry-run | counts without deletion |
| purge complete | durable Library unaffected |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | user-facing diagnostics remain concise |
| tablet | issue summaries stack |
| desktop | operator detail views can show structured diagnostics |

### Accessibility Acceptance

Failure categories, retry/cancel actions, and operator controls must be keyboard accessible and not color-only.

### Copy Contract

User copy is sanitized and concise. Operator copy can be more detailed but still redacts secrets, signed URLs, local paths, and stack traces.

### Browser Evidence Required

Browser or component evidence must cover user failed states and any operator UI added in implementation.
