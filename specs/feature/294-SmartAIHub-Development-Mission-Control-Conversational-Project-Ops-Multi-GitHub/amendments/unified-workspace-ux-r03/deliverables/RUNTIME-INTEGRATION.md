# Runtime integration proposal

1. Keep the DEV routes isolated until UX acceptance. Do not replace `/chat`, current Task Control, or the live Mission Control route as part of R03.
2. For Chat, use its current authenticated API/session and maintain workspace/thread selection in its own module state. The shared header is presentation/navigation only.
3. For Task Control, adapt the current authenticated `workerJobs.observabilityV1` projection (SPEC-312 R1.21/R1.22) and the canonical SPEC-277 owner read model. Preserve `workspaceId: null` if the source cannot establish it. Do not turn tenant IDs into workspace IDs or treat a Job as a Mission.
4. For Mission Control, bind only to the canonical Mission runtime and durable event/receipt sources in SPEC-294. Mission, Job, Run and Attempt remain distinct identities; event streams replay from a cursor and UI refresh never mutates work.
5. Replace each fixture view incrementally with typed adapters. Keep synthetic mode visibly separate from LIVE data and make test fixtures impossible to enable on customer routes.
6. Preserve existing authorization checks on every request and action. Simple/Developer mode changes disclosure only, never permission. Enforce tenant/workspace scoping server-side and redact protected paths, IDs, and secrets at DTO/event boundaries.
7. Add idempotency and server-side state guards before exposing any create/cancel/retry/approve/stop action. Do not build a second scheduler, queue, credit ledger, or execution session store.
8. Validate authenticated positive and cross-tenant negative cases, stable identities after reload, duplicate-dispatch prevention, event cursor recovery, artifact access, and tablet/mobile interactions before replacing any live route.

## Deployment outcome

The DEV preview is deployed to `https://aimarkethubs.com/dev/mission-control-prototype` and `https://aimarkethubs.com/dev/task-control-prototype` from Platform source `c8dee72b71367282167bbddd3880e902a2678f2b`. The release controller verified Core/Chat/Shell local health, unauthenticated Chat boundary, shell root/login, Chat health and manifest. Owner authenticated UX review remains pending. `smartaihub.app` and `smartsihub.com` were not targeted.

## R03.2 deployment and runtime boundary (2026-11-16)

The multi-Harness prototype and responsive split refinement are deployed to `modular-debian-dev` at `https://aimarkethubs.com/dev/mission-control-prototype`, Platform source `b1f29c58aaf645fbc485209cafee07e7e6179979`. Release receipt: `/home/dev/modular-development-releases/modular-debian-dev-b1f29c58aaf645fbc485209cafee07e7e6179979-mission-control-r032/release-manifest.json`. Controller local/public smoke passed Core/Shell/Chat and unauthenticated Chat boundary checks. No Cloudflare Worker or production target was deployed.

R03.2 uses only labeled synthetic fixtures. The Harness catalog, heartbeat, trust, entitlement, workspace authorization, dispatch readiness, canonical Mission/Job/Run/Attempt read models, durable event replay and production Task Control deep-link authorization are not wired by this slice. The R03.2 gap matrix names the existing adapter authorities and required proof. Browser captures used a synthetic shell user bootstrap and prove layout/interaction only, not authenticated owner UAT or runtime acceptance.
