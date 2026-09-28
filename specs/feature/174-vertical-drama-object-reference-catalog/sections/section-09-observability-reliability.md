# Section 09 — Observability and Reliability

## Goal

Make optional object operations diagnosable, bounded, and safe under failure.

## Implementation

- Emit structured tenant-safe events for catalog/asset lifecycle, detection,
  suggestions, projection, Special binding, prompt/image runs, capability
  denials, and typed failures.
- Redact private URLs/secrets and include IDs, revision, fingerprint, version,
  and redacted reason.
- Define retry/backoff/terminal state for advisory jobs, imports, prompt/image
  jobs, and Special reconciliation.
- Keep `reference_unavailable` request-specific and separate from provider
  health. Never retry forever or trigger paid work from detection/migration.
- Add report/metrics for stale, ambiguous, unclassified, and failed references.

## Tests first

Test event redaction, retry bounds, capability denial, provider-health
separation, and per-object failure isolation.

## Ownership and acceptance

Own shared reliability/event/report additions only; do not rewrite unrelated
provider or billing systems.

## Implementation Record

Implemented durable status/fingerprint/expiry fields, optional warnings,
capability gates, and lineage-safe recovery. Browser/live-provider telemetry is
kept as an explicit deployment gate rather than inferred from local tests.
