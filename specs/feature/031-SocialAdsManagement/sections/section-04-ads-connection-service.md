# Section 04 — Ads Connection Service (`socialAdsConnectionService`) + Token Lifecycle

**Section id:** `section-04-ads-connection-service`
**Feature:** F01 backend — per-user encrypted ads credentials
**Rollout phase:** P1
**Depends on:** `section-01-schema-flags-i18n` (the `social_ads_connections` / `social_ads_settings` tables + `SOCIAL_ADS_ENABLED` flag), `section-02-shared-primitives` (`resolveAdsError`, `sanitizeForActionLog`, sanitizer extension in `auditLogger.ts`).
**Blocks:** `section-05-connection-router-settings-ui` (tRPC router calls this service), `section-06-ads-graph-client` (Graph client resolves tokens via `getDecryptedAccessToken`; 190 errors call `markExpired`).
**Parallelizable with:** `section-03-social-jobs-worker`. Note: this service calls `registerConnectionSchedulers(connectionId)` / `removeConnectionSchedulers(connectionId)` exported from `server/workers/socialJobsWorker.ts` (Section 03). If Section 03 has not landed yet, import them anyway and mock in tests — the export names and signatures are fixed by the plan; do not invent alternatives.

**Working directory:** `apps/web/`

---

## Goal

Per-user, per-tenant encrypted Meta ads credential storage with: live paste-token validation, same-app short→long-lived token exchange, hard-delete disconnect, expiry lifecycle (deduped notifications + `markExpired` on Graph code 190), and a strictly internal decrypt surface. This service is the ONLY place in the codebase where ads tokens are decrypted (`decrypt()` from `server/services/crypto.ts` for ads credentials appears nowhere else).

## Files

| File | Action |
|---|---|
| `server/services/social/socialAdsConnectionService.ts` | NEW — the service |
| `server/services/social/__tests__/socialAdsConnectionService.test.ts` | NEW — tests (write FIRST) |

No tRPC router in this section (that is Section 05). No schema edits (Section 01 owns `social_ads_connections` and `social_ads_settings`).

## Background you need (self-contained)

