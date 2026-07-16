# Section 01 — Shared Contracts and Constants

Feature: 135 Hermes Grok Media Worker
Plan reference: `claude-plan.md` §3 (plus §12 for `effectiveHermesCapability`), TDD reference: `claude-plan-tdd.md` §3
Depends on: nothing (first section). Blocks: all other sections (02–12).
Test command: run from `apps/web` — `pnpm --dir apps/web test` (Vitest).

---

## 1. Purpose and background

This section lays down every shared symbol the rest of the feature builds on: job-type constants, the frozen media job contract (zod), the connection capability manifest type, the 22 typed error codes with Thai/English copy, the capability-intersection helper, the new `hermes_worker` transport arm in the shared transport resolver, the `hermesMediaWorker` tenant feature flag, and the TTL-cached `system_settings` reader (`hermesWorkerSettings.ts`). Everything here is pure/additive and deployable dark — no behavior changes for existing transports.

**Critical namespace rule (do not skip):** the codebase already contains an UNRELATED Hermes lane for agent-gateway work — `queueHermesWorkerJob` (in `server/services/workerSchedulerService.ts`), tenant flag `hermesAgentRuntime` (already in `shared/featureFlags.ts` around L58/L266/L473), jobType `external_agent_task`, and `shared/__tests__/hermesRolloutFeatureFlag.test.ts`. Every new symbol in this feature uses the `hermesMedia` / `hermes_media` namespace. Nothing from the agent-gateway lane is modified or reused (the only shared value in the whole feature is the `hermes_agent_gateway` runtime-type enum value, used later by section 07 — not touched here). This section ships the grep-style guard test that enforces the rule for all later sections.

**Frozen wire values:** the string constants below are wire/DB contract values shared between the web server, the shared server worker (section 07), and the Rust Worker App (section 11). Their literal values must never drift — tests assert them literally.

---

## 2. Files to create / modify

| File | Action |
|---|---|
| `apps/web/shared/hermesMedia.ts` | NEW — contract zod, manifest type, error codes + copy, `effectiveHermesCapability` |
| `apps/web/shared/workerRuntime.ts` | EXTEND — 5 job-type constants, claim capability, capability families |
| `apps/web/shared/mcpConnectTypes.ts` | EXTEND — `MediaTransport` union gains `"hermes_worker"` |
| `apps/web/shared/mediaModelTransport.ts` | EXTEND — `hermes_worker` branch in `resolveMediaModelTransportConfig` + label |
| `apps/web/shared/featureFlags.ts` | EXTEND — tenant flag `hermesMediaWorker` (default `false`) |
| `apps/web/server/services/hermesWorkerSettings.ts` | NEW — TTL-cached system_settings reader + cache-clear export |
| `apps/web/server/routers/systemSettings.ts` | EXTEND — cache-clear hooks in `updateSetting` and the delete path |
| `apps/web/shared/__tests__/hermesMedia.test.ts` | NEW — tests |
| `apps/web/shared/__tests__/hermesMediaWorkerRuntimeConstants.test.ts` | NEW — tests (or extend `workerRuntime.test.ts`) |
| `apps/web/shared/__tests__/hermesMediaTransport.test.ts` | NEW — tests |
| `apps/web/shared/__tests__/hermesMediaWorkerFeatureFlag.test.ts` | NEW — tests |
| `apps/web/server/services/__tests__/hermesWorkerSettings.test.ts` | NEW — tests |
| `apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts` | NEW — namespace guard test |

Do NOT touch in this section: `server/services/mediaTransportResolver.ts` (its hermes branch + the `hermesConnectionId` validation rule belong to section 08), `drizzle/schema.ts` (section 02), any router besides the systemSettings cache hooks.

---

## 3. Tests first (write these before implementing)

All from `claude-plan-tdd.md` §3, plus supporting tests for the pieces the section index assigns here. Vitest, no DB — services use injected/mocked `getDb`.

### 3.1 `shared/__tests__/hermesMedia.test.ts`

Contract schema (`hermesMediaJobContractSchema`):

