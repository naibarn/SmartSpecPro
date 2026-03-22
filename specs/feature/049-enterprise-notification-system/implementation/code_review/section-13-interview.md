# Section 13 Code Review Interview

## Auto-fixes Applied

### 1. Wire `checkNotificationHealth()` into monitoring router (HIGH)
- Added `notificationHealth` admin procedure to `monitoring.ts` router
- Now callable via `trpc.monitoring.notificationHealth.useQuery()`

### 2. Wire `recordBroadcastRequest()` into admin-broadcast handler (HIGH)
- Added calls in success path and catch path of `/api/internal/notifications/admin-broadcast`
- Error rate counter now functional

### 3. Race guard in Redis pub/sub probe (MEDIUM)
- Added `let resolved = false` guard with `settle()` wrapper to prevent double-resolve
- Prevents unhandled events from late-firing subscribers after timeout

### 4. Multi-worker limitation comment (MEDIUM)
- Added comment documenting that `broadcastCounter` is per-worker

## Items Let Go

- **Menu test location**: Moved to `apps/web/shared/__tests__/` because vitest config only covers `shared/**/*.test.ts`, not `packages/`. This is the correct location for testability.
- **`main.tsx` routes**: Routes exist in `App.tsx` from prior sections (09, 07). The section spec assumed `main.tsx` but the project uses `App.tsx` for route definitions.
- **`any` type in notificationStream**: Pre-existing code, not our change.
- **SSE eviction race**: Pre-existing code, not our change.
- **Structured audit logging**: Acceptable with current logging infrastructure.
