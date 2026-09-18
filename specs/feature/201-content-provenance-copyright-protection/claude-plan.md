# Implementation Plan — Feature 201

## 1. Architecture and boundaries

Implement Feature 201 as an additive TypeScript domain module under
`apps/web/server/services/contentProtection/`, a tRPC router, shared contract
types, Drizzle tables/migration, a focused Worker operation contract, and a
top-level React workspace. The module owns protection state and evidence; it
does not replace `mediaAssets`, `worker_jobs`, `editorMediaJobs`, or Vertical
Drama assembly. Those systems remain the source of final media and job
identity.

The canonical flow is:

`user choice → protect request → canonical protection record → worker job →
final-byte/provider processing → self-detect + QC → manifest/evidence →
PROTECTED publish gate → UI status`

For a compound video, the flow starts only after the final render/assembly
produces its output candidate. The protection input includes an immutable
`compoundArtifactEnvelope` with ordered source asset IDs, source SHA-256s,
trim/timing data, project/assembly revision, and plan digest. The output
manifest binds the final artifact hash to that envelope. Reusing an old result
with a new plan/revision is rejected as stale.

## 2. Shared contracts and deterministic identity

Create `packages/shared/src/content-protection.ts` and export it from the
shared constants/index or package root. Define modality, protection status,
watermark choice/source, verification classification, evidence strength, route
IDs, job type, and versioned request/result shapes. Include pure helpers for
canonical JSON, SHA-256 identity inputs, effective user choice, and stale
compound comparison. Keep codewords, signing keys, and provider credentials
out of these public types.

Tests first: canonicalization is order-stable, source order is preserved,
explicit OFF wins over default, invalid modality/choice is rejected, and a
changed input hash/trim/revision/plan digest changes the compound identity.

## 3. Persistence and migration

Add Drizzle definitions in `apps/web/drizzle/schema.ts` for the Feature-201
records described by the spec: protection assets, watermark identities/results,
fingerprints, provenance manifests, publications, verification runs/matches,
cases/evidence/events, rights-holder profiles/claims/documents/component
rights, creation certificates, evidence anchors, and external review links.
Use explicit tenant/user foreign keys and indexes for `(tenantId,status)`,
`(tenantId, sourceAssetId)`, idempotency, and verification lookup. Keep large
artifacts in storage; JSON columns hold bounded metadata and signed references.
Create one numbered Drizzle SQL migration and update the journal/snapshot only
through the repository's migration tooling. Do not modify unrelated schema
areas or use the retired tables.

Tests first: schema contract tests assert table exports, tenant indexes, unique
idempotency keys, and no secret/codeword columns.

## 4. Provider and service layer

Create a provider interface with separate image/video/audio embed and detect
methods. Implement the first adapter using the configured VideoSeal/PixelSeal
capability where installed and a deterministic test provider for unit tests.
For image output, use the existing server image tooling and preserve the output
mime/storage contract; for video, require the worker-capable provider and never
fall back to a visible branding overlay. Keep `C2PA` and perceptual fingerprint
providers separate from invisible watermarking.

Create service functions to resolve tenant/user authority, load ready source
assets, create an idempotent protection record, build a bounded worker job
definition, apply self-verification output, and derive the final status. All
provider failures map to safe codes. `PROTECTED` requires the required provider
signals; OFF maps to `UNPROTECTED_BY_USER_CHOICE`.

Tests first: provider success/failure, self-detect mismatch, idempotency,
secret redaction, unavailable provider, image-vs-video separation, and status
gate behavior.

## 5. tRPC API and verification/evidence flow

Add `apps/web/server/routers/contentProtection.ts` and
`apps/web/server/routes/contentProtection.ts`, mounting them in the existing
tRPC and `/v1` route registries. Procedures/routes cover overview/list/detail,
protect asset, create verification, verification detail, case/evidence actions,
rights/certificate reads/writes, and user default settings. Inputs use Zod
bounded schemas. Every procedure derives `tenantId` from context and checks
owner/RBAC before accessing IDs. Verification accepts image/video/audio upload
references or library asset IDs, stores only safe storage references, and
returns technical match status plus evidence strength and legal-language
disclaimer.

