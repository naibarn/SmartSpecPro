# Section 05 — Connection Router + Settings UI (`socialAdsConnection` tRPC router + `SocialAdsConnectionPanel`)

**Section id:** `section-05-connection-router-settings-ui`
**Feature:** F01 (frontend + router half) — per-user Meta Ads credential management
**Rollout phase:** P1
**Depends on:** `section-01-schema-flags-i18n` (tables `social_ads_connections`, `social_ads_settings`; `SOCIAL_ADS_ENABLED` flag; `ads.connection.*` i18n keys), `section-04-ads-connection-service` (`socialAdsConnectionService` — this section is a thin router/UI layer over it)
**Blocks:** `section-07-ads-read-router-shell` (imports the gating helpers defined here)
**Parallelizable with:** `section-06-ads-graph-client`

**Working directory:** `apps/web/` — all paths below are relative to it unless absolute.
**Test command:** `cd apps/web && pnpm test`

---

## 1. Goal

Users configure their entire Meta Ads connection through their own Settings page; **nothing secret ever reaches the client**. Deliverables:

1. `socialAdsConnection` tRPC router — rate-limited, secret-free DTOs, tenant-flag gated.
2. Reusable **gating helpers** (tenant flag assert + active-connection precondition) that Section 07's read router will import.
3. `SocialAdsConnectionPanel` rendered in the Settings **integrations** tab — connection card, app-credentials card, ad-accounts card, scopes card, guardrails card (฿500 default max daily budget), danger zone.
4. Client-side token hygiene rules enforced in the panel.

## 2. Background context (self-contained)