- accepts a valid `image.edit` contract with 3 references (continuous indices 1..3, unique labels, sha256 present, `contractVersion: 1`, `traceId` present);
- rejects an `image.edit` contract with 4 references (operation-static max 3);
- rejects `video.image_to_video` with 0 or 2 references (exactly 1);
- rejects references with non-continuous indices (e.g. 1, 3);
- rejects two references whose labels claim the same index / duplicate labels;
- rejects a contract containing any URL-bearing field — e.g. a reference with an extra `downloadUrl` key must fail (references use `.strict()`; URLs are banned at rest per spec §13.1 claim-time-minting rule);
- rejects an unknown `operation` string.

Error copy (`hermesErrorCopy`):

- loop over every code in `HERMES_MEDIA_ERROR_CODES` (assert `length === 22`) and assert non-empty `th`, non-empty `en`, and `typeof retryable === "boolean"` — no missing copy;
- spot-assert retryability against spec §13.7: `HERMES_RATE_LIMITED` retryable, `HERMES_ENTITLEMENT_RESTRICTED` and `HERMES_JOB_CANCELLED` not retryable;
- assert the `HERMES_ENTITLEMENT_RESTRICTED` Thai copy is the spec §12.3 string ("เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API กรุณาตรวจสอบระดับสมาชิก").
- round-trip: `parseHermesErrorMessage(formatHermesErrorMessage(code, "detail"))`
  returns the code for every code in the list; `parseHermesErrorMessage` on a
  plain message returns null; formatted messages start with `[HERMES_` and the
  English copy.

Capability intersection (`effectiveHermesCapability`):

- `maxReferences` = min(model row value, manifest value) — assert both orderings;
- operation disabled when EITHER the model row disables it OR the manifest reports `enabled: false` (assert manifest `reason` is surfaced when present);
- a model-row value never widens a lower manifest value (model row 7, manifest 1 → 1);
- when the manifest has no opinion on a field, the model row default applies (spec §12.2 rule).

### 3.2 `shared/__tests__/hermesMediaWorkerRuntimeConstants.test.ts`

- literal wire values are frozen:
  `HERMES_MEDIA_IMAGE_JOB_TYPE === "hermes_media_image_generate"`,
  `HERMES_MEDIA_VIDEO_JOB_TYPE === "hermes_media_video_generate"`,
  `HERMES_CONNECTION_AUTH_JOB_TYPE === "hermes_connection_authorize"`,
  `HERMES_CONNECTION_PROBE_JOB_TYPE === "hermes_connection_probe"`,
  `HERMES_CONNECTION_DISCONNECT_JOB_TYPE === "hermes_connection_disconnect"`,
  `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY === "hermes_media"`,
  `HERMES_MEDIA_CAPABILITY_FAMILIES` deep-equals `["hermes-media-generation"]`;
- none of the five job types collide with any existing job-type constant exported from `workerRuntime.ts` (in particular not `external_agent_task`).

### 3.3 `shared/__tests__/hermesMediaTransport.test.ts`

- `resolveMediaModelTransportConfig` with `configJson: { transport: "hermes_worker", hermes: { providerType: "xai_grok", providerModelId: "grok-imagine-image" } }` returns `{ transport: "hermes_worker", providerKey: "hermes-grok", providerModelId: "grok-imagine-image", creditSource: "provider_account" }`;
- regression: existing mcp fixture still resolves `transport: "mcp"` / `creditSource: "provider_account"`; a plain/absent transport still resolves `gateway_api` / `smartspec_credits` (byte-identical to today);
- `getMediaModelTransportLabel` returns a distinct label for the hermes arm (`"Hermes"`), unchanged `"MCP"` / `"API"` otherwise.

(Section 12 of the TDD plan re-tests this against the real seeded configJson; here fixtures suffice.)

### 3.4 `shared/__tests__/hermesMediaWorkerFeatureFlag.test.ts`

- `"hermesMediaWorker"` is in `ALLOWED_FEATURE_FLAGS`, present in `FEATURE_FLAG_DEFAULTS` with value `false`, and typed on `TenantFeatureFlags`;
- it is a distinct key from `hermesAgentRuntime` (both exist; guard against accidental rename/merge).

Model on the existing pattern in `shared/__tests__/hermesRolloutFeatureFlag.test.ts` / `workpackFeatureFlags.test.ts`.

### 3.5 `server/services/__tests__/hermesWorkerSettings.test.ts`

