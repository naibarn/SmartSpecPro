# SPEC-312 R1.18 — modular development release evidence

**Release status:** deployed and service-smoke-verified
**Target:** `modular-debian-dev` / `https://aimarkethubs.com`
**Source SHA:** `e31402ecbbd12fe0c3bc23ae00dac89286c52a43`
**Release ID:** `modular-debian-dev-e31402ecbbd12fe0c3bc23ae00dac89286c52a43-responsive-chat-panels`
**Deployed at:** `2026-11-14T17:40:52.129041Z`

## Proven target boundary

Immediately before release, `apps/web/scripts/deployment-targets.json` resolved the target as the Modular SaaS development application on Debian systemd with local Workerd, port 3200 Core and shared development database `smartspec`. The deployment controller accepted only `modular-debian-dev` and the active tunnel config `/home/dev/.config/smartspec-dev/cloudflared.yml`. This release did not target `smartaihub.app` or production `smartsihub.com`.

## Build and release proof

- Canonical source lease verified the exact integrated SHA above.
- Frozen pnpm install and `build:core`, `build:shell`, `build:chat` passed; Wrangler dry-runs passed for all three components.
- Release controller returned `DEPLOYED_AND_VERIFIED`.
- Local checks: Core `200`, Chat `200`, Shell `200`, Chat manifest `200`, Chat entry `200`, unauthenticated Chat session `401` (expected).
- Public checks: Shell root `200`, Shell login `200`, Chat health `200`, Chat module manifest `200`, unauthenticated Chat session `401` (expected).
- Release artifact: `/home/dev/modular-development-releases/modular-debian-dev-e31402ecbbd12fe0c3bc23ae00dac89286c52a43-responsive-chat-panels`.
- Core artifact digest: `sha256:4ef831bf5c8eeb14aceed2b42992a22de136fec67df95f2301f0f2047009dda4`.
- Shell artifact digest: `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d`.
- Chat artifact digest: `sha256:67539e9bf52290f39e0eb91fee8f617009abafde21a3a1adfa828194fbe26bf3`.
- Rollback config and systemd drop-in snapshots are retained in the release's `rollback/` directory; legacy `smartspec-dev-web.service:3100` remains the rollback service.

## Remaining acceptance

These health checks prove deployment and module availability, not authenticated end-user behavior. Authenticated chat send with multiple image/text-file attachments and desktop/tablet/mobile rendered visual review still require browser UAT. Keep R1.18 and parent SPEC-312 open until that result is recorded. The Chat client main chunk remains `514.68 kB` minified and should be tracked as a performance follow-up.
