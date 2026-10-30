# SPEC-224 Guided First Run deployment checkpoint

- Observed: 2026-10-30 08:09 UTC (15:09 Asia/Bangkok).
- Status: `FEATURE_DEPLOYED / LIVE_GOAL_PENDING`.
- Deployed development source: `d7a51c9212349d60772cf69c1430c07d9eb79649`.
- Current `main` at observation: `4f0b3d77e1be3eec45e2625c9f6c12134709065d`; this later source is not the deployed release. The Guided First Run source and focused test paths have no diff between these two revisions.
- Release: `smartspec-web-d7a51c9212349d60772cf69c1430c07d9eb79649-97afb1caae41`, generation 249, mode `linux_systemd_fullstack`, deployed 2026-10-30T07:53:32Z. Immutable artifact digest `sha256:89c86188f64ba8586efd389d927e56852559a28d3d7e0bdb7e81c682ae1d5062`; public artifact digest `sha256:5f9fe49e94eabae8bd82702c8efb745b29a6b9c7e3da8aad003334d70f7d723e`.

## Runtime evidence

- `pnpm run release:status` reports runtime revision `d7a51c9212349d60772cf69c1430c07d9eb79649`, `target_matches_release=true`, and release target available. It also reports canonical `main` has advanced to `4f0b3d77e1be3eec45e2625c9f6c12134709065d`; no new release was built or activated for this checkpoint.
- `smartspec-web.service` is active on port 3000 and its `RELEASE` is the deployed SHA. `smartspec-dev-tunnel.service` is active; `/home/dev/.config/smartspec-dev/cloudflared.yml` maps `aimarkethubs.com` to `http://127.0.0.1:3000`. A separate Vite process is listening on 3100 but is not the configured ingress target.
- `GET https://aimarkethubs.com/chat` returned HTTP 200 and a built entry `/assets/index-BLrsdvXl.js`; the document contains no `/@vite/client`. `GET https://aimarkethubs.com/healthz` returned HTTP 200 with `{"status":"ok"}`.
- Public immutable chunks match the deployed build artifact byte-for-byte: `UnifiedWorkspace-BoLMrD8B.js` SHA-256 `a34424274dea8121d5abf17fee3efc767c95b9f59c5f77e9ae860bd52c1a873b`; `Spec224WorkspacePanel-DDOIW2lk.js` SHA-256 `005a5beca193eaaf08f41869ecd1932fe4ed8348396cd4ca30570d4ea8364495`. The served chunks contain the First Run entry/review strings.

## Guided First Run review and authorization

- `UnifiedWorkspace.tsx` exposes **ทดสอบการทำงานจริง** only when the authenticated user role is `admin`; the CTA creates/binds a persisted chat conversation and opens the existing pilot review. The deployed bundle includes this CTA. UI tests cover Admin visibility, non-Admin hiding, and restoration from the conversation URL.
- `Spec224WorkspacePanel.tsx` loads authorized Runner/Workspace data through `availableWorkspaces`, Runner inventory through `runnerNodes.list`, readiness and account-bound Harness/Model catalogs through Runner readiness queries. It accepts only fresh discovered catalogs and supported adapters; it does not invent a Runner, Workspace, Harness, or Model. Scope is bounded to `apps/runner-app/tests/spec224-live-pilot/**`. The review cap is explicit and editable, defaulting to USD 1.00; server preparation and the existing Goal Grant enforce actual authorization and budget constraints before dispatch. This is a pilot cap, not a claim about account credit balance.
- Focused suite on current `main` SHA `4f0b3d77e1be3eec45e2625c9f6c12134709065d`: `pnpm --dir apps/web exec vitest run client/src/pages/UnifiedWorkspace.test.tsx client/src/components/chat/Spec224WorkspacePanel.test.tsx server/routers/__tests__/spec226DevelopmentControl.test.ts` — 3 files, 75 tests passed. The relevant source and test paths are byte-identical to deployed SHA `d7a51c92`.
- No authenticated owner browser session was used for this checkpoint. Therefore the deployed route and Admin-gated implementation are verified, while an authenticated visual walkthrough and current live registry values displayed in the form remain unobserved here.

## Live execution acceptance still pending

No Goal, Goal Grant/Approval, DevelopmentRun, Job, Attempt, Runner execution, receipt, settlement, Child 2 continuation, or Independent Final Verify was created or claimed by this checkpoint. Preserve the existing Runner/Workspace identities. Wait for the authenticated owner to use the Admin CTA, review the real bounded Goal, Start it, and approve through the existing Approval Authority. Then resume that exact persisted DevelopmentRun and record its genuine Child 1/Child 2 receipts, settlement, event timeline, and Independent Final Verify across Chat, Task Control, and Mission Control. Do not create a second Goal or simulated evidence.
