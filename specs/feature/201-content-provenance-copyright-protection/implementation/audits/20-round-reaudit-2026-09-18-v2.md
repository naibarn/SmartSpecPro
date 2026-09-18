# Feature 201 — fresh 28-round implementation re-audit

Audit date: 2026-09-18  
Scope: current worktree, SPEC-201 Revision 1.3, all ten implementation
sections, final compound/render boundaries, Content Protection workspace,
Dashboard quick links, Verify/case/reviewer flows, and the latest UI/i18n
repairs.

This is a new audit record. Earlier audit files remain unchanged as historical
evidence. Each round checked a different boundary; any safe in-scope gap found
was repaired before convergence.

| Round | Boundary checked | Evidence | Result / action |
|---:|---|---|---|
| 01 | Section inventory | `check-sections.py` | PASS — all 10 sections present and complete. |
| 02 | UI contract inventory | `check-ui-contracts.py --json` | PASS — 10 sections checked, 7 UI sections, no failures. |
| 03 | Shared intent/schema contract | `shared/contentProtectionWorker.ts`, contract tests | PASS — image/video/audio, strict ON/OFF, provider gating, and protect/verify contracts are represented. |
| 04 | Persistence model | `drizzle/schema.ts`, content-protection schema test | PASS — assets, cases, evidence, rights, certificates, Verify runs, reviewer links, tenant indexes, and public identifiers are represented. |
| 05 | Public identifier migration | `0335_feature_201_public_identifiers.sql`, Drizzle journal | FIXED — public asset/case identifiers are generated, backfilled, unique, not-null, and defaulted; internal UUIDs are no longer required in user-facing asset/case views. |
| 06 | Router asset redaction | `safeAssetView`, `getAsset`, `listAssets`, router tests | FIXED — internal asset `id` is omitted from the projection; public ID is used for links and controlled resolution still accepts scoped internal/public references. |
| 07 | Router case redaction/detail | `safeCaseView`, `getCase`, `listCases`, case routes | FIXED — case list/detail/create/status responses expose `publicCaseId`; canonical case detail route resolves public IDs under tenant/owner scope. |
| 08 | REST/reviewer boundary | `routes/contentProtection.ts`, `EvidenceReviewPage.tsx` | PASS — reviewer route is case-scoped, token-hashed, expiring/revocable, and separately scopes ZIP download. |
| 09 | Media Studio modality handoff | `MediaStudio.tsx`, `mediaStudioPayload.ts`, `media.ts` | PASS — image/video/audio carry explicit user intent; image ON requires the rollout flag; audio ON cannot bypass the async gate. |
| 10 | Generic media-task gate | `mediaTaskContentProtectionService.ts`, service tests | FIXED — a missing storage URL no longer becomes a raw storage key playback URL; ON remains pending/failed until protected playback is available, OFF is explicit. |
| 11 | Final compound boundary | `workerRegistryService.ts`, video-project/compound paths | PASS — final bytes, causal job, compound envelope, source digest, and `requireBeforePublish` are bound before protected publication. |
| 12 | Web Video Editor export | `editorMediaJobs.ts`, Export/Phase3/Worker editor surfaces | PASS — video, still-image, and audio final exports resolve and persist effective ON/OFF intent; direct ON local export is not silently published. |
| 13 | Video Studio/Vertical Drama defaults | `RenderPanel.tsx`, episode/render services | PASS — user default is resolved only when no explicit choice exists; final assembled video is gated again. |
| 14 | Remotion final output | Remotion production/render services | PASS — final render consumers use the protected artifact gate and do not publish the raw render while ON is unresolved. |
| 15 | Worker admission | `jobControlPlaneGateway`, `feature186JobTypes`, executor registry | PASS — protect and Verify use durable `worker_jobs` plus outbox admission, registered executors, tenant/actor scope, and idempotency. |
| 16 | Protection worker projection | worker registry/polling tests | PASS — causal output and protection status are projected atomically enough for the existing control-plane boundary; failed provider output is not promoted as protected. |
| 17 | Verify job contract | `contentProtectionWorker.ts`, `verification.ts`, executor registration | PASS — `content_protection.verify` has strict input, ordered stages, bounded source handling, failure codes, and canonical executor registration. |
| 18 | Verify owner/tenant scope | verification candidate predicates and router | PASS — server-derived tenant/owner scope is re-applied in the executor; non-admin cross-owner candidates are excluded. |
| 19 | Verify evidence honesty | exact hash, image dHash, UI/evidence labels | PASS — exact SHA-256 and image dHash are reported; unavailable video/audio detectors, C2PA trust, and TSA are labeled unavailable rather than fabricated. |
| 20 | Verify retry lifecycle | router and worker tests | PASS — queued/active/completed runs remain idempotent; failed runs preserve history and create a new queued retry. |
| 21 | Evidence package/certificate | `createEvidencePackage`, certificate signing/projection | PASS — bounded evidence documents, persisted Ed25519 signature material, package hash, and private tenant-scoped object paths are used. |
| 22 | Dashboard top-level menu | `Dashboard.tsx`, `App.tsx` | PASS — top-level workspace plus Protected Assets, Verify, and Settings quick links are feature-gated and route to canonical destinations. |
| 23 | Dashboard status visibility | dashboard overview/status card and locale keys | PASS — protected, processing, warning, failed, and user-unprotected counts are visible with explanatory copy. |
| 24 | Settings/user authority | `Settings.tsx`, `setDefaultChoice`, export controls | PASS — the user controls default and per-export ON/OFF; effective choice is shown before protection and OFF is never represented as protected. |
| 25 | Workspace navigation/i18n | `ContentProtectionPage.tsx`, `contentProtection.json`, namespace route preload | FIXED — all primary workspace labels, status notices, status badges, verify/case/settings/rights/certificate copy, and ARIA labels are localized in EN/TH; route preloads the namespace. |
| 26 | Public UI identifiers/links | asset cards/detail/rights/certificate/case links | PASS — links use `publicAssetId`/`publicCaseId`; no internal asset/case ID is rendered in the workspace. |
| 27 | Focused regression/build checks | Feature-201 Vitest matrix, locale parity, targeted esbuild, Vite/widget build | PASS — Feature-201 matrix 10 files/99 tests passed; locale parity 17 tests passed; targeted server bundles and production client/widget build passed. |
| 28 | Security/release boundary | diff check, redaction review, external capability review | PASS with explicit external gates — `git diff --check` passed; no in-scope code block remains. Real provider/worker, deployment, authenticated browser, production render, legal UAT, optional detectors/C2PA/TSA, and separate permission registry remain release gates. |

