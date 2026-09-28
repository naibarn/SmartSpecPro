# Section 08 — Model Catalog + Transport Resolver

Feature: 135 Hermes Grok Media Worker
Plan reference: `claude-plan.md` §12 (plus the `mediaTransportResolver.ts` assignment from §3), TDD reference: `claude-plan-tdd.md` §12
Depends on: section-01-shared-contracts (widened `MediaTransport` union, `resolveMediaModelTransportConfig` hermes arm, `effectiveHermesCapability`, `hermesWorkerSettings.ts`, tenant flag `hermesMediaWorker`). Blocks: section-09-vd-surface-integration, section-10-client-web. Parallelizable with section-02-db-schema.
Test command: run from `apps/web` — `pnpm --dir apps/web test` (Vitest).

---

## 1. Purpose and background

This section makes "Grok via Hermes" exist as normal catalog entries and teaches the server-side transport resolver about the third transport:

1. **Seed script** `apps/web/scripts/seed-media-models-hermes-grok.ts` — three `media_models` rows (`hermes-grok/grok-imagine-image`, `hermes-grok/grok-imagine-image-quality`, `hermes-grok/grok-imagine-video`), **disabled by default** until rollout, with `configJson.transport === "hermes_worker"` so they flow through the shared transport plumbing section 01 already shipped.
2. **`server/services/mediaTransportResolver.ts` hermes branch** — `resolveMediaTransport` gains a `hermes_worker` arm plus the validation rule "`hermesConnectionId` requires `transport=hermes_worker`", the exact mirror of the existing rule at `mediaTransportResolver.ts:60-62` ("mcpConnectionId requires transport=mcp").

**Two-Grok-paths product rule (spec §3.1 — enforced by test):** the kie.ai gateway path already ships Grok models — `grok-imagine/text-to-image` with display name **"Grok Imagine"** (`scripts/seed-media-models-kie-ai.ts:1946`), plus `grok-imagine/image-to-video`, `grok-imagine-video-1-5-preview`, and the `modelRegistry.ts` entries at L559/L860. Those rows are **kept unchanged and offered side by side**. Every new row's display name must carry the "Grok via Hermes" distinction and must not equal any existing kie.ai Grok display name. Aliases must likewise not collide: the bare aliases `"grok"`, `"grok-imagine"`, `"grok-image"`, `"grok-video"` belong to the kie.ai rows — the new rows use hermes-qualified aliases only.

**Namespace rule (from section 01):** all new symbols use `hermesGrok` / `hermesMedia` / `hermes_worker` naming. Never reference `queueHermesWorkerJob` or `hermesAgentRuntime` (the unrelated agent-gateway lane).

**Callers of `resolveMediaTransport` (behavior for existing transports must stay byte-identical):** `server/routers/media.ts:3009` and `:3288`, `server/routers/verticalDramaCharacters.ts:514`, `server/routers/verticalDramaEpisodes.ts:2991`, `server/services/mediaGenerationService.ts:1775`. Section 09's generalized `resolveVdMediaTransportDecision` will consume the hermes metadata this section returns; section 05's scheduler remains the single authority for connection ownership/status/admission — the resolver branch here does shallow validation only and performs **no DB reads**.

---

## 2. Files to create / modify

| File | Action |
|---|---|
| `apps/web/scripts/seed-media-models-hermes-grok.ts` | NEW — 3 seed rows + configJson builder + pure upsert-row helper + CLI entry |
| `apps/web/server/services/mediaTransportResolver.ts` | EXTEND — `hermesConnectionId` input field, hermes branch, cross-transport connection-id rejections |
| `apps/web/shared/mcpConnectTypes.ts` | EXTEND — widen `McpCreditPolicy` union with `"provider_account"` (purely additive type change) |
| `apps/web/scripts/__tests__/seed-media-models-hermes-grok.test.ts` | NEW — tests |
| `apps/web/server/services/__tests__/mediaTransportResolver.test.ts` | EXTEND — hermes branch + validation-rule tests (file exists, currently pure-function tests only) |