- **Table `social_ads_connections`** (already created by Section 01; Drizzle exports in `drizzle/schema.ts`): one row per `(user_id, tenant_id, provider)` (unique index), provider default `'meta_ads'`. Key columns: `encrypted_access_token` text (NULLed on disconnect), `app_id` varchar (plaintext — not secret), `encrypted_app_secret` text (NULLed on disconnect), `token_app_id` varchar (app that minted the token, from `debug_token` — gates exchange/proof), `token_hint` varchar(8) (last 4 chars), `token_expires_at` timestamp, `granted_scopes` json, `ad_accounts` json (**replaced wholesale on every refresh, never appended**; each entry `{id: "act_...", name, currency, timezone_name, account_status, minimum_budgets}`), `default_ad_account_id`, `status` varchar (`active|expired|invalid|revoked|disabled`), `last_verified_at`, `last_error`.
- **Encryption:** `encrypt(text)` / `decrypt(text)` from `server/services/crypto.ts` (AES-256-GCM, `LLM_ENCRYPTION_KEY`). Pattern precedent: `server/services/userApiKeyService.ts` (user LLM keys) — copy its internal-only-decrypt discipline.
- **Graph API (v25.0, constant lives in Section 06's client; this service may declare a local `META_GRAPH_VERSION = "v25.0"` until 06 lands, then import):**
  - Validation calls on save: `GET /me`, `GET /me/permissions`, `GET /debug_token?input_token=...`, `GET /me/adaccounts?fields=id,name,currency,timezone_name,account_status,minimum_budgets`.
  - Long-lived exchange: `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=...&client_secret=...&fb_exchange_token=...` → `{access_token, expires_in}` (~60 days). **Cross-app exchange fails at Meta** — only attempt when `app_id === debug_token.app_id`.
  - Long-lived user tokens have **no programmatic refresh** — re-auth is a human action (re-paste).
- **Token transport rule (global):** tokens travel only in `Authorization: Bearer` headers in this service's own fetch calls (except `fb_exchange_token`/`input_token` params where the Graph endpoint requires them — those URLs must never reach a log or thrown error; scrub before logging). Never log token values; audit events carry key names + `token_hint` only.
- **Notifications:** `createNotification` from `server/services/notificationService.ts` (`:292`) — `groupKey` gives dedup (same user + same groupKey merged).
- **Tenant fallback app credentials:** system_settings keys `integrations/meta_ads_app_id` / `integrations/meta_ads_app_secret` (sensitive, registered in Section 01). Read + decrypt server-side only via the system-settings service. Fallback is used only when the user has no personal app id/secret AND the tenant app actually minted the token (same `token_app_id` check).
- **Audit:** use `auditLogger.log` with the new event types from Section 02 (`social_ads_request`/`social_ads_response` for validation calls if desired; at minimum one audit event per save/disconnect with names + hint only).

## Service surface (signatures fixed — Sections 05/06/09/13 code against these)

```ts
// server/services/social/socialAdsConnectionService.ts

export interface AdsAdAccount {
  id: string; name: string; currency: string; timezone_name: string; // keep Graph-native key — sections 01/06/07 read `timezone_name`
  account_status: number; minimum_budgets?: unknown;
}

export interface ConnectionStatusDTO {
  configured: boolean;
  status: "active" | "expired" | "invalid" | "revoked" | "disabled" | "none";
  tokenHint?: string;                // last 4 chars only
  tokenExpiresAt?: string | null;
  grantedScopes: string[];
  missingScopes: string[];           // recommended-but-absent (warn list)
  adAccounts: AdsAdAccount[];
  defaultAdAccountId?: string | null;
  appIdConfigured: boolean;
  appSecretHint?: string;            // hint only, never the secret
  warnings?: string[];               // e.g. cross-app token → short expiry
  lastError?: string | null;
  // NOTE: NO token / ciphertext / secret fields — enforced by a type-level test
}

export async function saveToken(userId: number, tenantId: string, rawToken: string): Promise<ConnectionStatusDTO>; // userId is NUMBER — users.id is serial (Section 01 consistency note)
export async function saveAppCredentials(userId: number, tenantId: string, appId: string, appSecret: string): Promise<ConnectionStatusDTO>;
export async function refreshAdAccounts(userId: number, tenantId: string): Promise<ConnectionStatusDTO>;
export async function verify(userId: number, tenantId: string): Promise<ConnectionStatusDTO>;   // re-validates live; repairs status BOTH directions
export async function disconnect(userId: number, tenantId: string): Promise<void>;              // hard delete of secrets
export async function getStatus(userId: number, tenantId: string): Promise<ConnectionStatusDTO>;

// INTERNAL ONLY — consumed by adsGraphClient (Section 06) + workers. NEVER exported through tRPC.
export async function getDecryptedAccessToken(connectionId: number):
  Promise<{ token: string; appSecret?: string; appId?: string } | null>;
export async function markExpired(connectionId: number, reason: string): Promise<void>;

// Used by the daily reconciliation/retention job (Sections 03/13):
export async function sweepExpiryNotifications(): Promise<void>;  // 14/7/1-day thresholds, deduped
```

Keep the raw Graph HTTP calls behind a small module-internal helper (e.g. an unexported `graphGet(path, token, params?)`) so tests can `vi.mock` the fetch layer at one seam. Do NOT depend on Section 06's `adsGraphClient` (circular: 06 depends on this service).

## Behavior specification

### saveToken
1. Validate live: `/me` (identity), `/me/permissions` (granted scopes), `debug_token` (expiry + `app_id`), `/me/adaccounts` with the exact field list above.
2. **Reject** if `ads_read` missing → Thai error (i18n key family `ads.connection.*` / `ads.errors.*` from Section 01; server throws with the Thai message string per the error-map convention).
3. Warn-list (`missingScopes` in DTO, not a rejection): `ads_management`, `read_insights`, `pages_read_engagement`, `business_management`, `pages_show_list`.
4. Store `debug_token.app_id` → `token_app_id`.
5. **Exchange gate:** resolve app credentials (user row → tenant system_settings fallback). If a secret is available AND its `app_id === token_app_id` → call `fb_exchange_token`, store the long-lived token + computed expiry. Else store the pasted token as-is with the true expiry from `debug_token`, and add a warning to the DTO (cross-app → no exchange, no `appsecret_proof` downstream).
6. Encrypt token via `encrypt()`; `token_hint` = last 4 chars; `ad_accounts` replaced wholesale; `status='active'`, `last_verified_at=now`, `last_error=null`.
7. Upsert on `(user_id, tenant_id, provider)` (drizzle `onConflictDoUpdate` against the unique index).
8. Ensure a `social_ads_settings` row exists for `(user, tenant)` (insert-if-missing with default `max_daily_budget_minor = 50000`, currency from the default/first ad account).
9. Call `registerConnectionSchedulers(connectionId)`.
10. Audit event (event names + hint only — never token values; payload passed through the Section 02 sanitizer).

### saveAppCredentials
Store `app_id` plaintext + `encrypt(appSecret)`; keep an `appSecretHint`. If a token already exists and is short-lived and `token_app_id === appId`, opportunistically attempt the exchange (best-effort; failure leaves stored token untouched). Return DTO.

### refreshAdAccounts / verify
`refreshAdAccounts` re-fetches `/me/adaccounts` and **replaces** the json wholesale (also re-validates `default_ad_account_id` still exists; null it if gone). `verify` re-runs the full validation set and repairs `status` in BOTH directions (`expired → active` after a working re-paste; `active → expired/invalid` on live failure, storing `last_error` via `resolveAdsError`).

### disconnect (hard delete)
In ONE transaction: NULL `encrypted_access_token` + `encrypted_app_secret` (+ clear `token_hint`, `token_expires_at`, `granted_scopes`), set `status='revoked'`; disable all the user's enabled rows in `social_ads_automation_rules` for this tenant. After commit: `removeConnectionSchedulers(connectionId)`. `social_ads_action_log` rows are NEVER touched (audit history survives disconnect). Audit event.

### getDecryptedAccessToken (internal only)
Load row by `connectionId`; return null if no row, no ciphertext, or `status` ∈ `{revoked, disabled}` (callers must not use tokens on force-disabled connections; `expired` may still return the token so `verify`/reconnect flows can probe — decision: return the token for `expired` but callers gate on status). Decrypt token; include `appSecret`/`appId` ONLY when `app_id === token_app_id` (the `appsecret_proof` gate lives here so Section 06 never needs the rule). Never memoize the decrypted value.

### markExpired (code-190 path)
Set `status='expired'`, `last_error=reason`; `removeConnectionSchedulers(connectionId)`; emit exactly ONE notification via `createNotification` with `groupKey: "ads-token-expiry:{connectionId}:code190"`. Idempotent: calling twice does not duplicate the notification (groupKey dedup + skip if already `expired`). Callers (Section 06 client, Section 09 monitor) fail-fast their remaining batch after calling this.

### sweepExpiryNotifications
For each `active` connection with `token_expires_at` within 14/7/1 days: `createNotification` with `groupKey: "ads-token-expiry:{connectionId}:{threshold}"` (one per threshold per connection, ever — dedup by groupKey). Invoked by the daily reconciliation job (Section 03 wires the call; Section 13's retention job may also host it — expose it as a plain exported function either can call).

## TDD — write these tests FIRST

File: `server/services/social/__tests__/socialAdsConnectionService.test.ts`. Idioms: `vi.hoisted` mock bag + module-boundary `vi.mock` per `server/services/__tests__/socialDraftService.test.ts`; chainable drizzle mock per `creditService.test.ts:3-45`. Mock: the module-internal Graph fetch seam (`global.fetch = vi.fn()` with fixture JSON responses), `server/services/crypto.ts` (`encrypt`/`decrypt` as reversible stubs), `server/workers/socialJobsWorker.ts` (`registerConnectionSchedulers`/`removeConnectionSchedulers`), `server/services/notificationService.ts` (`createNotification`), the system-settings read helper, drizzle `db`. No network, no test DB.

Required cases (mirrors `claude-plan-tdd.md` §04):

1. **saveToken happy path** — mocked `/me`, `/me/permissions` (incl. `ads_read`), `debug_token` (app_id matching stored app), `/me/adaccounts`; asserts: exchange endpoint called with `grant_type=fb_exchange_token`; `encrypt()` called with the long-lived token; stored `token_expires_at` from `expires_in`; `token_hint` = last 4 chars; `ad_accounts` json includes `currency`/`timezone_name`/`minimum_budgets`; `registerConnectionSchedulers` called with the connection id; upsert targets `(user_id, tenant_id, provider)`.
2. **Cross-app token** — `debug_token.app_id` ≠ stored `app_id` → exchange NOT called; token stored as-is with `debug_token` expiry; DTO `warnings` non-empty; `getDecryptedAccessToken` for this row returns NO `appSecret` (proof gate).
3. **Scope enforcement** — token missing `ads_read` → rejected, error message is the Thai string, nothing stored, no schedulers registered. Token missing only `read_insights` → saved, DTO `missingScopes` contains `read_insights`.
4. **disconnect** — within one mocked transaction: encrypted columns set NULL + status flip; enabled automation rules disabled; `removeConnectionSchedulers` called; NO delete issued against `social_ads_action_log`.
5. **markExpired** — status flip + scheduler removal + exactly one `createNotification` with `groupKey` `ads-token-expiry:{id}:code190`; second call is a no-op (no second notification).
6. **sweepExpiryNotifications dedup** — connection expiring in 6 days → one notification with the `:7` threshold groupKey; re-run same day → `createNotification` still called with the same groupKey (dedup is the service contract via groupKey — assert the exact groupKey string) or skipped if the implementation tracks sent thresholds; either way at most one visible notification per threshold.
7. **DTO secrecy (type-level)** — `expectTypeOf<ConnectionStatusDTO>()` has no `token`/`encryptedAccessToken`/`appSecret` property; runtime walk of a happy-path DTO finds no `EAA`-prefixed or ciphertext-shaped strings (reuse the hygiene-canary helper idea from Section 03 tests).
8. **verify repairs both directions** — row `status='expired'` + live validation succeeds → `active`; row `active` + `/me` returns Graph error 190 → `expired` + `last_error` set via `resolveAdsError` (mock).

Section is DONE only when these tests pass AND the full suite (`cd apps/web && pnpm test`) and `pnpm check` stay green.

## Constraints / do-nots

- Do NOT create a tRPC router here (Section 05). Do NOT import `adsGraphClient` (Section 06 — circular).
- `decrypt()` for ads credentials appears ONLY in this file. `getDecryptedAccessToken` must never be re-exported through any router barrel.
- No token or ciphertext in: logs, thrown error messages, audit payloads, notification bodies, or BullMQ payloads (this service enqueues nothing itself; scheduler helpers take ids only).
- Follow existing service style: plain exported async functions (like `userApiKeyService.ts`), drizzle `db` from the project's standard import, no classes required.
- All user-facing strings via the `ads.connection.*` / `ads.errors.*` i18n families seeded in Section 01 (server-side errors carry the Thai copy per project convention).
- Money defaults: `social_ads_settings.max_daily_budget_minor` default **50000** (฿500) — do not use the superseded ฿1,000.

## Acceptance

- Paste-token happy path yields an `active` connection with long-lived token, hint, accounts, scopes — verifiable via `getStatus`.
- Cross-app tokens are stored (short expiry) with a visible warning and never receive exchange/proof.
- Disconnect leaves zero recoverable secret material in the DB while preserving action-log history.
- A 190 anywhere downstream can call `markExpired` and get exactly one user notification and no further scheduled ads jobs for that connection.