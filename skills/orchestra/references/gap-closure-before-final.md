# Gap Closure

Do not turn an ordinary gap into an instruction to stop development or postpone integration.

- **Fix now** when a specific defect prevents the current independently useful checkpoint from compiling or passing a real repository-required check, or when directly exposed code has a demonstrated critical security/data boundary defect.
- **Fix in a later review/debug iteration** for UI polish, screenshots, noncritical behavior, integration tests, incomplete sections, migrations not yet needed by the current slice, and ordinary acceptance gaps. Keep an owner and next action in the existing HandOff.
- **Wait only for genuine external authority** needed for the exact affected operation; continue unrelated sections.

After each useful repair, run a focused check and integrate the checkpoint. Full SPEC completion requires later verification of all applicable requirements, but development integration does not. Summaries must distinguish what works now from gaps still pending.
