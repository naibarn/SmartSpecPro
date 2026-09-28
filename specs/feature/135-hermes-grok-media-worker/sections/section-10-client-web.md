# Section 10 — Client (Web): Pickers, Connect Flow, Model-Picker Gating, VD Panel Wiring, Error Copy

**Section id:** `section-10-client-web`
**Plan reference:** `claude-plan.md` §13 (with context from §5, §11, §12); `claude-plan-tdd.md` §13; `spec.md` §11.3–11.5, §12.0–12.4, §13.7.
**Depends on:**
- `section-03-connection-service-router` — tRPC router `hermesConnections` (`listConnections`, `getConnection`, `getAvailability`, `startConnect`, `getConnectStatus`, `setDefault`, `disconnect`, `probe`, `adminList`, `adminSetQuota`, `adminDisable`), `SafeHermesConnection` shape.
- `section-04-connection-control-jobs` — device-code event contract surfaced by `getConnectStatus` (`{ verificationUrl, userCode, expiresAt }`), typed failure codes.
- `section-08-model-catalog-transport` — `shared/mediaModelTransport.ts` transport union with `"hermes_worker"`; `resolveMediaModelTransportConfig` hermes branch; seeded "Grok via Hermes" model rows.
- `section-09-vd-surface-integration` — server resolvers accept `hermesConnectionId` input on all 10 VD surfaces; task polling contract (`hermes_` taskIds) already works through `trpc.media.getTask`.
- `section-01-shared-contracts` (transitively) — `hermesErrorCopy(code)` + `HERMES_MEDIA_ERROR_CODES` in `shared/hermesMedia.ts`.

**Blocks:** nothing (leaf section; runs in parallel with section-11).
**Test command:** `pnpm --dir apps/web test` (Vitest, jsdom + RTL for components, extracted-helper `.test.ts` for page logic).

---

## 1. Objective

All client-side (React) work for the Hermes/Grok media transport:

1. **`HermesConnectionPicker.tsx`** (new) — the per-generation connection selector, mirroring `McpConnectionPicker.tsx`.
2. **`HermesConnectPanel.tsx`** (new) — Settings → AI Providers → "Grok via Hermes": connection list, one-time consent notice, device-code screen, private-worker selector, reconnect/disconnect/probe/default actions, capability + entitlement display, admin sub-panel for `server_shared`.
3. **Model picker integration** — "Grok via Hermes" badge + disabled-with-reason states; the `modelUsesHermes` gating rule mirroring `imageModelUsesMcp` (hermes model selected ⇒ HermesConnectionPicker shown, generate disabled until a connection is chosen).
4. **VD panel wiring** — `hermesConnectionId` state/persistence in CharacterStock + LocationStock panels; prop threading `EpisodePage → EpisodeWorkspace → StoryboardPanel` (ReferenceFrameDialog + angle-variation UI inherit); EpisodePage three-layer model memory treats hermes models identically, with an authorized-connection **hydration guard**; mutation inputs carry `hermesConnectionId` wherever they carry `mcpConnectionId` today.
5. **Error copy rendering** — all 22 typed codes render their Thai/English copy + retry affordances (retry-after for queue/limit rejections).

Everything here is client code plus zero-to-minimal glue; **no new server procedures** are needed (the private-worker selector reuses the existing `trpc.users.listConnectedWorkers`).

**Landing order (phase gate — spec §18, mirrors section-09):** two landable
increments. **Increment A (phase 2, image):** pickers, connect panel, model
picker gating, VD panel wiring for image surfaces, error presentation.
**Increment B (phase 3, video):** video-model gating (`videoModelUsesHermes`),
video-clip mutation inputs, video-mode picker states. Land A with
section-09's increment A; B with its increment B.

## 2. Background you need

### 2.1 Server API you consume (section-03; do not change it)

