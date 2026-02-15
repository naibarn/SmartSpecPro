# Section 04 Code Review Interview

## Auto-fixed (obvious improvements)

1. **HIGH: ENVIRONMENT defaults to "development"** → Changed default to "production" (fail closed) in `oidc_auth.py`
2. **HIGH: Sync gRPC call in async function** → Wrapped `client.create_task()` with `asyncio.to_thread()` in `cloud_tasks.py`
3. **HIGH: Silent None concatenation for env vars** → Changed `os.environ.get()` to `os.environ["KEY"]` for required vars (GCP_PROJECT_ID, GCP_REGION, CLOUD_RUN_PYTHON_URL)
4. **MEDIUM: Missing vi.resetModules() in cloudTasks.test.ts** → Added to beforeEach block
5. **HIGH: dispatchJob never called from call sites** → User chose "Wire in now" → Replaced both `dispatchToCelery()` call sites (lines 374, 977) with `dispatchJob()`. Feature flag defaults to false so Celery remains default path.

## User decision

6. **HIGH: dispatchJob() defined but never wired into call sites** → User chose "Wire in now" → Applied fix in auto-fix #5 above

## Let go (not worth fixing in this section)

7. OIDC middleware ordering (middleware filters by path, functions correctly)
8. TASKS_INTERNAL_TOKEN timing attack (dev-only path, not production)
9. email_verified claim check (SA tokens always have this set)
10. Payload validation on stub handlers (will be added when business logic is connected)
11. Test coverage gaps vs plan spec (tests match current stub implementation; deeper tests with business logic)
12. Feature flag caching (premature optimization for migration flag)
13. Video queue routing logic (business logic, not dispatch mechanism)
14. Dynamic imports in dispatchJob (matches file's lazy import pattern to avoid circular deps)
15. setInterval cleanup not removed (will be done when Cloud Tasks handlers have business logic)
16. Polling task after Kie submission (dependent on handler business logic being connected)
17. DLQ `_check_dead_letter` never called (called when handler business logic is connected)
18. DLQ not writing to cloud_task_events (TODO in stub, implemented with business logic)
19. Handler stubs without business logic (scaffolding for migration; logic connected when feature flag is enabled)
