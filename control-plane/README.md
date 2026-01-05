# Control Plane (Unified P1–P3 + Security Hardening)

This service is the **authoritative state** for SmartSpec sessions.
It provides:
- Projects / Sessions / Iterations
- Task Registry (+ deterministic dedupe)
- Reports + Artifacts (R2/S3 presigned PUT/GET) with DB ownership checks
- Test/Coverage/Security result intake
- Gate Evaluator (tasks/tests/coverage/security)
- Apply approval tokens (audited, one-time)
- Audit log + per-token rate limiting + log redaction

## Quick Start (Docker)
Use `docker/docker-compose.control-plane.yml` (Postgres + Control Plane).
Then:
1) `pnpm i`
2) `pnpm prisma migrate dev`
3) `pnpm dev`

## Auth
- Server-to-server API key is used ONLY to mint scoped JWT.
- Client MUST NOT have API key.
- Mint:
  `POST /api/v1/auth/token` body `{ apiKey, scope: { projectId?, sessionId?, role } }`

## Important
- Presign-get requires the artifact to exist in DB and belong to the session.
- Presign-put creates a pending artifact record; finalize with `/artifacts/complete`.
