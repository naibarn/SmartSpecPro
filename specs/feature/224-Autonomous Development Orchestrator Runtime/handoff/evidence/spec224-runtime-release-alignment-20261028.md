# SPEC-224 immutable runtime release alignment

Observed 2026-10-28 02:38 UTC. Current `origin/main` at verification was
`eb7fd64b1cb8b4086e9382d9fe3d6316ea3344d6`; the runtime code-bearing release
is the integrated immutable source `1dc96665bd352418169b35aba79156b140ef82e3`.
Commits after that source changed only the Cloudflare M3 handoff records.

## Serving Linux runtime

- Web and Node Job Worker are served from release generation 194:
  `smartspec-web-1dc96665bd352418169b35aba79156b140ef82e3-1a2cad06010e`.
  The immutable release manifest and production receipt bind frontend, Node API,
  and Node Worker to source `1dc96665bd352418169b35aba79156b140ef82e3` and
  artifact `sha256:e3a3da178751e41a55bc340e7bf3cad839b1e5e57e7e3624fb79087b4a3520c9`.
  Public assets are `sha256:5247f26b2035d17411aa1938add398c183407c69eae433afe0f41f37345c02d0`.
- Node Worker PID `3415180` and Web PID `3412354` were verified in the release
  receipt on the same immutable release path, using Node `v22.23.4`. The release
  status check reported `target_matches_release=true`.
- Python Approval Authority is now on immutable release
  `smartspec-python-1dc96665bd352418169b35aba79156b140ef82e3-78c509c4d854`,
  source `1dc96665bd352418169b35aba79156b140ef82e3`, artifact
  `sha256:78c509c4d854dca15c0e82c536576d4d07235f52f057fd5cbbb1e50fac565a04`
  (1,267 files). Promotion receipt:
  `python-1dc96665bd352418169b35aba79156b140ef82e3-b3a110e7d959.json`.
- Python runtime verification returned HTTP 200 for `/health` and
  `/api/v1/health/ready`, with database, worker job control plane, and LLM proxy
  reported healthy. Read-only OpenAPI inspection confirms
  `POST /api/v1/approvals/spec224/goal-grants` is registered. No approval
  request or Goal Grant was created by this release check.
- Public `https://smartaihub.app/api/health` and `/` returned HTTP 200 through
  `cloudflare-worker` ingress to the `linux-origin` application runtime.

## Compatibility and rollback

- The Python source delta from the previously serving Python SHA
  `2382582a072e91c283ca2bf3513228c049ade574` consists of the SPEC-224 Goal Grant
  Approval Authority route and its integration test. No SQL, Drizzle, or
  Alembic migration changed in that delta. The route reuses the existing
  ApprovalDBService and approval request schema; Node/Web remain on the same
  source SHA and consume that route.
- Existing connected PostgreSQL ingress and delegated continuation acceptance
  remains the evidence for approval, shared-budget, hold, and receipt-driven
  dispatch contracts. No synthetic receipt was used as live execution evidence.
- The previous Python immutable release remains available at
  `smartspec-python-2382582a072e91c283ca2bf3513228c049ade574-36a38d256f1d`.
  Python promotion records/restores its prior systemd command and has automatic
  health/readiness rollback. Web's previous immutable release is generation 193,
  source `4769f2a0e392978b1e5e7ee3257bb55b305e9f0b`; the Linux release controller
  restores its previous release pointer and both service configurations on
  failed activation/readiness. No rollback was needed.
- No database migration was applied. The Cloudflare M3 owner handoff remains
  authoritative for Worker deployment: its active Worker version/provider
  readback is unavailable in this session, no Worker deployment or routing
  change was performed, and the existing Worker-to-Linux-origin route remains
  the observed production path.

## Remaining SPEC-224 acceptance

This aligns the deployed Linux runtime; it does not establish `LIVE_VERIFIED`.
The latest Windows Runner observations in the existing handoff are expired, no
owner-approved live Goal Grant/Budget or live DevelopmentRun/Runner receipts are
available, and automatic Phase 2 still awaits a real Windows execution. The
owner must refresh the registered Runner/Codex readiness, select the isolated
workspace, and start and approve the bounded Goal through Task Control. Capture
real Child 1/2 receipts, settlement, and Final Verify there. Cloudflare's exact
active Worker revision remains a separate provider-owner readback.
