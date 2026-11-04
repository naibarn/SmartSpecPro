# Goal and SPEC import readiness deployment

- Observed at: 2026-11-04T12:42:54Z
- Integrated source SHA: `550846fba964eac652b534a75ace01ca251cd409`
- Target: `legacy-debian-dev` (`https://smartaihub.app`), Debian `smartspec-web.service` on port 3000
- Release: `smartspec-web-550846fba964eac652b534a75ace01ca251cd409-0fcfa3d6f54b`, generation `g354`
- Artifact digest: `sha256:1f4a7a90e79979a54b38c6ea3875f6242ccbca8b4a0b10655f1171ec8242e3f5`
- Public artifact digest: `sha256:3f965cb807890a3a724d4f9c3403849f2aaec8bd253654cae6b4bd25e64ec33d`

## Change

A fresh Goal now ignores the old conversation draft's prompt, request kind, SPEC mode, and selected SPEC. It starts in Prompt mode while retaining the current Runner/workspace binding; an explicit prompt passed by Chat remains the new Goal prompt.

The Modular SaaS import control now uses the same eligibility checks as its mutation: Admin access, an authorized `modular-debian-dev` Platform workspace, a current binding to that exact workspace and snapshot, and source fingerprint evidence. Disabled states explain the missing prerequisite. When the selected Core workspace is available but its conversation binding is stale or mismatched, the panel offers a direct rebind action. The normal Chat route remains available from this panel. A pending Core runtime does not block SPEC ingestion because ingestion stores the Spec Set and does not deploy or start Runner work.

## Focused verification

- `quick`, source `550846fba964eac652b534a75ace01ca251cd409`: `pnpm --dir apps/web exec vitest run client/src/pages/UnifiedWorkspace.test.tsx client/src/components/chat/Spec224WorkspacePanel.test.tsx` passed 64/64 tests at 2026-11-04 19:27:47 Asia/Bangkok. Coverage includes stale same-conversation drafts, import from a current Core binding while runtime is pending, and explicit recovery for stale binding.
- `git diff --check` passed.

## Deployment verification

- The immutable Linux release controller returned `DEPLOYED_VERIFIED` for `legacy-debian-dev`.
- `smartspec-web.service` and `smartspec-node-worker.service` both report source revision `550846fba964eac652b534a75ace01ca251cd409`; runtime health returned HTTP 200 and anonymous diagnostics remained denied with HTTP 403.
- Public health check passed: HTTP 200 in 239 ms, valid TLS, and no missing security headers. Public `GET /chat` and `/healthz` returned HTTP 200. The served `Spec224WorkspacePanel-DvB83QVH.js` returned HTTP 200 and contains the new rebind, Chat route, and stale-binding guidance.
- API smoke check reached 12/12 routes with zero server errors and 120 ms average response. It reported two existing unrelated issues: `/api/health` has no CORS headers and `/404-test-page` returns the SPA with HTTP 200.
- Authenticated browser interaction and an actual live import were not exercised. The local Orca computer sidecar returned `accessibility_error`; the import states and mutation path were verified in focused tests instead.
- Environment manifest validation passed (10/10 required variables). Migration journal static configuration is valid; this UI change has no database migration. No Cloudflare artifact or Worker was built or deployed.

## Verification profile and build resources

- `package`, source `550846fba964eac652b534a75ace01ca251cd409`: exact-SHA Linux build and deployment completed with status `DEPLOYED_VERIFIED`. Resource preflight reported host available memory 24,468,008 KiB, memory PSI `some.avg10=0.00`, user-slice current 18,678,562,816 bytes, reclaimable 12,511,340,408 bytes, effective 6,167,222,408 bytes, limit 21,474,836,480 bytes, and swap current/limit 3,358,015,488 / 6,442,450,944 bytes.

This is exact-SHA implementation, focused-test, and development-deployment evidence only. It does not claim that a live workspace import was performed or that overall SPEC-224 acceptance is complete.
