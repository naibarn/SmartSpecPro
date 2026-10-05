# Spec 270 G0 Reconciliation Record

Date: 2026-10-02
Spec revision: R1.4
Branch: `codex/spec263-270-implementation`

## Findings

- **Source map:** `apps/web/drizzle/schema.ts:18835-18866` (`worker_artifacts` cascade); `apps/web/server/services/jobControlPlaneGateway.ts` (`createControlPlaneJob`); `apps/web/server/services/jobOutboxPublisher.ts` and `apps/web/server/services/jobOutboxRunner.ts` (outbox); `apps/web/server/services/spec224DevelopmentRunContracts.ts` and `spec224DevelopmentRunPersistence.ts` (Spec 224 run contract/persistence); `apps/web/server/services/capabilityRegistry.ts` (model capability filtering only); `apps/web/shared/featureFlags.ts` (tenant gates).

- **Spec number:** local `specs/feature` search found this Spec 270 proposal and no competing `spec.md` numbered 270. No canonical organization-wide registry was found in the repository. Global uniqueness remains unverified; status stays provisional.
- **Schema and durable owner:** `apps/web/drizzle/schema.ts` defines `worker_artifacts` linked to `worker_jobs` with cascading job ownership. This is not accepted as an independent canonical design-version store. No DDL is approved by this record.
- **Existing artifact service check:** `apps/web/server/services/artifactStorageService.ts` versions conversation artifacts, but they are conversation/user owned, do not carry canonical project-scoped design metadata or independent retention/recovery closure, and are not accepted as the design artifact owner.
- **Job/approval/evidence authorities:** long-running work must use `worker_jobs` + outbox. Implementation handoff must use Spec 224 run/evidence/approval authority. No new queue, retry, scheduler, or approval engine is allowed.
- **Capability authority:** Spec 256 owns skill/capability discovery. The model capability registry is not assumed to be a design-system catalog.
- **Portable app/ownership authorities:** Spec 261 owns SPAAS portability; Spec 269 owns assistant/delegation and artifact ownership-transfer authorization.
- **Astryx:** project package is pinned to v0.6.3. SmartAIHub components and Astryx must be wrapped through the existing UI foundation; no global CSS reset is approved.
- **Secret binding:** no provider credential path has been certified for this design adapter. This task did not inspect raw secrets or invoke a provider.
- **Stitch:** public docs describe an evolving, experimental integration and the available repository contains no project credentials or terms certification. No live capability/retention/quota/egress probe was run.
- **Feature gates:** `smartAiHubDesignIntelligence`, `smartAiHubDesignNative`, `smartAiHubDesignResolver`, `smartAiHubDesignProviders`, `smartAiHubGoogleStitch`, `smartAiHubDesignVisualVerify`, and `smartAiHubDesignCoreSelfDesign` default to false. Provider activity requires parent, resolver, visual-verification, and provider-specific gates.
- **Section 03 catalog discovery:** package manifests/lockfile pin Astryx core, CLI and neutral theme to 0.6.3. The borrowed app `node_modules` lacked core/theme and the root CLI path was absent, so an isolated temporary 0.6.3 core/theme package set and worktree-local ignored CLI links were used without changing manifests, lockfiles or the main workspace dependency tree. Required `npm run astryx -- build "design authoring review workspace"`, `docs layout`, `docs tokens`, `template editor --skeleton`, `template canvas-editor --skeleton`, and component docs for Layout, TextInput, Selector, Button, Item, Dialog, SegmentedControl and MetadataList ran. Build recommends editor/canvas-editor templates; verified prop lists are curated in `apps/web/shared/designComponentResolver.ts`. `PropertiesForm` is not an Astryx component (CLI suggested `MetadataList`); CLI emitted only a missing worktree-local theme-path warning, while API docs resolved. The resolver uses a source-controlled, deeply frozen 0.6.3 snapshot and rejects caller-created catalogs. No SmartAIHub-owned component wrappers/catalog authority were found.
- **Section 04 exact authority discovery:** Spec 256 currently has contract fixtures but no callable live design capability authority. `apps/web/server/services/capabilityRegistry.ts` is model capability filtering; `skillCapabilityManifestService.ts` handles seeded/explicit skill manifests but is not the Spec 256 design authority. Spec 224 exposes DevelopmentRun and worker-job contracts, but its current executor is specifically Codex/Claude Code and has no approved design artifact version/digest evidence binding. A pure injected-port adapter can validate a proposed handoff; no live capability resolution, run creation, or dispatch is authorized by current contracts.
- **Provider adapter boundary:** `designProviderAdapter.ts` remains dependency-injected with no production provider implementation. It accepts only a secret-binding reference for an eligibility check and keeps all Stitch gates default-off. No credential value, account, terms, or live endpoint was inspected or invoked.

## Open blockers

1. Obtain authoritative canonical spec registry result before claiming global number uniqueness.
2. Identify and approve durable design artifact owner, backup/recovery, retention/deletion, and asset reference closure before DDL.
3. Verify the exact Spec 224/256 integration owners before changing their contracts or registering worker jobs.
4. Certify provider terms, retention, quota, credential binding, version and egress behavior before external-provider enablement.

Until these close, native contract work may proceed, but no DDL, credential onboarding, live provider request, or production enablement is allowed.

## Follow-up reconciliation — 2026-10-05

- The source now contains a SmartAIHub-owned public UI implementation boundary at `apps/web/client/src/components/publicUi/PublicHomeExperience.tsx`; Astryx primitives are internal to this wrapper. The design-intelligence catalog still contains only the pinned upstream snapshot and has no approved SmartAIHub-owned entries, digest owner, or registry publication authority. This wrapper is not evidence that the Spec 270 authoring catalog is closed.
- Focused source verification on the current candidate passed 15 files / 110 tests, including canonical design contracts, resolver, native service, handoff, provider adapter, public-home, tenant isolation, auth return path, retired-route guard, sitemap and SEO prerender.
- Provider adapter correction: candidate results now satisfy `schemaVersion: 1`, and absence of `componentCatalogSnapshotId` fails before policy/provider calls. Production provider certification, secret binding, durable operation-store ownership and external egress remain absent; all provider flags stay default-off.
- No new migration or durable design repository was introduced. Durable owner, retention/delete, backup/recovery, and reference-aware asset closure still prohibit DDL and user-facing native authoring.
- No callable Spec 224/256 design authority or approved artifact/digest/evidence handoff exists. Sections 04 and 06 remain gated. No application build, full typecheck, browser run, production DB change, provider call, or deployment was performed.

## Public website design candidate — 2026-10-06

- Spec 263 closeout created a source-controlled package under `design/public/`, including a UI pattern map and a deterministic file-content digest. This is a **SmartAIHub public UI candidate reference only**. It is not a native Spec 270 artifact ID/version, approved catalog snapshot, resolver record, durable artifact-store record, or externally published digest.
- Public UI uses the installed Astryx 0.6.3 components and keeps external providers/native authoring disabled. The candidate theme uses runtime style injection. `astryx theme build` failed to load `defineTheme` with both `@astryxdesign/core/theme` and `@astryxdesign/core` import forms on this host; the generated built theme was not produced.
- Spec 270's G0 blockers are unchanged: durable artifact owner/retention/recovery/reference closure, callable Spec 224/256 authority, SmartAIHub catalog publication/digest authority and external-provider certification remain unapproved. No DDL, credentials, provider request or flag enablement occurred.
