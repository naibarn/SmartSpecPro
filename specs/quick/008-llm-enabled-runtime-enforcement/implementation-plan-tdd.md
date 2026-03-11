## Test Targets

- Add unit coverage for the new server-side enabled-model resolver.
- Extend router tests for translation and any touched router that previously defaulted to hardcoded models.
- Add service-level tests where practical for memory/scheduler fallback resolution.

## Expected First Failures

- Requests with no model configured should still be using hardcoded defaults.
- Persisted disabled model IDs should not reconcile to enabled defaults yet.

## Regression Checks

- Existing enabled-model admin/router tests still pass.
- Typecheck passes after helper adoption across mixed legacy/current modules.