Do NOT touch in this section: `shared/mediaModelTransport.ts` (its hermes arm shipped in section 01), any VD router or `media.ts` branch (section 09), `verticalDramaVideoPromptFormatter` `grok` family registration (section 09), model picker UI (section 10), `hermesMediaScheduler`/admission (section 05), `drizzle/schema.ts` (no schema change here at all).

---

## 3. Tests first (write these before implementing)

### 3.1 `scripts/__tests__/seed-media-models-hermes-grok.test.ts`

Model the file on `scripts/__tests__/seed-media-models-mcp-providers.test.ts` (import exported builders, no DB).

Seed data shape:

- `HERMES_GROK_MEDIA_MODEL_SEEDS` exports exactly 3 entries with `modelId` values `"hermes-grok/grok-imagine-image"`, `"hermes-grok/grok-imagine-image-quality"` (both `modelType: "image"`) and `"hermes-grok/grok-imagine-video"` (`modelType: "video"`);
- every display name contains `"Grok via Hermes"`; names are mutually distinct; **no name equals the literal `"Grok Imagine"`** (the kie.ai row's name) — assert against the literal string, not a fixture;
- `provider === "hermes-grok"` and `creditCost === 0` on all rows;
- no seed's `aliases` array contains any of `"grok"`, `"grok-imagine"`, `"grok-image"`, `"grok-video"` (bare kie.ai aliases); every alias is hermes-qualified (e.g. contains `"hermes"`).

configJson (`buildHermesGrokMediaModelConfigJson(seed)`):

- `transport === "hermes_worker"`; `hermes.providerType === "xai_grok"`; `hermes.providerModelId` non-empty per row;
- `creditSource`/pricing block resolves to provider-account semantics (pricing `formula: "provider_account"`, `defaultCredits: 0` — copy the MCP builder's pricing block shape);
- `supportsReferenceImages: true` with `referenceImageLimit: 3` on the two image rows (image-edit ≤3 refs) and `referenceImageLimit: 1` on the video row (single start frame);
- `aspectRatios` deep-equals `["9:16", "16:9", "1:1"]` on all rows; the video row carries `durations`;
- `inputFields` include a reference-images entry whose `maxItems` matches `referenceImageLimit`.

Transport resolution against the REAL seeded config (TDD §12 item 2 — this is the re-test of section 01's fixture test against production data):

- for each seed, `resolveMediaModelTransportConfig({ provider, modelId, configJson: buildHermesGrokMediaModelConfigJson(seed) })` returns `{ transport: "hermes_worker", providerKey: "hermes-grok", providerModelId: <seed's hermes.providerModelId>, creditSource: "provider_account" }`;
- regression guard: an existing kie.ai-style fixture (`configJson` without a `transport` key) still resolves `gateway_api` / `smartspec_credits`, and an mcp fixture still resolves `mcp` / `provider_account`.

Upsert semantics (pure helper `computeHermesGrokUpsertRow(existingRow | undefined, seed)`):

- no existing row → resulting row has `isEnabled: false` (disabled by default);
- existing row with `isEnabled: true` → result preserves `isEnabled: true` while `name`/`description`/`configJson` are refreshed from the seed (admin enablement survives re-seeding);
- idempotent: applying the helper twice with the same seed yields a deep-equal row (upsert re-run is a no-op).

### 3.2 `server/services/__tests__/mediaTransportResolver.test.ts` (extend)

Mock modules with `vi.mock` (the resolver's static imports): `../tenantFeatureFlagService` (`getTenantFeatureFlags`), `../hermesWorkerSettings` (`getHermesWorkerSettings`), `../mcpConnectionSharingService` (`assertMcpSharePolicyAllowed`), `../../db` (`getDb`). Default mock state: tenant flag `hermesMediaWorker: true`, settings `enabled: true`.

Validation rules (TDD §12 item 3 — the mirror of the mcpConnectionId rule):

- gateway request (no `requestedTransport`, or `"gateway_api"`) carrying `hermesConnectionId` → throws `TRPCError` `BAD_REQUEST` with message `"hermesConnectionId requires transport=hermes_worker"`;
- `requestedTransport: "mcp"` carrying `hermesConnectionId` → same `BAD_REQUEST`;
- `requestedTransport: "hermes_worker"` carrying `mcpConnectionId` → `BAD_REQUEST` `"mcpConnectionId requires transport=mcp"` (reverse mirror);
- `requestedTransport: "hermes_worker"` with no `hermesConnectionId` → `BAD_REQUEST` `"Hermes connection is required"` (parallel to the MCP branch's `"MCP connection is required"` at L86-88).

Hermes branch behavior:

- fail-closed flags: tenant flag `hermesMediaWorker: false` → `FORBIDDEN`; flag true but `getHermesWorkerSettings().enabled === false` → `FORBIDDEN` (kill switch);
- happy path returns metadata `{ transport: "hermes_worker", tenantId, originSurface, assetType, actorUserId, connectionId: <hermesConnectionId>, providerKey: "hermes-grok", providerModelId: <input>, creditPolicy: "provider_account", idempotencyKey: <input> }`;
- the hermes branch never calls `assertMcpSharePolicyAllowed` and never calls `getDb` (assert both spies uncalled — no DB reads; connection authorization is section 05's job).

Regressions:

- the two existing pure-function tests pass unchanged;
- gateway happy path (no connection ids) returns the exact metadata shape it returns today (add this snapshot-style assertion if not already covered — the branch must be byte-identical).

---

## 4. Implementation details

### 4.1 `scripts/seed-media-models-hermes-grok.ts` (new)

Copy the structure of `scripts/seed-media-models-mcp-providers.ts` (postgres client from `DATABASE_URL`, per-row `INSERT ... ON CONFLICT ("modelId") DO UPDATE`, `isMainModule` guard, `--dry-run` flag), with these deliberate differences:

- **Insert `isEnabled` as `false`** (the MCP script inserts `true`); the conflict clause keeps `"isEnabled" = media_models."isEnabled"` so re-runs preserve whatever the admin set. This pair of behaviors is what `computeHermesGrokUpsertRow` encodes for unit tests — implement the script's upsert by delegating row computation to that exported pure helper (read-modify-write or mirror it in the SQL; either way the helper is the tested source of truth for the semantics).
- Exports for tests: `HERMES_GROK_MEDIA_MODEL_SEEDS`, `buildHermesGrokMediaModelConfigJson`, `computeHermesGrokUpsertRow`, `seedHermesGrokMediaModels(options: { dryRun?: boolean })`.

Seed rows (spec §10.4 + plan §12):

| modelId | modelType | name (example) | providerModelId | refLimit | notes |
|---|---|---|---|---|---|
| `hermes-grok/grok-imagine-image` | image | `Grok Imagine (Grok via Hermes)` | `grok-imagine-image` | 3 | ops: image.generate + image.edit |
| `hermes-grok/grok-imagine-image-quality` | image | `Grok Imagine Quality (Grok via Hermes)` | `grok-imagine-image-quality` | 3 | same ops, quality default param |
| `hermes-grok/grok-imagine-video` | video | `Grok Imagine Video (Grok via Hermes)` | `grok-imagine-video` | 1 | ops: video.generate + video.image_to_video; single start frame |

- `provider: "hermes-grok"`, `creditCost: 0`, `aspectRatios: ["9:16", "16:9", "1:1"]` (9:16 first — VD-primary), priority/sortOrder placed in an unused band near the other Grok rows.
- Video `durations`: copy the values from the kie.ai `grok-imagine-video-1-5-preview` row in `scripts/seed-media-models-kie-ai.ts` (same underlying model — duration options must match what the provider actually renders).
- The slash-delimited `provider/model` id convention intentionally matches the MCP convention and keeps `hermes-grok/grok-imagine-video` resolvable to formatter family `grok` (its id contains `grok-imagine`) — the actual `detectProviderFamily` registration happens in section 09; this section only guarantees the id/alias strings make it possible.

`configJson` shape per row (consumed by section 01's `resolveMediaModelTransportConfig`, section 05's contract builder, section 09's reference trimmer via `effectiveHermesCapability`, section 10's form renderer):

```jsonc
{
  "transport": "hermes_worker",
  "hermes": {
    "providerType": "xai_grok",
    "providerModelId": "grok-imagine-image",
    "operationDefaults": { "aspectRatios": ["1:1", "9:16", "16:9"] }
  },
  "generateType": "text-to-image",          // video row: "image-to-video" capable
  "supportsReferenceImages": true,
  "referenceImageLimit": 3,                  // video row: 1
  "aspectRatios": ["9:16", "16:9", "1:1"],
  "inputFields": [ /* aspect_ratio select; reference_image_urls with maxItems = referenceImageLimit; video: duration select */ ],
  "pricing": { "formula": "provider_account", "defaultCredits": 0,
               "note": "Uses the connected Grok subscription; SmartSpecPro credits are not deducted (shared-pool fee handled by the scheduler)." }
}
```

`referenceImageLimit` here is the **model-row side** of the capability intersection — the effective limit at submit time is `effectiveHermesCapability(modelRow, connection.capabilitiesJson, operation)` (min/AND, section 01), so the manifest can narrow these values but the row values are the ceiling.

**DB safety when actually running the script (rollout time, not part of tests):** seed scripts are Medium risk — back up `media_models` to `.db-backups/` first (`pg_dump --data-only --table=media_models ...`), run `npx tsx scripts/seed-media-models-hermes-grok.ts`, verify row count grew by exactly 3 on first run and by 0 on re-run. No schema migration is involved in this section.

### 4.2 `server/services/mediaTransportResolver.ts` (extend)

1. Add `hermesConnectionId?: string` to `MediaTransportResolveInput`.
2. **Gateway early-return branch (L59-72):** beside the existing `mcpConnectionId` rejection, add: if `input.hermesConnectionId` → `TRPCError BAD_REQUEST "hermesConnectionId requires transport=hermes_worker"`. Return value otherwise unchanged.
3. **New hermes branch** — insert `if (input.requestedTransport === "hermes_worker") { ... }` immediately after the gateway branch, before any MCP flag logic:
   - reject `input.mcpConnectionId` → `BAD_REQUEST "mcpConnectionId requires transport=mcp"`;
   - flags, fail closed: `const flags = await getTenantFeatureFlags(input.tenantId)`; if `!flags.hermesMediaWorker` → `FORBIDDEN "Hermes media transport is disabled for this tenant"`; then `const settings = await getHermesWorkerSettings()`; if `!settings.enabled` → `FORBIDDEN "Hermes media worker is disabled"` (global kill switch; the scheduler re-checks per-scope flags — duplication is deliberate defense in depth, but per-scope logic stays out of this resolver);
   - require `input.hermesConnectionId` → else `BAD_REQUEST "Hermes connection is required"`;
   - return the metadata object listed in §3.2 (happy path). **No DB reads, no ownership check** — `hermesMediaScheduler` (section 05) authorizes the connection; this keeps a single source of truth and lets VD helpers call the resolver cheaply.
4. **MCP branch:** add the same `hermesConnectionId` rejection at its top (a request can never carry both ids).
5. Import `getHermesWorkerSettings` statically from `./hermesWorkerSettings` (services-layer import, mockable with `vi.mock`; the lazy-import guardrail applies to `_core/*` chains, not here).
6. **Error-message convention:** the two user-relevant rejections carry
   their typed code via the pinned section-01 helper —
   flag-disabled FORBIDDEN messages use
   `formatHermesErrorMessage("HERMES_DISABLED", …)` and the
   missing-connection BAD_REQUEST uses
   `formatHermesErrorMessage("HERMES_CONNECTION_REQUIRED", …)` — so
   section-10's `extractHermesErrorCode` can parse them. The
   developer-level cross-transport validation messages
   ("hermesConnectionId requires transport=hermes_worker" etc.) stay
   plain English (no code) — they indicate a client bug, not a user
   state. Update the §3.2 flag/connection test expectations to assert the
   `[HERMES_…]` prefix.

### 4.3 `shared/mcpConnectTypes.ts` — `McpCreditPolicy` widening

`MediaTaskTransportMetadata.creditPolicy` is typed `McpCreditPolicy = "smartspec_credits" | "provider_credits_tracked"`. Add `"provider_account"` to the union (matching `MediaModelTransportConfig.creditSource` vocabulary from section 01). This is additive; after the change run `pnpm check` and grep for switches/comparisons on `creditPolicy` — existing consumers use equality checks against the two old literals and must compile and behave unchanged. Do not rename the type (churn without value); leave a one-line comment that `"provider_account"` is the hermes_worker arm's value.

---

## 5. What this section explicitly does NOT do

- No routing behavior change for any surface — `media.ts` `generateImageAsync`/`generateVideoAsync` three-way branch and the VD helper generalization are section 09.
- No `detectProviderFamily` / prompt-formatter registration (section 09).
- No client picker badge, disabled-reason states, or `HermesConnectionPicker` (section 10).
- No scheduler, admission, connection authorization, or fee logic (section 05).
- No schema/migration work and no edits to kie.ai Grok rows, `modelRegistry.ts`, or `mediaModelSelection.ts` — the existing gateway Grok path stays untouched.
- No enabling of the seeded rows — they ship disabled; enablement is an admin rollout action.

---

## 6a. IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 27 tests (seed 16, resolver 11); --dry-run prints 3
rows with zero DB connection; typecheck baseline unchanged; rows NOT
seeded to the DB (rollout action).

As planned, plus review-driven items:

1. `"creditCost" = EXCLUDED."creditCost"` added to the ON CONFLICT clause
   (helper/SQL parity — review MEDIUM).
2. Both HERMES_DISABLED throws (tenant flag vs global kill switch) use
   formatHermesErrorMessage with distinct detail suffixes.
3. Known ride-along: the committed mediaTransportResolver.ts also carries
   a concurrent MCP-sharing session's uncommitted auto-resolve hunk
   (L150-183 + sharedGroupId change) — identified in review, untested by
   its owner, accepted per shared-tree policy with this note.
4. CARRY-FORWARD registered for sections 09/10 (REQUIRED):
   `client/src/lib/storyboardReviewWorkspace.ts` L574/L585 normalizer
   narrows transport→gateway_api and creditPolicy→smartspec_credits —
   must gain hermes_worker/provider_account branches before hermes is
   offered on the storyboard_review surface.

Exports for 09/10: HERMES_GROK_MEDIA_MODEL_SEEDS,
buildHermesGrokMediaModelConfigJson, computeHermesGrokUpsertRow,
seedHermesGrokMediaModels; model ids hermes-grok/grok-imagine-image,
-image-quality, -video; configJson keys per §4.1 (video durations 1–15
matching the kie.ai row).
Review trail: `../implementation/code_review/section-08-{diff,review,interview}.md`.

## 6. Verification / done criteria

1. New tests pass: `pnpm vitest run scripts/__tests__/seed-media-models-hermes-grok.test.ts server/services/__tests__/mediaTransportResolver.test.ts` from `apps/web`.
2. Full suite green (`pnpm --dir apps/web test`) — in particular every existing mcp/gateway transport test passes unchanged (resolver regression) and section 01's `hermesMediaTransport.test.ts` still passes against the real seed configJson.
3. `pnpm check` green after the `McpCreditPolicy` widening.
4. `npx tsx scripts/seed-media-models-hermes-grok.ts --dry-run` prints the 3 rows and exits without touching the DB.
5. Grep sanity: neither new/edited file references `queueHermesWorkerJob` or `hermesAgentRuntime`; no seed alias collides with the kie.ai bare Grok aliases (test-enforced).
6. Deployable dark: rows seeded disabled + tenant flag default false + global kill switch default false ⇒ no user-visible change until rollout flips them.