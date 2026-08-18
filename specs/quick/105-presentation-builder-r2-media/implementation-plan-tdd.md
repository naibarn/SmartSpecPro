# TDD Guidance

1. Add service tests first for managed URL pass-through, provider URL download/upload, idempotent task identity, R2-disabled failure, and expired provider URL failure.
2. Add `aiPresentationService` tests proving a completed image/video task uses the durable URL and that the media scheduler has at most one active slot.
3. Add pending-media tests proving a durable URL replaces the target element and an unreachable/failed task becomes a retained text-only/unavailable state rather than a provider URL.
4. Add router/error-boundary tests for server-only path errors and client tests for the builder's failed/expired slot copy and retry action.
5. Run focused Vitest files, then `git diff --check`; report repository-wide baseline diagnostics separately if present.

Mocks should isolate `mediaGenerationService`, `storagePutFromPath`, provider download, Redis progress, and deck persistence. No live provider or R2 credentials are required for tests.
