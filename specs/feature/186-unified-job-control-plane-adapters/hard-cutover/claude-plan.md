# Hard Cutover Implementation Plan

## Section 01 — gateway and registry

Add a producer-facing `ControlPlaneJobGateway` that accepts server context,
registered job type, canonical definition, and idempotency key. Add a typed
executor registry and adapter registration/resolution. The gateway must reject
unregistered job types and client-selected queues/adapters. Add tests for
server-derived scope, duplicate create, definition conflict, and registry
lookup.

## Section 02 — outbox runtime

Add a bounded publisher runner around the existing outbox primitive. It must
poll due rows, claim with the existing publisher lease, resolve a registered
adapter, continue past poison rows, and expose safe stop/start behavior. Wire
the runner into the existing runtime behind an explicit feature flag and add
tests for batching, backoff, quarantine, shutdown, and no publish before commit.

## Section 03 — generic executor consumers

Add generic BullMQ and Celery consumer entrypoints that accept canonical
envelopes, validate contract versions, load context, claim, call the registry,
and report through the fenced executor. Add duplicate delivery, stale lease,
unsupported version, cancellation, and handler error tests.

## Section 04 — first producer wave

Migrate low-risk Node producers (maintenance, delivery, webhook, automation,
and embedding where its domain contract is verified) to the gateway. Preserve
existing domain handlers behind registered compatibility executors. Ensure the
legacy queue receives the canonical envelope through the adapter, not a direct
business submission. Add per-wave flags and manifest entries.

## Section 05 — Python/Celery bridge

Add a Python gateway client/port and thin Celery wrapper compatible with the
Node control-plane API. Migrate low-risk Python API/task producers first, then
media/import/workflow families only when their handler and settlement bindings
are explicit. Preserve task IDs as dispatch references. Add focused pytest
coverage for context, duplicate delivery, and retry separation.

## Section 06 — inventory gates and rollout evidence

Extend the inventory checker to distinguish approved adapter calls from
unmigrated producers and emit machine-readable wave status. Update the manifest
with owners, flags, drain rules, and evidence. Add structural checks that fail
when a migrated producer imports or calls transport APIs directly. Run focused
tests, migration verification, and the inventory audit; do not run typecheck.

## Dependency order

01 → 02 → 03 → 04 → 05 → 06. Sections 04 and 05 may use the shared gateway only
after sections 01–03 pass. Provider-heavy families remain explicitly blocked
until their side-effect evidence is available.

## Rollback

Disable the wave flag for new work, allow or quarantine in-flight canonical
jobs according to the drain rule, and preserve all committed job/event/
settlement history. Never delete transport records to simulate rollback.