- `trpc.hermesConnections.listConnections.useQuery({ assetType? })` → `SafeHermesConnection[]`:
  `{ id, scope: "server_shared"|"server_personal"|"private_worker", status, accountLabel, accountHint, defaultForImage, defaultForVideo, entitlementStatus, assignedWorkerId, assignedWorkerOnline: boolean, capabilitySummary: { probedAt, imageEnabled, videoEnabled, maxEditReferences }, dailyJobQuota, createdAt, authorizedAt }`. Never any token-like field.
- `trpc.hermesConnections.getAvailability.useQuery()` → `{ enabled, videoEnabled, scopes: { serverShared, serverPersonal, privateWorker } }`. This + `listConnections` is the client's **only** readiness source (no separate readiness service).
- `trpc.hermesConnections.startConnect.useMutation()` input `{ scope, workerId?, label?, consentAcknowledged: boolean }` → `{ connectionId }`. The service rejects `consentAcknowledged: false` — the client must gate the button, but the server is authoritative.
- `trpc.hermesConnections.getConnectStatus.useQuery({ connectionId })` → `{ status, verificationUrl?, userCode?, expiresAt?, errorCode? }`. Poll this while a connect is in flight (`refetchInterval`).
- `setDefault({ connectionId, assetType })`, `disconnect({ connectionId })`, `probe({ connectionId })`, `getConnection({ connectionId })` (detail incl. capability manifest), `adminList` / `adminSetQuota` / `adminDisable` (admin only).
- Private workers list: `trpc.users.listConnectedWorkers` (`protectedProcedure`, `apps/web/server/routers/users.ts:1223`) already returns the caller's own workers with `{ id, displayName, runtimeType, status, lastSeenAt, ... }` — use it for the private-worker selector; do NOT add a new procedure.

### 2.2 Client templates to copy (read these before writing code)

