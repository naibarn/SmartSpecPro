# Decision Log

## Planning depth

Decision: standard quick-plan.

Reason: the change spans the tRPC hook, auto-report service, feedback processor, media-job helper, and focused tests, but requires no schema migration or UI implementation.

Promotion trigger: promote only if provider-credit context cannot be represented safely at the existing report boundary or if a migration becomes necessary.

## Implementation decisions

- Use a pure classifier module so threshold and provider-routing rules are unit-testable without a database.
- Treat explicit provider-account credit evidence as critical admin escalation.
- Use 3,000 as the unknown threshold; explicit media is the only exception up to 10,000.
- Keep ordinary user-credit failures out of `feedback_tickets` entirely.
- Use existing notification group keys and `/credits`; do not add schema or dependency changes.

## Self-review rounds

1. Completeness: covered user, suspicious, provider, unknown, and unrelated failures.
2. Contradictions: reconciled the 5,000 general anomaly guidance with explicit media <=10,000 and unknown <=3,000 policy.
3. Security: preserved tenant-scoped admin lookup and existing sanitized diagnostic fields.
4. Abuse/failure modes: preserved best-effort swallowing, deduplication, and flood guards; added no client-controlled escalation fields.
5. Obvious missing improvement: included media-job generic admin bypass and critical-priority preservation.

No unresolved `[AUTO-FIX]` items remain.