Verification and evidence endpoints are rate-limited where appropriate, do not
return provider secrets, and expose only sanitized error messages. Public
review links use a random token hash and expiry/revocation checks. Add the
restricted reviewer route and a public key-history response for historical
evidence verification; these must not expose normal tenant APIs.

Tests first: procedure input validation, tenant/owner/admin matrix, cross-tenant
IDOR regression, idempotent protect/verify, upload reference restrictions, and
public reviewer token expiry/revocation.

## 6. Canonical worker processing

Add the protection job type and payload to the existing control-plane contract.
The payload contains `protectionAssetId`, final source storage key, modality,
effective choice, provider version, compound envelope, and safe output targets.
Create progress events for `validate_contract`, `stage_inputs`,
`create_digital_watermark`, `self_verify_watermark`, `fingerprint_and_c2pa`,
`quality_control`, and `publish_artifact`. The Worker result includes output
storage key, final SHA-256, modality-specific evidence, and safe error fields.

The native Worker must advertise the capability before the job is admitted. For
environments where a configured provider is not available, retain the job as
unavailable/failed rather than marking it protected. The Node control plane
remains responsible for DB state transitions and stale fencing.

Tests first: job payload validation, progress order, retry classification,
output hash verification, stale fencing, and no secret leakage.

## 7. Compound/render integration

Extend `editorMediaJobs.submit` so a video render request can carry a validated
protection choice and compound envelope. The final render result must create a
protection job referencing the same project revision/plan hash and must not
publish a `Protected` result before self-verification succeeds. Preserve
existing non-protected render behavior when the user explicitly chooses OFF.

Add a narrow integration hook in `verticalDramaAssembly.ts` after the compiled
video media asset is persisted. It builds the same envelope from the assembly
manifest and enqueues protection with `causalJobId`, `compoundArtifactId`, and
`compoundPlanDigest`. A failed protection leaves the assembly inspectable but
blocks a protected publication. Repeated assembly completion is idempotent.

Tests first: Web editor render binding, Vertical Drama compiled-video binding,
changed plan/revision rejection, OFF outcome, duplicate completion, and
protected publish gate.

Apply the same final-artifact handoff to the existing Media Studio image/video
export completion path. An image export gets an image protection job after its
final transform; a video assembled from images gets a new video protection job
after the final video bytes exist.

## 8. UI workspace, dashboard, settings, and user choice

Add lazy routes/pages under `apps/web/client/src/pages/content-protection/` for
overview, assets, asset detail, verification input/progress/result, cases,
rights, certificate, and settings. Use existing UI primitives and i18n. The
asset detail must render image, video, and audio variants without conflating
evidence fields. Show technical evidence and the legal-ownership disclaimer.

Add the shared `content-protection` menu item in
`packages/shared/src/constants/menu.ts`, gate it by
`contentProtectionEnabled`, and add Dashboard quick actions for the workspace,
protected assets, and suspected-copy verification. Add a settings section
addressable as `/settings?section=contentProtection` and preserve an optional
compatibility redirect. Add a status card showing modality, artifact, ON/OFF
choice, exact watermark stage, and protected/unprotected state.

The choice control must exist in each protect/export/compound entry point, show
the effective choice before submit, and show progress after submit. Keyboard
navigation, focus, mobile 390x844, tablet 768x1024, desktop 1440x900, empty,
loading, error, disabled, and reduced-motion states are required. Use existing
translation namespaces with English fallback and Thai copy for labels and
warnings.

Tests first: route rendering, menu/quick-link contract, settings deep link,
image/video evidence cards, ON/OFF notices, keyboard semantics, and browser
smoke evidence.

## 9. Rights, certificates, cases, and external review