- `apps/web/client/src/components/media/McpConnectionPicker.tsx` — the exact component shape to mirror (eligibility filter, auto-select-single effect, empty state with settings link, `<select>` UI). Note: Hermes has **no sharedGroupId dimension** — the option value is just `connection.id`, so the picker is simpler.
- `apps/web/client/src/components/media/__tests__/McpConnectionPicker.test.tsx` — RTL + `vi.hoisted`/`vi.mock("@/lib/trpc")` test pattern.
- `apps/web/client/src/components/settings/McpConnectPanel.tsx` + `__tests__/McpConnectPanel.test.tsx` — settings-panel structure (DashboardCard, Tabs, mutations with toast, `utils.*.invalidate()`), the trpc-mock test scaffold, and `formatThaiDateTime`.
- `apps/web/client/src/pages/Settings.tsx` — `McpConnectPanel` is imported at L75 and rendered at ~L2530; register `HermesConnectPanel` adjacent.
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx` — the guarded `safeStorageGet/Set/Remove` helpers (L192–217), `MCP_CONNECTION_ID_STORAGE_KEY = "smartspec_mcp_connection_id"` shared-across-surfaces precedent (L179–229), `imageModelUsesMcp` gate (L832+), and the build-mutation-input pattern that conditionally spreads `mcpConnectionId` (L861–864). **State-first ordering** (storage writes never before/blocking the real action) is a hard rule (memory: QuotaExceeded once blocked model selection).
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` — `imageModelUsesMcp`/`videoModelUsesMcp` derivation via `resolveMediaModelTransportConfig(...).transport === "mcp"` (L2318–2325); three-layer model memory (`vdModelStorageKey` L465, `readStoredSeriesModelDefault`/`storeSeriesModelDefault` L507–521, auto-hydration effect ~L1806/L1828); mutation inputs carrying `mcpConnectionId` (L2684, L3149, L3163, L4493, L4579 — line numbers drift as the file grows; locate by grepping `mcpConnectionId:` rather than trusting numbers).
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx` — controlled prop contract: `mcpConnectionId` prop (L988), `McpConnectionPicker` render (~L2500). Add `hermesConnectionId` + `onHermesConnectionChange` beside them.
- `apps/web/client/src/components/media/ModelSelectorDialog.tsx` — transport badge rendering (~L323) — add the `hermes_worker` badge branch.
- Existing EpisodePage tests live as **extracted-pure-helper** tests in `apps/web/client/src/pages/__tests__/VerticalDramaEpisodePage.*.test.ts` — do NOT try to render the whole page; export a pure helper and test it.

### 2.3 Shared helpers you consume

- `resolveMediaModelTransportConfig(configJson)` from `@shared/mediaModelTransport` (section-08) — returns `{ transport: "hermes_worker", providerKey: "hermes-grok", ... }` for hermes rows. `modelUsesHermes = transport === "hermes_worker"`.
- `hermesErrorCopy(code)` + `HERMES_MEDIA_ERROR_CODES` + `HermesMediaErrorCode` from `@shared/hermesMedia` (section-01) — `{ th, en, retryable }` for each of the 22 codes (`HERMES_DISABLED` … `HERMES_JOB_CANCELLED`, spec §13.7). Typed codes arrive to the client via (a) tRPC error convention established in section-01/03 (code embedded in `message`/`cause`) and (b) the task projection's `errorCode` (section-06).
- Section-03 note: `server_shared` scope labels — Thai copy for scope badges: `ส่วนกลาง` (server_shared) / `ส่วนตัวบนเซิร์ฟเวอร์` (server_personal) / `เครื่องของฉัน` (private_worker).

## 3. TDD — write these tests FIRST

All jsdom tests start with `/** @vitest-environment jsdom */` and mock `@/lib/trpc` with the `vi.hoisted` pattern from `McpConnectPanel.test.tsx`.

### 3.1 `apps/web/client/src/components/media/__tests__/HermesConnectionPicker.test.tsx` (new)

- renders only `status === "authorized"` connections whose `capabilitySummary` enables the requested `assetType` (`imageEnabled` for `assetType: "image"`, `videoEnabled` for video); `pending`/`disconnected`/`error` rows never render as options.
- auto-selects when exactly one eligible connection exists and `value` is null (`onChange` called once with its id); does not auto-select when 2+ eligible.
- clears a stale selection: `value` pointing at a connection that is no longer eligible → `onChange(null)` (mirror of the MCP resolvedConnection effect).
- shows the scope badge text per scope (ส่วนกลาง / ส่วนตัวบนเซิร์ฟเวอร์ / เครื่องของฉัน) in the option/label.
- a row with `assignedWorkerOnline: false` renders **disabled with a reason** (Worker offline copy; for `private_worker` scope the copy says to start the Worker App) and cannot be selected.
- `reauth_required` / `entitlement_restricted` rows render disabled with their status reason (they are default-eligible statuses server-side but not job-eligible — the picker must not offer them for generation).
- empty state links to the settings connect page (assert the link href to Settings AI-providers tab) — no crash, no auto-select.

### 3.2 `apps/web/client/src/components/settings/__tests__/HermesConnectPanel.test.tsx` (new)

- **consent gate:** the Connect button (per scope) opens the consent notice; `startConnect` is NOT called until the user acknowledges (checkbox/confirm); after acknowledgment, `startConnect` is called with `consentAcknowledged: true` and the chosen scope; the `server_shared` pool-wide-sharing addendum sentence renders for that scope and does NOT render for `server_personal`/`private_worker`.
- **scope availability:** with `getAvailability` returning `scopes.privateWorker: false`, the private-worker connect entry is hidden/disabled with reason; with `enabled: false` the whole panel renders the disabled explanation (Thai) and no connect buttons.
- **device-code screen:** after `startConnect` succeeds, the panel polls `getConnectStatus`; when the query returns `{ verificationUrl, userCode, expiresAt }`, assert: an "open official xAI page" affordance targeting `verificationUrl`, the user code rendered with a copy affordance, and a countdown derived from `expiresAt`. When status flips to `authorized`, success state renders and `listConnections` is invalidated. When `errorCode: "HERMES_OAUTH_SESSION_EXPIRED"` returns, the Thai + English copy from `hermesErrorCopy` renders with a retry (re-connect) affordance.
- **private-worker selector:** appears ONLY when scope `private_worker` is chosen; lists workers from `users.listConnectedWorkers` filtered to online; auto-selects when exactly one online worker; `startConnect` receives that `workerId`.
- **actions:** disconnect calls `hermesConnections.disconnect` and shows the "จะยกเลิกการเชื่อมต่อเมื่องานบนเครื่องทำงานเสร็จ" pending semantics (row not instantly removed — status refreshes via invalidate); probe calls `probe`; setDefault per assetType calls `setDefault`.
- **entitlement display:** a connection with `status: "entitlement_restricted"` renders the spec §12.3 Thai copy ("เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาต…") + reconnect affordance.
- **admin sub-panel:** rendered only for admin ctx (mock `useAuth`/role source the panel uses); `adminSetQuota` and `adminDisable` wired; non-admin sees no server_shared management controls.
- **no secrets:** `render` output never contains token-like strings from fixtures (fixture rows intentionally carry no such fields — assert the panel only reads the Safe shape).

### 3.3 VD panel wiring tests

Follow the existing extracted-helper style in `apps/web/client/src/components/verticalDramaSeries/__tests__/` (plain `.test.ts` against exported functions where possible; jsdom + RTL only where a render is required).

- `VerticalDramaCharacterStockPanel.hermesConnection.test.ts` (new):
  - the exported storage helpers persist/read `hermesConnectionId` under the new key (see §4.4) via `safeStorage*`; a throwing `localStorage.setItem` (QuotaExceeded stub) does **not** throw out of the store call and state-first ordering holds (mirror the existing safeStorage tests).
  - the exported build-generate-input helper (the one that conditionally spreads `mcpConnectionId`) includes `hermesConnectionId` iff `imageModelUsesHermes && hermesConnectionId`, never both `mcpConnectionId` and `hermesConnectionId` simultaneously.
- `VerticalDramaLocationStockPanel` — same two assertions under its own test file/key.
- `VerticalDramaStoryboardPanel` prop-contract test: the panel type accepts `hermesConnectionId?: string | null` + `onHermesConnectionChange?`; when the selected image (or video) model uses hermes transport, the panel renders `HermesConnectionPicker` (and NOT `McpConnectionPicker`); changes propagate through `onHermesConnectionChange` (controlled — no internal persistence).
- `VerticalDramaEpisodeWorkspace` threading: workspace forwards the two new props from its own props to `VerticalDramaStoryboardPanel` unchanged (type-level + a shallow render or props-plumbing unit test, matching however `mcpConnectionId` threading is asserted today).

### 3.4 `apps/web/client/src/pages/__tests__/VerticalDramaEpisodePage.hermesModelHydration.test.ts` (new)

Export a pure guard helper from EpisodePage (see §4.5) and test it directly:

- remembered hermes model + row enabled + at least one authorized hermes connection for that asset type → hydrate (returns the model id).
- remembered hermes model + row enabled + **no** authorized connection → do NOT hydrate (selection stays empty; caller leaves generate disabled). No fallback to any other model.
- remembered hermes model + row disabled → no hydrate.
- remembered gateway/MCP model → behavior identical to today (regression: guard returns hydrate for enabled rows without consulting hermes connections).

### 3.5 Error-copy rendering test

`apps/web/client/src/lib/__tests__/hermesErrorPresentation.test.ts` (new):

- `extractHermesErrorCode` (see §4.6) pulls a typed code out of (a) a TRPCClientError shaped per the section-01 convention and (b) a task projection `errorCode` string; unknown/absent → null.
- for representative codes (`HERMES_RATE_LIMITED`, `HERMES_QUEUE_FULL`, `HERMES_CONNECTION_REQUIRED`, `HERMES_ENTITLEMENT_RESTRICTED`, `HERMES_JOB_CANCELLED`) the presentation helper returns Thai + English copy from `hermesErrorCopy`, `retryable` matching spec §13.7, and includes `retryAfterSeconds` text when the error carries it (`HERMES_RATE_LIMITED`).
- loop over all `HERMES_MEDIA_ERROR_CODES`: presentation never returns empty strings (belt-and-braces on top of section-01's copy test).

### 3.6 Model-picker gating test

Extend/mirror whichever existing test covers MCP gating (`ModelSelectorDialog` badge test if present, else a small new one):

- a model row whose `configJson.transport === "hermes_worker"` renders the "Grok via Hermes" badge (distinct from the MCP badge).
- gating rule unit test (pure helper): `modelUsesHermes(configJson)` true for hermes rows, false for mcp/gateway (regression on the existing two).

## 4. Implementation

### 4.1 `apps/web/client/src/components/media/HermesConnectionPicker.tsx` (new)

Copy `McpConnectionPicker.tsx`'s structure, simplified (no shared-group dimension):

```tsx
export function HermesConnectionPicker(props: {
  value: string | null;
  onChange: (connectionId: string | null) => void;
  assetType: "image" | "video";
}): JSX.Element;
```

- Query `trpc.hermesConnections.listConnections.useQuery({ assetType }, { retry: false })`.
- Eligible = `status === "authorized"` AND asset capability enabled AND `assignedWorkerOnline`. Non-eligible-but-informative rows (`reauth_required`, `entitlement_restricted`, worker offline) render as **disabled options with a reason suffix**; fully irrelevant statuses are hidden.
- Option value = `connection.id`; label = `accountLabel ?? accountHint` + scope badge text (ส่วนกลาง / ส่วนตัวบนเซิร์ฟเวอร์ / เครื่องของฉัน).
- Auto-select single-eligible + stale-value clearing effect — same `useEffect` shape as the MCP picker (lines 39–65 there), minus group sync.
- Default preference: when auto-selecting among multiple would be wrong, still pre-select the row with `defaultForImage`/`defaultForVideo` matching `assetType` if `value` is null (one-line refinement over MCP; keep it deterministic and covered by a test if you implement it).
- Empty state: dashed box + Link to the settings AI-providers tab (same pattern/`href` family as the MCP picker's `/settings?tab=integrations` — point it at wherever `HermesConnectPanel` is registered in §4.2).
- Label text: "บัญชี Grok (Hermes)".

### 4.2 `apps/web/client/src/components/settings/HermesConnectPanel.tsx` (new) + `pages/Settings.tsx` (modify)

Structure like `McpConnectPanel` (DashboardCard sections, sonner toasts, `trpc.useUtils()` invalidation). Sub-parts (keep them as small exported components/helpers within the file so tests can target them):

1. **Availability header** — `getAvailability`; if `enabled: false` render the disabled explanation (Thai primary: feature ปิดอยู่/ติดต่อผู้ดูแล) and stop.
2. **Connection list** — from `listConnections` (no assetType filter): per-row status chip, scope badge, `accountLabel`/`accountHint`, capability summary (image/video enabled, `maxEditReferences`, `probedAt` via the `formatThaiDateTime` pattern), default toggles per assetType (`setDefault`), probe + disconnect buttons, entitlement-restricted copy block (spec §12.3 Thai + English) with reconnect CTA, reauth_required copy with reconnect CTA.
3. **Connect flow** (state machine in the component: `idle → consent → connecting(connectionId) → done|error`):
   - scope chooser limited by `getAvailability.scopes` (+ admin role for `server_shared`);
   - **one-time data-transfer consent notice** (spec §12.1 step 4; Thai primary: prompt และรูปอ้างอิงของงานที่ส่งผ่านการเชื่อมต่อนี้จะถูกส่งไปยัง xAI ภายใต้บัญชี Grok ที่เชื่อมต่อ และอยู่ภายใต้ข้อกำหนดของ xAI) — an explicit acknowledge action is required before `startConnect` fires with `consentAcknowledged: true`. **Scope-conditional addendum (spec §16 data-egress rule):** when scope is `server_shared`, the notice additionally states plainly that content from ALL pool users in the tenant will transit this admin-connected account (Thai primary: บัญชีนี้เป็นบัญชีกลาง — prompt และรูปของผู้ใช้ทุกคนใน tenant ที่ใช้ pool นี้จะถูกส่งผ่านบัญชี Grok นี้) — rendered ONLY for that scope;
   - **private-worker selector** (scope `private_worker` only): `trpc.users.listConnectedWorkers`, filter online (status + lastSeenAt freshness consistent with how that page already derives "online"), auto-select single, pass `workerId`;
   - **device-code screen**: `getConnectStatus` with `refetchInterval` ~2500ms while non-terminal; renders (a) button opening `verificationUrl` (via `window.open`, exactly the official URL from the event — never a constructed URL), (b) `userCode` monospace + copy-to-clipboard, (c) countdown to `expiresAt`, (d) live status line. **Never log or toast the user code.** Terminal `authorized` → success toast + invalidate `listConnections`; terminal `errorCode` → render via the §4.6 presentation helper + "ลองใหม่" restarting the flow.
4. **Admin sub-panel** (render only for admins — reuse whatever role check `Settings.tsx`/other panels use): `adminList` table, quota editor (`adminSetQuota`, integer or null), disable button (`adminDisable`), and a "Connect shared account" button that runs the same connect flow with scope `server_shared`.
   **Authority rule (vs section-12's monitoring panel):** THIS sub-panel is
   the single authoritative surface for admin MUTATIONS (connect shared /
   quota / disable). Section-12's `HermesWorkerAdminPanel` in
   AdminMonitoring is read-only observability and links here for changes —
   two panels, one writer.

`pages/Settings.tsx`: import and render `HermesConnectPanel` adjacent to `McpConnectPanel` (~L2530) under the same AI-providers/integrations tab, with a "Grok via Hermes" section heading. No routing changes.

### 4.3 Model picker badge + gating

- `ModelSelectorDialog.tsx` (~L323 transport badge area): add the `hermes_worker` branch → badge label "Grok via Hermes" (distinct color from the MCP badge). Disabled-with-reason: when the dialog has access to hermes readiness (pass-through props or a `getAvailability` query in the dialog, mirroring however MCP readiness renders today), hermes rows render disabled with reason for: flag off (`getAvailability.enabled === false`), no authorized connection for the asset type, video flag off for video rows.
- Gating rule (used by every surface): `modelUsesHermes = resolveMediaModelTransportConfig(model.configJson).transport === "hermes_worker"`. Where a surface computes `imageModelUsesMcp`/`videoModelUsesMcp`, add the parallel `imageModelUsesHermes`/`videoModelUsesHermes`. Rule: hermes model selected ⇒ render `HermesConnectionPicker`; generate button disabled until `hermesConnectionId` is non-null. Never render both pickers at once (transports are mutually exclusive per model row).

### 4.4 VD stock panels (`VerticalDramaCharacterStockPanel.tsx`, `VerticalDramaLocationStockPanel.tsx`)

Mirror the MCP wiring exactly:

- New shared storage key `const HERMES_CONNECTION_ID_STORAGE_KEY = "smartspec_hermes_connection_id"` — one key shared across CharacterStock, LocationStock, and EpisodePage (same cross-surface carry-over convention as `smartspec_mcp_connection_id`; distinct from all MCP keys). Read/write ONLY through the existing `safeStorageGet/Set/Remove` helpers; add `readStoredHermesConnectionId`/`storeHermesConnectionId` twins of L219–229. **State update first, storage write after** — never let a storage throw block the real action.
- `const [hermesConnectionId, setHermesConnectionId] = useState(() => readStoredHermesConnectionId())`; changes persist via the store helper.
- `imageModelUsesHermes` computed beside `imageModelUsesMcp`; conditionally render `HermesConnectionPicker` (same slot where `McpConnectionPicker` renders, switched by transport).
- Generate-input builders: extend the conditional spread (CharacterStockPanel L861–864 pattern) with `...(params.imageModelUsesHermes && params.hermesConnectionId ? { hermesConnectionId: params.hermesConnectionId } : {})`. The server input fields exist per section-09.
- Generate disabled + inline hint ("เลือกบัญชี Grok ก่อน") when hermes model selected but no connection.

### 4.5 Episode surfaces (`VerticalDramaEpisodePage.tsx` → `VerticalDramaEpisodeWorkspace.tsx` → `VerticalDramaStoryboardPanel.tsx`)

- **EpisodePage (state owner):** add `hermesConnectionId` state persisted under the shared key from §4.4 (page-level twin of its `mcpConnectionId` handling); derive `imageModelUsesHermes`/`videoModelUsesHermes` next to L2318–2325; extend every mutation input that currently spreads `mcpConnectionId` (L2684, L3149, L3163, L4493, L4579 and the video-clip call sites — grep `mcpConnectionId:` for the authoritative set) with the hermes equivalent, gated by the matching `*UsesHermes` flag.
- **Hydration guard:** extract the decision at the auto-hydration effect (~L1806/L1828) into an exported pure helper, e.g.:

  ```ts
  export function shouldHydrateRememberedVdModel(params: {
    rememberedModelId: string;
    modelRow: { isEnabled: boolean; configJson: unknown } | null;
    hasAuthorizedHermesConnection: boolean; // for the relevant assetType
  }): boolean;
  ```

  Semantics: non-hermes models — unchanged behavior; hermes models — hydrate only if row enabled AND `hasAuthorizedHermesConnection`; otherwise leave selection empty (no fallback, generate disabled). The page supplies `hasAuthorizedHermesConnection` from a `listConnections` query enabled lazily (only when the remembered model resolves to hermes transport — avoid an unconditional extra query on every page load).
- **EpisodeWorkspace:** add `hermesConnectionId?: string | null` + `onHermesConnectionChange?: (id: string | null) => void` to its props and forward to StoryboardPanel — pure plumbing.
- **StoryboardPanel:** extend the controlled prop contract (beside `mcpConnectionId` at L988 / L1438): `hermesConnectionId`, `onHermesConnectionChange`. In the picker slot (~L2500), branch: hermes-transport model → `HermesConnectionPicker`; mcp → existing `McpConnectionPicker`; gateway → nothing. Generate buttons for hermes models require a connection (same disabled pattern as `mcpFree` gating at L2281 uses for MCP).
- **ReferenceFrameDialog + angle-variation UI:** inherit the parent's selection — nothing beyond the props already threaded (verify no separate picker is introduced).
- **Ad banner UI:** if section-09's remediation left the banner UI without a model picker, add one here reusing the standard model-selector + the §4.3 gating (hermes model ⇒ `HermesConnectionPicker`). The server-side BAD_REQUEST guard itself is section-09's — do not re-implement.

### 4.6 Error presentation helper — `apps/web/client/src/lib/hermesErrorPresentation.ts` (new)

Small pure module (so every surface renders codes identically):

```ts
export function extractHermesErrorCode(error: unknown): HermesMediaErrorCode | null;
// understands, in order: (1) a TRPCClientError whose message carries the
// pinned `[HERMES_X] …` prefix — delegate to shared/hermesMedia's
// parseHermesErrorMessage (the ONLY wire convention; TRPCError `cause`
// does not reach the client), (2) plain { errorCode } task projections
// (section-06), (3) a bare code string.