Pattern: mock `getDb` (module mock, `vi.fn()` select chains) — same approach used by existing settings-service tests.

- absent rows → documented defaults: `hermes_worker_enabled=false`, `hermes_worker_shared_pool_enabled=false`, `hermes_worker_server_personal_enabled=false`, `hermes_worker_private_enabled=false`, `hermes_worker_video_enabled=false`, `hermes_shared_pool_fee_credits=0`, limits per spec §9 table (running/connection 1, worker concurrency 2, queued/user 8, queued/tenant shared pool 20, submissions 10/user + 60/tenant per 10 min sliding), `hermes_worker_min_version=""` (no floor), `hermes_shared_worker_id=null`, `web_process_hermes_worker_enabled=false` (env fallback `SMARTSPEC_INLINE_HERMES_WORKER === "true"` only for this last key, mirroring `renderWorkerSettings.ts`);
- DB rows override defaults and are parsed (booleans from `"true"`, ints validated, malformed values fall back to defaults, never throw);
- TTL caching: second call within TTL does not hit the DB; `clearHermesWorkerSettingsCache()` forces a re-read (assert select called again);
- concurrent first calls share one in-flight refresh (de-dupe, cache-trio convention).

Note: the limit-coherence invariant (reject queued-cap < max batch size 4 at config WRITE time) is tested and implemented in section 05 — this reader only exposes the parsed values.

### 3.6 `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`

Grep-style test (fs walk + content scan, same style as other repo lint tests):

- assert that no file under `apps/web/server/hermesWorker/` (skip if the directory does not exist yet — it arrives in section 07) and none of the feature's new files (`shared/hermesMedia.ts`, `server/services/hermesWorkerSettings.ts`, plus later `hermesConnection*`, `hermesMedia*` services — build the list by glob `server/services/hermes*`, `shared/hermesMedia*`) contains the strings `queueHermesWorkerJob` or `hermesAgentRuntime`;
- exclude this test file itself from the scan.

This test intentionally grows in coverage automatically as later sections add files matching the globs.

---

## 4. Implementation details

### 4.1 `shared/workerRuntime.ts` (extend)

