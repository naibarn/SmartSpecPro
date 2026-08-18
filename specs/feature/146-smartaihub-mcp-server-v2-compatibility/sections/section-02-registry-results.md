# Section 02 — Unified tool registry, aliases, schemas, and results

## Scope

Own registry metadata and normalized result/error contracts. Existing execution
functions remain the business source of truth.

## Current anchors

- `apps/web/server/_core/mcpRegistry.ts:3262-3438` contains media generation,
  status, cancel, and history tools.
- `mcpRegistry.ts:2808-2837` contains models and credits tools.
- `mcpRegistry.ts:3821-3870` contains Remotion submit/status/cancel.
- `mcpRegistry.ts:4287-4292` emits basic annotations.
- `mcpRegistry.ts:4468-4520` lists and executes tools.

## Required design

Extend one registry entry with canonical name, aliases, output schema/version,
scopes, cache policy, result type, audit action, and feature availability.
Preserve all `smartspec.*` names. Add guide aliases only where semantics are
unambiguous, with a single canonical executor and both requested/canonical names
in audit. Do not create a generic alias that conflates media task IDs and
Remotion worker job IDs without an explicit `kind`.

Required aliases/adapters: image.generate, video.generate, models.list,
account.get_balance, render.get/list/cancel where the existing job-kind mapping
is safe. Implement `credits.estimate` against the model/credit service, not a
client price.

Every visible tool must have bounded inputSchema, outputSchema, annotations,
required scopes, idempotency mode, and an LLM-usable description. The result
adapter emits the modern structured result/cache contract and a compatible
legacy projection. Tool errors are sanitized public codes; protocol errors stay
JSON-RPC errors.

The registry snapshot must be partitioned by principal/tenant/scope/flag/era
and schema revision. A cached `tools/list` result must never cross those
boundaries; list-change notifications remain false until invalidation and push
semantics are implemented.

## TDD contract

Add schema snapshots covering names, aliases, required input, output schema,
annotations, scope, idempotency, and read/write behavior. Test alias equivalence,
unknown-field rejection, missing idempotency, result/error mapping, private
cache scope, and no provider/internal error leakage.

## Exit criteria

`tools/list`, static catalog, docs generation, and any compatibility manifest are
generated from the same registry snapshot. No alias duplicates business logic or
bypasses availability/scope checks.

## Implementation status — 2026-08-17

Implemented in `mcpRegistry.ts`:

- Canonical entries project output schema, schema revision, cache scope,
  annotations, and audit action metadata.
- Guide aliases resolve to canonical handlers before availability, scope,
  delegated-manifest, and idempotency checks.
- `render.get`, `render.list`, and `render.cancel` require explicit
  `kind=remotion`; `render.list` reuses the canonical Remotion status
  availability/scope gate before querying owner-scoped jobs.
- `credits.estimate` is a non-charging server-side projection of the existing
  gateway pricing service.
- Published bounded input schemas are enforced before canonical execution;
  required fields, types, limits, enums/const values, nested arrays/objects,
  and `additionalProperties: false` are covered by the registry validator.
- Guide aliases are independently rollout-gated and cannot be executed by
  guessing their names while hidden.

The alias surface does not create a second job, credit, or artifact authority.
Durable behavior remains in the existing media/worker services.