export function presentHermesError(error: unknown): {
  code: HermesMediaErrorCode; th: string; en: string;
  retryable: boolean; retryAfterSeconds?: number;
} | null; // wraps hermesErrorCopy; passes through retryAfterSeconds when present
```

Wire it into: HermesConnectPanel (connect failures), HermesConnectionPicker empty/error states where relevant, and the VD/MediaStudio generate-error toasts for `hermes_` tasks (wherever MCP task errors are toasted today, add: `presentHermesError` first; fall back to the raw message when it returns null). Queue/limit rejections (`HERMES_RATE_LIMITED`, `HERMES_QUEUE_FULL`, `HERMES_CONNECTION_BUSY`) must render the retry-after / try-later affordance; non-retryable codes must not show a retry button.

## 5. What this section must NOT do

- No server changes: no new tRPC procedures, no scheduler/transport/resolver edits (sections 03/05/08/09 own those). The only server files you may touch is none — if you find a missing server input field, stop and flag it against section-09 rather than patching here.
- No Worker App (Tauri/React-in-app) UI — section-11.
- No admin fleet/observability panels (worker fleet pages, RenderJobsPage labels) — section-12.
- Never construct or guess xAI URLs; only render the `verificationUrl` the server relays. Never log/toast/persist the device user code (component state only).
- Never read hermes readiness from anywhere but `hermesConnections.listConnections` + `getAvailability`.
- Do not break MCP/gateway behavior: all existing MCP picker/panel/VD tests must pass byte-identical.
- No unguarded `localStorage` access — `safeStorage*` only, state-first.

## 6. Verification

1. New tests green: `pnpm --dir apps/web test -- Hermes` (picker, panel, error presentation) and the VD wiring/hydration test files.
2. Regression: `pnpm --dir apps/web test` full suite — especially `McpConnectionPicker`, `McpConnectPanel`, `VerticalDramaCharacterStockPanel.*`, `VerticalDramaStoryboardPanel`/workspace, and EpisodePage helper tests, all unchanged.
3. `pnpm --dir apps/web check` — no new TypeScript errors (repo has known pre-existing ones; introduce none).
4. Manual smoke (dev, flags off): Settings shows the "Grok via Hermes" panel in its disabled/fail-closed state; model picker shows hermes rows (if seeded+enabled) as disabled-with-reason; no console errors; MCP flows untouched.
---

## IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 137 tests across 15 files; MCP/VD regression green;
typecheck baseline unchanged.

Review found a cross-section contract gap that made the whole error module
unreachable, plus 2 fixes:

1. **MediaTask carried no errorCode** and the adapter had already resolved
   the typed code into Thai copy (stripping the [HERMES_X] wire prefix) —
   so presentHermesError could never classify a generate/poll failure (the
   primary error surface). Fixed in section-06 (commit 719000420: MediaTask
   gains errorCode; resolveHermesErrorCode split from
   deriveHermesErrorMessage) and consumed here.
2. **Non-admin dead-end reconnect:** server_shared rows are visible
   tenant-wide, so any user could walk the full consent + device-code UI and
   then hit a raw untranslated FORBIDDEN. Now gated
   (`canReconnectScope`) with "ติดต่อผู้ดูแลระบบ" copy for non-admins.
3. **Error copy swept into the real toast sites** (both channels):
   synchronous resolver rejections via the panels' shared
   resolve*MutationErrorMessage helpers + EpisodePage's 6 hermes mutations
   + MediaStudio's primary generate/retry; task-projection failures via the
   new exported buildVdGenerateFailureToastMessage wired into all 5
   image/video poll-failure sites. Non-hermes errors render byte-identical.

Accepted gaps (documented, not silently dropped): ModelSelectorDialog
disabled-with-reason is badge-only (adding hooks to the shared dialog broke
callers without trpc context; proper fix = thread readiness as props);
ad-banner has no model picker at all today (not even for MCP); the single
connection picker can't disambiguate simultaneous image+video hermes models
(mirrors the pre-existing MCP limitation — commented in code); MediaStudio
has no hermes wiring of its own (out of scope) so only its primary catch
blocks were made hermes-aware.

Review trail: `../implementation/code_review/section-10-{diff,review,interview}.md`.