Append a clearly-commented Feature-135 block (follow the file's existing convention for constant blocks such as `REMOTION_RENDER_VIDEO_*` at ~L1317):

```ts
// Feature 135 — Hermes Grok media worker (namespace: hermes_media / hermesMedia).
// NOT related to the agent-gateway Hermes lane (external_agent_task).
export const HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate";
export const HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate";
export const HERMES_CONNECTION_AUTH_JOB_TYPE = "hermes_connection_authorize";
export const HERMES_CONNECTION_PROBE_JOB_TYPE = "hermes_connection_probe";
export const HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect";
export const HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media";
export const HERMES_MEDIA_CAPABILITY_FAMILIES = ["hermes-media-generation"] as const;
```

If the file maintains an aggregate registry of capability families or job types (see how `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` and `VERTICAL_DRAMA_FFMPEG_ASSEMBLY_CAPABILITY_FAMILIES` are folded into union types around L360/L1379), register the new families/types there the same way. Add doc comments noting the claim-capability precedent (remotion) that section 05 will wire into `claimWorkerJob`.

### 4.2 `shared/hermesMedia.ts` (new)

Single source of truth for the job contract, manifest, error codes, and capability math. Imports allowed: `zod` only (must stay importable by client, server, and the section-07 worker process — no db/server imports). Skeleton:

```ts
import { z } from "zod";

/** Provider-neutral operation taxonomy (spec §13.1). */
export const HERMES_MEDIA_OPERATIONS = [
  "image.generate", "image.edit",
  "video.generate", "video.image_to_video", "video.reference_to_video",
] as const;
export type HermesMediaOperation = (typeof HERMES_MEDIA_OPERATIONS)[number];

/** Operation-static reference bounds (capability manifest may narrow, never widen). */
export const HERMES_OPERATION_REFERENCE_BOUNDS: Record<HermesMediaOperation, { min: number; max: number }>;
// image.generate 0..0, image.edit 1..3, video.generate 0..0,
// video.image_to_video 1..1, video.reference_to_video 1..7

export const hermesMediaReferenceSchema = z.object({
  assetId: z.string().min(1),
  index: z.number().int().positive(),
  role: z.string().min(1),
  label: z.string().min(1),
  sha256: z.string().length(64),
}).strict(); // .strict() is the URL ban — no downloadUrl/url keys can ride along

export const hermesMediaJobContractSchema = z.object({
  contractVersion: z.literal(1),
  operation: z.enum(HERMES_MEDIA_OPERATIONS),
  connectionId: z.string().min(1),
  prompt: z.string().min(1),
  settings: z.object({
    model: z.string().min(1),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    outputCount: z.number().int().min(1).max(4).optional(),
    durationSeconds: z.number().int().positive().nullable().optional(),
  }).strict(),
  references: z.array(hermesMediaReferenceSchema),
  entity: z.object({ type: z.string(), id: z.string() }).passthrough().optional(),
  storage: z.object({ libraryFolderId: z.string().optional() }).strict().optional(),
  traceId: z.string().min(1),
}).strict().superRefine(/* per-operation reference-count bounds; indices continuous
  starting at 1; unique indices; unique labels */);

export type HermesMediaJobContract = z.infer<typeof hermesMediaJobContractSchema>;

/** Capability manifest stored in hermes_provider_connections.capabilitiesJson (spec §12.2). */
export interface HermesConnectionCapabilityManifest {
  hermesVersion: string;
  probedAt: string;
  operations: Partial<Record<HermesMediaOperation, {
    enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string;
  }>>;
  models: { image: string[]; video: string[] };
}

export const HERMES_MEDIA_ERROR_CODES = [
  "HERMES_DISABLED", "HERMES_CONNECTION_REQUIRED", "HERMES_CONNECTION_BUSY",
  "HERMES_WORKER_UNAVAILABLE", "HERMES_RATE_LIMITED", "HERMES_QUEUE_FULL",
  "HERMES_QUOTA_EXHAUSTED", "HERMES_OAUTH_SESSION_EXPIRED", "HERMES_OAUTH_DENIED",
  "HERMES_REAUTH_REQUIRED", "HERMES_ENTITLEMENT_RESTRICTED",
  "HERMES_OPERATION_UNSUPPORTED", "HERMES_REFERENCE_LIMIT_EXCEEDED",
  "HERMES_REFERENCE_MAPPING_CONFLICT", "HERMES_REFERENCE_DOWNLOAD_FAILED",
  "HERMES_PROCESS_FAILED", "HERMES_TIMEOUT", "HERMES_RESULT_INVALID",
  "HERMES_OUTPUT_INVALID", "HERMES_UPLOAD_FAILED",
  "HERMES_LIBRARY_REGISTRATION_FAILED", "HERMES_JOB_CANCELLED",
] as const; // exactly the 22 codes of spec §13.7, in table order
export type HermesMediaErrorCode = (typeof HERMES_MEDIA_ERROR_CODES)[number];

/** Thai-primary + English copy and retryability per spec §13.7. */
export function hermesErrorCopy(code: HermesMediaErrorCode): { th: string; en: string; retryable: boolean };

/** THE canonical error-code wire convention (pure string helpers — this file
 *  must stay importable by the client, so no @trpc/server import here).
 *  Server sections (03/05/08/09) throw
 *  `new TRPCError({ code: <httpish>, message: formatHermesErrorMessage(code, detail?) })`
 *  — i.e. message = `[HERMES_X] <english copy>[ — detail]`. A TRPCError's
 *  `cause` does NOT serialize to the client, so the message prefix is the
 *  one zero-infrastructure channel; section-10's extractHermesErrorCode
 *  parses it back with parseHermesErrorMessage. Never hand-format codes. */
export function formatHermesErrorMessage(code: HermesMediaErrorCode, detail?: string): string;
export function parseHermesErrorMessage(message: string): HermesMediaErrorCode | null;

/** Effective capability = intersection of the global media_models row and the
 *  per-connection manifest (spec §12.2 rule): enabled = row AND manifest;
 *  numeric limits = min(row, manifest); row supplies defaults only when the
 *  manifest has no opinion. Used by the section-05 submit validator, the
 *  section-09 reference trimmer, and the section-10/13 client forms. */
export function effectiveHermesCapability(
  modelRow: { enabled?: boolean; maxReferences?: number; maxOutputs?: number },
  manifest: HermesConnectionCapabilityManifest | null | undefined,
  operation: HermesMediaOperation,
): { enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string };
```

Retryability flags follow the spec §13.7 table exactly (retryable: CONNECTION_BUSY, RATE_LIMITED, QUEUE_FULL, REFERENCE_DOWNLOAD_FAILED, PROCESS_FAILED, TIMEOUT, RESULT_INVALID, UPLOAD_FAILED, LIBRARY_REGISTRATION_FAILED; all others false). Copy is a plain in-file record — Thai primary, English secondary; keep messages user-safe (no paths/tokens/internal ids).

### 4.3 `shared/mcpConnectTypes.ts` + `shared/mediaModelTransport.ts` (extend)

- `MediaTransport` (mcpConnectTypes.ts L1) becomes `"gateway_api" | "mcp" | "hermes_worker"`. After widening, run `pnpm check` and fix any now-non-exhaustive switches by keeping current behavior for the two existing arms and leaving hermes to later sections (fail-closed/explicitly unhandled where relevant) — do not add routing behavior here.
- `resolveMediaModelTransportConfig`: read `config.hermes` record; when `rawTransport === "hermes_worker"` return `transport: "hermes_worker"`, `providerKey: "hermes-grok"` (constant per plan §3), `providerModelId` from `hermes.providerModelId` ?? existing fallbacks, `creditSource: "provider_account"`. Existing mcp/gateway resolution stays byte-identical (default branch still `gateway_api`).
- `getMediaModelTransportLabel`: `"hermes_worker"` → `"Hermes"`.

### 4.4 `shared/featureFlags.ts` (extend)

Add `hermesMediaWorker: boolean` to the `TenantFeatureFlags` interface (comment: "F135 — Hermes Grok media worker; unrelated to hermesAgentRuntime"), add `"hermesMediaWorker"` to `ALLOWED_FEATURE_FLAGS` (L216 set) and `hermesMediaWorker: false` to `FEATURE_FLAG_DEFAULTS` (L423). Follow the exact pattern of the neighboring F131/F132 flag additions. No helper functions needed here (section 05 reads the flag through the existing tenant-flag plumbing).

### 4.5 `server/services/hermesWorkerSettings.ts` (new)

Copy the `renderWorkerSettings.ts` structure (cache-trio: `cachedValue` / `cacheExpiresAt` / `refreshPromise`, `CACHE_TTL_MS = 30_000`, de-duped in-flight refresh), but load ALL keys in one query (`category = "infrastructure"`, `key IN (...)`) into a typed settings object:

```ts
export interface HermesWorkerSettings {
  enabled: boolean;                      // hermes_worker_enabled (default false — kill switch)
  sharedPoolEnabled: boolean;            // hermes_worker_shared_pool_enabled (false)
  serverPersonalEnabled: boolean;        // hermes_worker_server_personal_enabled (false)
  privateEnabled: boolean;               // hermes_worker_private_enabled (false)
  videoEnabled: boolean;                 // hermes_worker_video_enabled (false)
  sharedPoolFeeCredits: number;          // hermes_shared_pool_fee_credits (0)
  maxRunningPerConnection: number;       // hermes_max_running_per_connection (1)
  maxConcurrentPerSharedWorker: number;  // hermes_max_concurrent_per_shared_worker (2)
  maxQueuedPerUser: number;              // hermes_max_queued_per_user (8)
  maxQueuedPerTenantSharedPool: number;  // hermes_max_queued_per_tenant_shared_pool (20)
  submitWindowPerUser: number;           // hermes_submit_window_per_user (10 / 10 min sliding)
  submitWindowPerTenant: number;         // hermes_submit_window_per_tenant (60 / 10 min sliding)
  minHermesVersion: string;              // hermes_worker_min_version ("" = no floor)
  sharedWorkerId: string | null;         // hermes_shared_worker_id (null until pairing script writes it)
  webProcessWorkerEnabled: boolean;      // web_process_hermes_worker_enabled (false; env fallback
                                         //   SMARTSPEC_INLINE_HERMES_WORKER === "true", dev only)
}

export async function getHermesWorkerSettings(): Promise<HermesWorkerSettings>;
export function clearHermesWorkerSettingsCache(): void;
```

Parsing is defensive: booleans from `"true"`, integers via `Number.parseInt` with `Number.isFinite` + positivity checks, anything malformed → the documented default; the loader never throws (catch → all defaults, matching `renderWorkerSettings.ts` L37-59). Export the key names as constants so section 05's write-path validator and section 12's admin panel reference the same strings.

### 4.6 `server/routers/systemSettings.ts` cache hooks (extend)

In `updateSetting` — note the two branches are the REVERSE of what a quick skim suggests: the **delete/clear path** is the `if (input.clear)` branch (~L728-758, its render-worker cache clear at L755-758) and the **normal set-value hook cluster** comes after it (~L814-834, cache clear at L821-823) — mirror the `clearRenderWorkerSettingsCache` pattern in BOTH: when `category === "infrastructure"` and the key starts with `hermes_` or `web_process_hermes_worker_enabled`, lazily `await import("../services/hermesWorkerSettings")` and call `clearHermesWorkerSettingsCache()`. Keep the lazy-import chain convention (see memory note: lazy-import โซ่ `_core/*` — do not add a top-level import that drags the settings service into router module init).

Start/stop hooks for the dev in-web drainer (`web_process_hermes_worker_enabled` toggling an inline worker) are section 07's concern — here only the cache clear.

---

## 5. What this section explicitly does NOT do

- No DB schema (`hermes_provider_connections` — section 02).
- No `mediaTransportResolver.ts` branch or `hermesConnectionId` validation (section 08).
- No scheduler/admission logic, no limit-coherence write validation (section 05).
- No routers/services beyond `hermesWorkerSettings.ts` (sections 03–06).
- No worker process, no systemd unit, no fake `hermes` CLI fixture (sections 04/07).

---

## 6. Verification / done criteria

1. All new tests in §3 pass: `pnpm --dir apps/web test` (or targeted: `pnpm vitest run shared/__tests__/hermesMedia.test.ts server/services/__tests__/hermesWorkerSettings.test.ts` from `apps/web`).
2. Full existing suite still green (transport-union widening must not regress any mcp/gateway test).
3. `pnpm check` (tsc) green — especially after widening `MediaTransport`.
4. Grep sanity: `HERMES_MEDIA_ERROR_CODES` has exactly 22 entries; no new file references `queueHermesWorkerJob` / `hermesAgentRuntime` (namespace guard test enforces).
5. Deployable dark: with all flags/settings absent, every reader resolves to disabled/defaults and no user-visible behavior changes.

---

## 7. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 42 tests green (6 targeted files); `pnpm check` baseline
unchanged (140 pre-existing errors, none in these files); full `shared/`
suite: only the 5 known pre-existing unrelated failures.

As planned, plus these deviations:

1. **Two out-of-plan client files edited** (forced by the `MediaTransport`
   union widening, per §6 done-criterion 3): `client/src/pages/AdminMediaModels.tsx`
   and `client/src/pages/StoryboardReviewPage.tsx` had local
   `"gateway_api" | "mcp"` literal types. Initial fail-closed coercion was
   flagged MAJOR in code review (save-path would clobber `hermes_worker`
   transport on Edit→Save once hermes rows exist) — final fix widens both
   local types to `MediaTransport` and passes the real resolved transport
   through (comment notes hermes-aware admin UI ships in sections 10/12).
2. **`maskTokenLike` implemented here** (section-04's additive block landed
   with section-01 since the file was being created): own-convention doc
   comment + 5 unit tests (review MEDIUM fix).
3. **`hermesMediaCapabilityFamilySchema` z.enum added** to workerRuntime.ts
   (sibling convention parity; review NIT fix).
4. `workerRuntime.ts` has NO aggregate job-type registry today — nothing to
   fold constants into (section's conditional instruction was a no-op).
5. Namespace-guard test note: doc comments in guarded files must paraphrase
   (not spell) the agent-gateway symbols or they trip the guard.

Review trail: `../implementation/code_review/section-01-{diff,review,interview}.md`.
Exports for later sections confirmed: `HERMES_WORKER_SETTINGS_KEYS`,
`formatHermesErrorMessage`/`parseHermesErrorMessage`, `maskTokenLike`,
`effectiveHermesCapability`, `hermesMediaCapabilityFamilySchema`.