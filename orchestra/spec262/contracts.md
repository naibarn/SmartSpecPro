# Spec 262 Implementation Contracts

## Wave 1: Section 02 foundations — independent files

### Shared interface
- `resolvePlatformRuntimeCapabilities(input)` returns an explicit ingress mode, canonical platform owner, validated operational capabilities, and a typed unavailable/conflict result. It must not return secrets.
- `MapContextEnvelope` is a strict, bounded, authority-neutral reference envelope with `surface: "emergency_map"`; server consumers must reauthorize references at use time.
- No consumer wiring is performed in this wave. The conductor owns later integration into canonical routing and existing Chat.

### Ownership boundaries
| Files | Owner |
|---|---|
| `apps/web/server/services/platformRuntimeCapabilities.ts`, `apps/web/server/services/__tests__/platformRuntimeCapabilities.test.ts` | platform resolver agent |
| `packages/shared/src/emergency/mapContext.ts`, `packages/shared/src/emergency/mapContext.test.ts` | map context agent |
| Existing `EmergencyRoutePage`, `FeedbackButton`, `ChatView`, route manifest, schema/journal and production configuration | conductor, later serial integration |

### Test boundary
- Resolver agent: pure tests for trusted Linux/tunnel and Cloudflare ingress, missing/conflicting config, ignored request headers, canonical DB/auth/outbox ownership, and no secret projection.
- Context agent: strict parser tests for valid refs, malformed/oversized input, geometry and unknown fields, no raw feature payloads.

### Impact boundary
- Existing app runtime config, managed-runtime contracts, Cloudflare proxy and route manifest: read-only inspection; no edits in this wave.
- No database schema or migrations are justified by these pure contracts.
- Existing shared route/API shape, Chat lifecycle, authz and `worker_jobs`/outbox remain unchanged.

### Dispatch metadata
- Model: `gpt-5.6-terra` for both non-planning implementation tasks.
- Mode: parallel batch; exact ownership paths do not overlap.
- Dependency edges: sections 02 foundations -> section 03 map UI/context wiring; no same-wave dependency.