- **F01 recap:** users paste a Meta access token; `socialAdsConnectionService` (Section 04, `server/services/social/socialAdsConnectionService.ts`) validates it live, exchanges to long-lived when a same-app secret exists, and stores it AES-256-GCM encrypted in `social_ads_connections`. Decryption happens **only** inside that service (`getDecryptedAccessToken` is internal — never exposed via tRPC).
- **Premium gate:** every ads procedure asserts tenant flag `SOCIAL_ADS_ENABLED` via `getTenantFeatureFlag` (`server/services/featureFlags.ts:79`). Default **false**, NO fallback to `META_CHANNELS_ENABLED` (interview decision — premium means explicitly enabled).
- **Guardrail default:** `social_ads_settings.max_daily_budget_minor` defaults to **50000** (฿500/day — interview decision superseding spec's ฿1,000). Money is always integer minor units (`shared/socialAds/money.ts`, Section 02); UI formats via `formatMoney` only.
- **Hard security rules (spec §4.2/§12):** tRPC responses contain only `configured`, `tokenHint` (last 4 chars), scope lists, ad-account list, expiry, status — never ciphertext or plaintext secrets. Ownership always derives from `ctx.user.id` + resolved tenantId, never from client input. Disconnect hard-deletes secrets (the service does this; the router just exposes it with a confirm-worthy description).
- **Rate limiting:** `createRateLimitMiddleware({ namespace, limit, windowMs })` from `server/_core/rateLimitedProcedure.ts:27` — tRPC middleware, in-memory sliding window, throws TOO_MANY_REQUESTS. Usage idiom: `.use(createRateLimitMiddleware({...}))` inline per procedure (see `server/routers/userApiKeys.ts:22-28`).
- **Router registration idiom:** `server/routers.ts` "three spots" — import (~line 124 area), `AppRouter` type entry (~line 2015 area), value entry (~line 2205 area). Follow `userApiKeys` as the model.
- **UI template:** clone the structure of `client/src/components/settings/UserLlmKeysPanel.tsx` (DashboardCard, TanStack Query via tRPC hooks + invalidation, AlertDialog confirms, Sonner toasts). Panel mounts in `client/src/pages/Settings.tsx` integrations tab block (`:2521-2537`, currently rendering `UploadPostGatewayPanel`, `McpConnectPanel`, etc. — append `<SocialAdsConnectionPanel />` there).
- **i18n:** all strings from `client/src/locales/{th,en}/social.json` under `ads.connection.*` / `ads.errors.*` (seeded in Section 01; add any keys this section discovers it needs to BOTH locales, Thai primary).
- **Test idioms:** routers via `router.createCaller({ user, tenantId, userToken })` (copy `server/routers/__tests__/socialInbox.test.ts:56-70`); service mocked at module boundary with `vi.hoisted` mock bag + `vi.mock` (copy `server/services/__tests__/socialDraftService.test.ts`); panel tests jsdom, colocated like `client/src/components/settings/__tests__/McpConnectPanel.test.tsx`.

## 3. Files

**Create:**

| Path | Purpose |
|---|---|
| `server/services/social/socialAdsGate.ts` | Gating helpers shared with Section 07 |
| `server/routers/socialAdsConnection.ts` | tRPC router |
| `server/routers/__tests__/socialAdsConnection.test.ts` | Router tests (createCaller) |
| `client/src/components/settings/SocialAdsConnectionPanel.tsx` | Settings panel |
| `client/src/components/settings/__tests__/SocialAdsConnectionPanel.test.tsx` | Panel tests (jsdom) |

**Modify:**

| Path | Change |
|---|---|
| `server/routers.ts` | Register router in the three spots (import / type / value) |
| `client/src/pages/Settings.tsx` | Render `<SocialAdsConnectionPanel />` in the integrations tab (`:2521-2537`) |
| `client/src/locales/{th,en}/social.json` | Any additional `ads.connection.*` keys needed (both locales) |

## 4. Tests FIRST (write before implementation; section done only when these + full suite pass)

### 4.1 Router tests — `server/routers/__tests__/socialAdsConnection.test.ts`

Mock `socialAdsConnectionService`, `featureFlags` (`getTenantFeatureFlag`), the settings persistence layer (drizzle chainable mock per `creditService.test.ts:3-45` idiom if the router touches `social_ads_settings` directly), and `_core/rateLimitedProcedure`.

```ts
describe("socialAdsConnection router", () => {
  describe("feature gating", () => {
    it("rejects EVERY procedure with FORBIDDEN when SOCIAL_ADS_ENABLED is false for the tenant");
    // iterate all procedures programmatically so a newly added procedure can't skip the gate
    it("rejects connection-requiring procedures with PRECONDITION_FAILED (message contains Settings hint, Thai) when no active connection");
    it("getStatus works WITHOUT an active connection (it is how users discover unconfigured state)");
  });

  describe("rate limiting", () => {
    it("wires createRateLimitMiddleware onto saveToken/saveAppCredentials with namespace 'social-ads-cred', limit 10, windowMs 3_600_000");
    // assert via mocked middleware factory capturing its args
  });

  describe("updateSettings guardrails", () => {
    it("rejects raising maxDailyBudgetMinor above current value without confirmationText");
    it("accepts raising when confirmationText === 'ยืนยันเพิ่มงบ'");
    it("lowering requires no confirmation");
    it("default budget for a fresh settings row is 50000 minor units (฿500)");
  });

  describe("secret hygiene", () => {
    it("no procedure response contains token-shaped strings — deep-walk every DTO for /EAA[A-Za-z0-9]{20,}/ and /^[0-9a-f]{32,}$/ (ciphertext) shapes");
    it("DTO type has no field named accessToken/appSecret/encrypted* (type-level assertion)");
  });

  describe("delegation", () => {
    it("saveToken passes (ctx.user.id, resolvedTenantId, rawToken) to the service — never client-supplied user/tenant ids");
    it("disconnect calls service.disconnect and returns void-shaped success");
    it("setDefaultAdAccount rejects an adAccountId not present in the connection's ad_accounts cache");
  });
});
```

### 4.2 Gate helper tests (may live in the router test file or `server/services/social/__tests__/socialAdsGate.test.ts`)

```ts
it("assertSocialAdsEnabled throws TRPCError FORBIDDEN with Thai message when flag off");
it("requireActiveAdsConnection throws PRECONDITION_FAILED with Thai Settings-link hint when connection missing or status !== 'active'");
it("requireActiveAdsConnection returns the connection status DTO when active (so callers avoid a second fetch)");
```

### 4.3 Panel tests — `client/src/components/settings/__tests__/SocialAdsConnectionPanel.test.tsx` (jsdom)

Mock tRPC hooks at module boundary (follow `McpConnectPanel.test.tsx` conventions).

```ts
describe("SocialAdsConnectionPanel", () => {
  it("renders configured state: status badge, tokenHint badge (last 4), expiry countdown");
  it("renders unconfigured/empty state with paste-token onboarding copy (Thai key ads.connection.*)");
  it("token paste input has type='password', autoComplete='off', name='metaAdsTokenInput', and is NOT inside a native <form>");
  it("clears the token from component state immediately after successful saveToken mutation (input value empty, mutation called once with pasted value)");
  it("guardrails card shows Money-formatted budget and default ฿500; raising the value opens typed-confirmation dialog");
  it("disconnect opens AlertDialog whose copy explains secrets are permanently deleted");
  it("missing recommended scopes render highlighted chips with re-generate instructions");
});
```

## 5. Implementation

### 5.1 Gating helpers — `server/services/social/socialAdsGate.ts`

Small module, no default export, imported by this router and by Section 07's `socialAds` read router:

```ts
/** Throws TRPCError FORBIDDEN (Thai message from a server-side constant) unless
 *  getTenantFeatureFlag("SOCIAL_ADS_ENABLED", tenantId) is true. */
export async function assertSocialAdsEnabled(tenantId: string): Promise<void>;

/** Loads the caller's connection via socialAdsConnectionService.getStatus.
 *  Throws TRPCError PRECONDITION_FAILED with a Thai message directing to
 *  Settings → integrations when absent or status !== "active".
 *  Returns the ConnectionStatusDTO so callers can reuse it (ad_accounts ownership checks). */
export async function requireActiveAdsConnection(
  userId: string,
  tenantId: string,
): Promise<ConnectionStatusDTO>;
```

Keep Thai error copy in this module (server-side; client re-maps via `ads.errors.*` where it renders tRPC errors). Do NOT check `META_CHANNELS_ENABLED` anywhere.

### 5.2 Router — `server/routers/socialAdsConnection.ts`

All procedures `protectedProcedure`; first statement resolves tenantId from ctx and calls `assertSocialAdsEnabled`. Credential mutations additionally `.use(createRateLimitMiddleware({ namespace: "social-ads-cred", limit: 10, windowMs: 3_600_000 }))`.

Procedures (signatures/inputs only — bodies delegate to `socialAdsConnectionService` and the `social_ads_settings` table):

| Procedure | Kind | Input (Zod) | Notes |
|---|---|---|---|
| `getStatus` | query | none | Works without connection; returns full DTO below |
| `saveToken` | mutation, rate-limited | `{ token: z.string().min(20) }` | Delegates `service.saveToken(ctx.user.id, tenantId, token)` |
| `saveAppCredentials` | mutation, rate-limited | `{ appId: z.string(), appSecret: z.string() }` | Delegates; response contains only `appIdConfigured` / `appSecretHint` |
| `refreshAdAccounts` | mutation | none | Requires active connection |
| `verify` | mutation | none | Re-validates live; repairs status both directions |
| `disconnect` | mutation | none | Hard delete via service; no soft option |
| `updateSettings` | mutation | `{ maxDailyBudgetMinor?, currency?, automationHalted?, notificationPrefs?, confirmationText? }` | Raise-above-current requires `confirmationText === "ยืนยันเพิ่มงบ"`; lowering free; upsert settings row with 50000 default |
| `setDefaultAdAccount` | mutation | `{ adAccountId: z.string() }` | Must exist in connection `ad_accounts` cache, else BAD_REQUEST |
| `setEnabledAdAccounts` | mutation | `{ adAccountIds: z.string().array() }` | Same ownership validation |

**Response DTO** (single shared type, exported for Section 07 + panel typing):

```ts
type SocialAdsConnectionStatusDTO = {
  configured: boolean;
  status: "active" | "expired" | "invalid" | "revoked" | "disabled" | null;
  tokenHint: string | null;          // last 4 chars only
  tokenExpiresAt: string | null;
  grantedScopes: string[];
  missingScopes: string[];           // recommended-but-absent
  adAccounts: AdAccountSummary[];    // id, name, currency, timezone_name, account_status, enabled
  defaultAdAccountId: string | null;
  appIdConfigured: boolean;
  appSecretHint: string | null;      // masked, e.g. "****abcd"
  settings: { maxDailyBudgetMinor: number; currency: string; automationHalted: boolean; notificationPrefs: ... };
};
```

Never spread service/db rows into responses — construct the DTO field-by-field so encrypted columns can never leak by accident. Graph failures surfacing through the service convert to user messages ONLY via `resolveAdsError` (Section 02, `server/services/social/adsErrorMap.ts`).

**Registration:** `server/routers.ts` three spots, alphabetical-adjacent to other `social*` routers, key `socialAdsConnection`.

### 5.3 Panel — `client/src/components/settings/SocialAdsConnectionPanel.tsx`

Clone `UserLlmKeysPanel.tsx` structure (DashboardCard sections, tRPC `useQuery`/`useMutation` + `utils.socialAdsConnection.getStatus.invalidate()` after every mutation, AlertDialog confirms, Sonner toasts). Hide the panel entirely (render null) when `getStatus` fails with FORBIDDEN (tenant not entitled). Cards:

1. **Connection card** — status badge (active/expired/invalid/disabled) + expiry countdown; token paste field + "Validate & Save" button; when configured show `tokenHint` badge instead of the token.
2. **App credentials card** — app id (plain) + app secret (masked input; `appSecretHint` badge when configured).
3. **Ad accounts card** — checkbox per account (enabled set), radio for default, show currency + timezone per account, "Refresh accounts" button.
4. **Scopes card** — granted scopes as chips; missing recommended scopes (`ads_management`, `read_insights`, `pages_read_engagement`) highlighted with Thai re-generate instructions.
5. **Guardrails card** — max daily budget input displayed via `formatMoney` (`@shared/socialAds/money`), default ฿500; raising triggers typed-confirmation dialog requiring the literal string "ยืนยันเพิ่มงบ" passed as `confirmationText`.
6. **Danger zone** — disconnect with AlertDialog explaining encrypted secrets are hard-deleted and schedulers/rules disabled.

**Token hygiene (non-negotiable, tested):**
- Input: `type="password"`, `autoComplete="off"`, `name="metaAdsTokenInput"`, rendered as a controlled input NOT inside a native `<form>` element (button `onClick`, not submit).
- Clear the token state variable synchronously in the mutation `onSuccess` (and `onSettled` as belt-and-braces).
- Never write the token to localStorage/sessionStorage/URL; do not include mutation variables in any error-breadcrumb helper.
- Code-review note (record in PR description, not testable in unit tests): confirm React Query Devtools is not included in the production bundle.

All copy through `useTranslation` on the `social` namespace (`ads.connection.*`, `ads.errors.*`); no hardcoded user-facing strings.

### 5.4 Settings.tsx mount

Append `<SocialAdsConnectionPanel />` inside the `activeTab === 'integrations'` block (`client/src/pages/Settings.tsx:2521-2537`, after `<OneDrivePanel />`), with a lazy or direct import matching the neighboring panels' pattern. No new tab.

## 6. Constraints

- Do NOT implement or modify `socialAdsConnectionService` here (Section 04 owns it) — mock it in tests; if Section 04 is not yet merged, code against its published signatures (Section 04 spec) and mark the integration test `.todo`.
- Do NOT add read procedures (`listCampaigns` etc.) — Section 07 owns them; it will import `assertSocialAdsEnabled` / `requireActiveAdsConnection` from `socialAdsGate.ts` and ADD `resolveOwnedAccount` + `assertEntityLineage` to that same file (single home for all ads gating helpers).
- No floats in budget handling anywhere — minor-unit integers end-to-end; the panel converts ฿ display via `formatMoney`/parse helpers only.
- Mutations here are credential/settings operations, not Graph mutations — the intent-row protocol (Section 08) does NOT apply, but audit events from the service still fire (Section 04).

## 7. Acceptance / verification

1. New tests in 4.1–4.3 pass; full suite green: `cd apps/web && pnpm test`.
2. `pnpm check` clean on all new/modified files.
3. Manual (post-deploy, P1 gate): with `SOCIAL_ADS_ENABLED` on for the tenant, Settings → integrations shows the panel; pasting a valid token yields active status + ad accounts; responses inspected in devtools network tab contain no `EAA`/ciphertext strings; disconnect removes the connection and the panel returns to onboarding state.