Implement the minimum persistence-backed UI/API for Rights & Ownership,
creation certificate, evidence readiness, cases, and expiring external reviewer
links. Certificates are generated only from a verified final artifact and list
hashes, manifest IDs, evidence strength, and disclaimers. Evidence packages
contain references and integrity hashes, not raw secrets or unbounded logs.
The external reviewer view is read-only and revocable. Preserve separate
`firstObservedAt`, `claimedCreationAt`, `trustedTimestampAt`, and
`publishedAt` values; imported media must never be described as created by
SmartAIHub. Keep rotated public verification keys available for historical
certificates. Any legal declaration or external submission requires an explicit
user review/confirm action and is never auto-signed or auto-submitted.

Tests first: rights CRUD scope, certificate generation guard, evidence package
integrity, evidence-anchor/key-history verification, separate time labels, case
status transitions, explicit legal confirmation, reviewer token access, and
redaction.

## 10. Rollout, observability, and verification

Add the tenant feature flag `contentProtectionEnabled` and image provider flag
in `packages/shared/src/featureFlags.ts` and the existing tenant flag service,
without enabling the feature globally by accident. Add structured events for
choice, job lifecycle, provider capability, self-verification, stale rejection,
and protected publish. Add focused dashboards/status counts through existing
worker job monitoring rather than a new queue.

Run the focused Vitest suites for shared/service/router/UI, Rust tests for the
changed worker operation, migration validation, and Playwright route checks
where browser dependencies are available. Do not claim external provider,
real-worker, or production legal ownership proof from local tests; record those
as explicit runtime acceptance gates.

## Execution order

1. Shared contracts and test utilities.
2. Schema/migration and repository/service layer.
3. Router and worker contract.
4. Compound integrations and protected publish gate.
5. UI/navigation/settings/quick links.
6. Rights/evidence/external review.
7. Cross-section tests, security checks, 15-round audit, and rollout notes.

## UI/UX contract

### Target user and job to be done

Creators and reviewers need to protect a final media artifact, understand when
the invisible watermark is created, choose whether to use it, and inspect
technical evidence for a suspected copy without being misled into a legal
ownership conclusion.

### Surface inventory and ownership

| Surface | Owner | Primary action |
|---|---|---|
| `/content-protection` | ContentProtectionOverview | inspect health and start protect/verify |
| `/content-protection/assets` | ProtectedAssets | filter modality/status and open detail |
| `/content-protection/assets/:id` | ProtectedAssetDetail | inspect evidence and certificate |
| `/content-protection/verify` | VerifyCopy | upload/select image/video/audio |
| `/content-protection/verifications/:id` | VerificationResult | inspect signal-specific result |
| `/content-protection/cases` | ProtectionCases | manage cases/evidence |
| `/settings?section=contentProtection` | ContentProtectionSettings | set user default and provider display |
| Dashboard quick links/card | Dashboard | reach the workspace in one click |

### State matrix

| State | Required behavior |
|---|---|
| loading | skeleton plus accessible busy label |
| empty | explain no protected assets and link to protect |
| error | safe message, trace ID if supplied, retry action |
| disabled | explain feature flag/permission and do not expose raw provider data |
| choice ON | explicit ON notice and later stage labels |
| choice OFF | explicit OFF notice and `UNPROTECTED_BY_USER_CHOICE` warning |
| processing | ordered stage/progress with modality and artifact name |
| success | Protected only when backend gate says so; show evidence strength |
| inconclusive | never render as ownership confirmed; offer case/evidence action |
| focus/selected | visible focus ring and selected route/tab semantics |

### Responsive/accessibility/browser evidence

Use the existing token-based UI primitives, avoid a new reset, provide keyboard
reachable links/buttons, labelled upload controls, semantic headings/tabs,
adequate contrast, screen-reader status announcements, and reduced-motion
fallbacks. Browser proof must cover authenticated desktop and mobile route
entry, Dashboard quick links, settings deep link, image/video detail modality
cards, and the ON/OFF choice notice.
