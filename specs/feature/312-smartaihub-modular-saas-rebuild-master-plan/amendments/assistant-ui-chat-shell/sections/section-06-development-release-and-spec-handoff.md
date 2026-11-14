# Section 06 — development release and SPEC handoff

## Deliverable

Integrate the Chat module source through its canonical `main` path, build the exact integrated source and release only through the mapped `modular-debian-dev` controller to `https://aimarkethubs.com`. Record runtime evidence and update SPEC-312's current amendment, requirement ledger and evidence while preserving all other dirty source paths.

## Owned paths

- `smartaihub-platform` Chat module implementation and lockfile paths owned by this task
- `SmartSpecPro/specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/spec.md`
- Matching `handoff/manifest.json`, `handoff/requirement-ledger.json`, generated `STATUS.md`, history and new evidence file

## Acceptance

- Target mapping is proven immediately before build/release. No release touches `smartaihub.app` or production `smartsihub.com`.
- Record exact source SHA, dependency version, test/typecheck/build output, artifact digest, release receipt and health evidence.
- Authenticated browser UAT is run only when an authorized browser session is available; otherwise it remains explicitly pending.
- Update R1.18 requirement states honestly; keep parent SPEC-312 open while streaming, run/event/contracts or authenticated acceptance remain open.

## Prerequisites and gaps

The development release target has delegated development authority. Production resources and credentials are out of scope.

## Implementation evidence — 2026-11-15

- Exact integrated source `e31402ecbbd12fe0c3bc23ae00dac89286c52a43` was prepared through the canonical deploy source lease and built from that immutable workspace. Core, Shell and Chat builds plus Wrangler dry-runs passed.
- Target preflight matched `modular-debian-dev` → `https://aimarkethubs.com`, Debian systemd with local Workerd, existing `smartspec` database and release root `/home/dev/modular-development-releases`. Neither `smartaihub.app` nor production `smartsihub.com` was targeted.
- Release controller returned `DEPLOYED_AND_VERIFIED` at `2026-11-14T17:40:52.129041Z`. Local Core, Chat and Shell health returned `200`; unauthenticated Chat session returned expected `401`; Chat manifest and entry returned `200`. Public Shell root/login, Chat health and Chat module manifest returned `200`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-e31402ecbbd12fe0c3bc23ae00dac89286c52a43-responsive-chat-panels`.
- Artifact digests: Core `sha256:4ef831bf5c8eeb14aceed2b42992a22de136fec67df95f2301f0f2047009dda4`; Shell `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d`; Chat `sha256:67539e9bf52290f39e0eb91fee8f617009abafde21a3a1adfa828194fbe26bf3`.
- Rollback is preserved at `.../rollback/cloudflared.pre-modular.yml` and `.../rollback/systemd/`; legacy service `smartspec-dev-web.service:3100` remains the rollback target.
- Authenticated browser attempt and per-scenario outcomes are recorded in [the UAT report](implementation/evidence/authenticated-uat-20261115.md). Orca desktop accessibility/screenshot capabilities are unsupported in this runtime; this is an environment blocker, not a test pass.
- Authenticated Chat response, streamed output, thread persistence/reconnect, end-to-end attachment ownership, cross-tenant attachment denial and desktop/tablet/mobile visual review remain blocked or untested. The current backend exposes worker-job polling but no persisted event-stream contract, so streaming must not be claimed or simulated.
- Do not close R1.18/parent SPEC-312 until the blocked authenticated and viewport scenarios are completed in an authorized browser environment and streaming acceptance is resolved against the backend contract.