## Convergence A — final-byte protection chain

Re-read the path `user ON/OFF → media/editor intent → final compound/render
bytes → protection admission → worker output → self-verification → publish`.
The current code withholds the raw final playback reference while an ON gate is
pending or failed. A missing protected URL cannot fall back to a raw storage
key. OFF is persisted as `UNPROTECTED_BY_USER_CHOICE` and is not presented as
protected.

## Convergence B — dashboard and evidence journey

Re-read `Dashboard → Content Protection workspace → Assets/Verify → Verify run
→ case detail → rights/certificate → reviewer link → scoped evidence ZIP`.
The menu and quick links resolve to registered routes, the case detail has a
canonical public-ID route, and reviewer download remains separately scoped.
Tenant/owner authorization is retained at each server boundary.

## Convergence C — public safety and UI consistency

Re-read all user-facing asset/case projections, links, raw URL promotion,
locale registration, route namespace loading, and EN/TH key parity. The latest
repairs close internal-ID leakage, raw-storage-key promotion, hard-coded
workspace copy, and dashboard status/setting link gaps. No new in-scope gap was
found after the final focused tests and build.

## Remaining acceptance gates (not local code blocks)

1. Configure and exercise a real VideoSeal/PixelSeal-compatible provider and
   registered worker before enabling the tenant feature.
2. Run deployed migration verification, authenticated browser smoke/UAT,
   production compound/render, rollback, and legal/platform review.
3. Add and benchmark transformed-copy video/audio detectors, C2PA trust-chain
   validation, and RFC 3161 TSA only if those claims are required for launch.
4. The repository has tenant/owner/admin primitives, not a separately
   assignable `content_protection.*` Editor/Reviewer/Viewer registry. That
   requires a shared authorization decision rather than an ad-hoc feature table.
5. Future logical jobs `fingerprint`, `reprotect`, and `evidence_prepare` are
   intentionally not registered as fake executors; implement them only with
   real contracts and runtime capability.
6. Full TypeScript typecheck was not run because repository `AGENTS.md`
   prohibits it under the host RAM constraint.

## Baseline limitation

The unrelated `verticalDramaEpisodes.voiceChain.test.ts` mock/import failure
(`createRateLimiter`) remains outside Feature 201 and was not changed.
