# Section 02 — Shared Ads Primitives: Money, Account Time, Error Map, Sanitizer Extension

**Section id:** `section-02-shared-primitives`
**Feature:** 031-SocialAdsManagement · Rollout phase P1
**Depends on:** none (parallelizable with section-01-schema-flags-i18n)
**Blocks:** section-04-ads-connection-service, section-06-ads-graph-client (and transitively every ads section — all money math, timezone bucketing, error surfacing, and log sanitization flow through these primitives)

---

## 1. Goal

Build the four correctness primitives that every other ads section imports. These exist to prevent an entire class of silent money-losing and secret-leaking bugs (spec.md decisions D7, D8; security finding 3 — CRITICAL):

1. **Money** — typed minor-unit integer math; no floats anywhere in ads code.
2. **Account time** — date windows computed in the ad account's IANA timezone, never server-local `new Date()` day-bucketing.
3. **Ads error map** — the single translation layer from raw Graph API errors to Thai/English user messages; raw Graph errors never reach the client.
4. **Sanitizer extension** — the existing key-name-based audit sanitizer learns to scrub token-shaped strings *inside values* (URL-embedded tokens, bare `EAA…` tokens), plus an 8KB-truncating variant for the immutable action log.

No database, Redis, network, or feature-flag dependencies. Pure functions + one edit to an existing service file.

## 2. Files

| Action | Path |
|---|---|
| Create | `apps/web/shared/socialAds/money.ts` |
| Create | `apps/web/shared/socialAds/money.test.ts` |
| Create | `apps/web/shared/socialAds/accountTime.ts` |
| Create | `apps/web/shared/socialAds/accountTime.test.ts` |
| Create | `apps/web/server/services/social/adsErrorMap.ts` (new directory `server/services/social/` — later sections add more files here) |
| Create | `apps/web/server/services/social/__tests__/adsErrorMap.test.ts` |
| Edit | `apps/web/server/services/auditLogger.ts` (sanitizer extension + `sanitizeForActionLog` + new `AuditEventType` members) |
| Create | `apps/web/server/services/__tests__/auditLogger.adsSanitizer.test.ts` (new sibling file — do NOT rewrite the existing `auditLogger.test.ts`; it must stay green untouched) |

Import conventions (verified against the repo): server code imports shared modules by relative path (e.g. `import { formatMoney } from "../../shared/socialAds/money"` — same idiom as `shared/featureFlags` imports in `server/middleware/requireFeatureFlag.ts:25`); client code uses the `@shared/socialAds/money` alias. Shared-module tests are colocated `*.test.ts` (idiom: `shared/featureFlags.test.ts`); server-service tests live in `__tests__/` directories.

## 3. Tests First (TDD)

Write ALL of the following tests before implementing. Vitest, node env, no network, no DB. Run with `cd apps/web && pnpm vitest run shared/socialAds server/services/social/__tests__/adsErrorMap.test.ts server/services/__tests__/auditLogger.adsSanitizer.test.ts`, then the full suite `cd apps/web && pnpm test`.

### 3.1 `shared/socialAds/money.test.ts`

- **THB formatting:** `formatMoney({currency: "THB", amountMinor: 50_000}, "th-TH")` renders as ฿500 (or the `Intl.NumberFormat` THB equivalent — assert on the numeric substring, not exact glyph layout, to stay ICU-version-safe). A USD case verifies 2-decimal minor units (`{USD, 12345}` → `$123.45`).
- **`pctOfMinor` bounds:** result clamps to `min` when the raw percentage falls below it, clamps to `max` when above; unclamped case returns the exact integer.
- **Rounding half-up:** e.g. 15% of an amount ending in `.5` minor units rounds up; assert `Number.isInteger(...)` on every output of every helper (the no-floats canary).
- **`assertSameCurrency`:** THB+THB passes; THB+USD throws with a message naming both currencies.
- **`addMinor`:** sums `amountMinor`, throws on currency mismatch (delegates to `assertSameCurrency`).

### 3.2 `shared/socialAds/accountTime.test.ts`

Use `vi.useFakeTimers()` + `vi.setSystemTime()` to pin the instant. Core scenario: pick a UTC instant where **Asia/Bangkok is already past midnight but America/Los_Angeles is not** (e.g. `2026-07-16T18:30:00Z` = Jul 17 01:30 BKK, Jul 16 11:30 LA):

- `accountToday("Asia/Bangkok")` → `"2026-07-17"`; `accountToday("America/Los_Angeles")` → `"2026-07-16"`.
- `accountDayRange(tz, "today")`, `"yesterday"`, `"last_7d"` return `{since, until}` `YYYY-MM-DD` strings consistent with each timezone's local date.
- `last_3d` is **exclusive of today** (Meta preset semantics: the 3 full days before today) — assert exact since/until.
- DST transition: pin the system time inside the US spring-forward day (e.g. around `2026-03-08` in `America/New_York`) and assert `last_7d` still yields 7 distinct calendar dates with no skipped/duplicated day.
- `lifetime` returns a sentinel the Graph client can map to Meta's lifetime preset (no date math).

### 3.3 `server/services/social/__tests__/adsErrorMap.test.ts`

Feed `resolveAdsError` fixture objects shaped like real Graph error bodies (`{error: {code, error_subcode, message, error_user_msg?, error_user_title?, fbtrace_id?}}` — accept both the wrapped and unwrapped shape):

- **code 190** → `retryable: false`, severity indicates reconnect-required, `userMessageTh` is non-empty Thai (regex `/[ก-๙]/`), remediation mentions reconnecting.
- **code 17 / subcode 80004** → `retryable: true`, throttle severity; likewise 4, 32, 613 and subcodes 80000/80001.
- **code 100** → validation, non-retryable; **200/272/294** → permission, non-retryable.
- **code 2635** → version-deprecated entry.
- **`error_user_msg` preference:** when Meta supplies `error_user_msg`, it is surfaced (in the result's user-facing message fields) in preference to the map's canned copy.
- **Unknown code (e.g. 999999):** returns the generic fallback entry AND logs a WARN including code+subcode (spy on the logger — `vi.mock` whatever logger module the implementation uses, or assert via `console.warn` spy if implementation uses console-level logging; pick one and pin it in the test).

### 3.4 `server/services/__tests__/auditLogger.adsSanitizer.test.ts`

Import `sanitizePayload` and `sanitizeForActionLog` from `../auditLogger`:

- **URL-embedded token:** `{url: "https://graph.facebook.com/v25.0/me?fields=id&access_token=EAAabc123…"}` → the string value survives but the `access_token=…` span is replaced with `[REDACTED]` (the rest of the URL is preserved for debuggability).
- **Bare token in nested error object:** `{error: {details: {hint: "token EAA" + "x".repeat(30) + " expired"}}}` → the `EAA…` run is `[REDACTED]`.
- **Arrays of strings:** `["EAA…long-token…", "safe"]` → first element redacted, second untouched.
- **Deeply nested string** (depth > 6 object nesting) still gets scrubbed — regression guard for the existing `depth > 6` early-return in `sanitizeValue` (see §4.4).
- **Existing key-based redaction still works:** `{access_token: "plain-value"}` → `"[REDACTED]"` (i.e. the extension is additive; also run the existing `auditLogger.test.ts` untouched as proof of no regression).
- **`sanitizeForActionLog` truncation:** a payload whose JSON serialization exceeds 8KB comes back ≤ 8KB (serialized) with an explicit truncation marker; a small payload passes through structurally intact and sanitized.
- **Type-level:** the five new `AuditEventType` members (`"social_ads_request"` etc.) are assignable (plain assignment or `expectTypeOf`).

## 4. Implementation

### 4.1 `shared/socialAds/money.ts`

Shared by client and server, therefore: no server-only imports, no `Intl` assumptions beyond what Node 20+ and evergreen browsers share.

```ts
export interface Money {
  currency: string; // ISO-4217, e.g. "THB"
  amountMinor: number; // integer minor units (satang/cents)
}

export function formatMoney(m: Money, locale?: string): string; // Intl.NumberFormat currency style; divide by the currency's minor-unit factor
export function addMinor(a: Money, b: Money): Money; // throws on currency mismatch
export function pctOfMinor(m: Money, pct: number, bounds?: { min?: number; max?: number }): Money; // integer half-up rounding, then clamp
export function assertSameCurrency(a: Money, b: Money): void;
```

Notes:
- Minor-unit exponent: THB and USD are both 2; use `Intl.NumberFormat(...).resolvedOptions()` or a tiny exponent lookup with default 2 — do NOT hardcode `/100` inline at call sites.
- Half-up rounding must be implemented with integer arithmetic (`Math.round` on a non-negative product is half-up; document the behavior for negative amounts or reject negatives — budgets are never negative).
- Every helper validates `Number.isInteger(amountMinor)` on inputs and guarantees it on outputs; throw on violation rather than silently rounding inputs.

### 4.2 `shared/socialAds/accountTime.ts`

```ts
export type AdsDatePreset = "today" | "yesterday" | "last_3d" | "last_7d" | "last_30d" | "lifetime";

export function accountToday(timezoneName: string): string; // "YYYY-MM-DD" in the account's tz
export function accountDayRange(timezoneName: string, preset: AdsDatePreset): { since: string; until: string } | { preset: "lifetime" };
```

Notes:
- Compute the local calendar date via `Intl.DateTimeFormat("en-CA", { timeZone: timezoneName, year, month, day })` (en-CA yields `YYYY-MM-DD` directly) — never via `getFullYear()`/`getMonth()` on a raw `Date`.
- Day arithmetic: step in whole days by adding/subtracting `86_400_000` ms to the pinned instant and re-projecting through `Intl` each step, OR decompose to `{y,m,d}` and use `Date.UTC` arithmetic on the *local* calendar date. Either is DST-safe; naive local-midnight math is not — this is exactly what the DST test guards.
- Preset semantics (Meta): `last_3d` = the 3 complete days ending yesterday (exclusive of today); `last_7d`/`last_30d` likewise exclusive of today; `yesterday` = single day. Document each in a docstring — section 06 (Graph client), 08 (guardrail cap checks), 09 (spend anomaly baseline), and 10 (optimizer windows) all consume these.
- Invalid/unknown `timezoneName` must throw loudly (a wrong-timezone spend cap is a money bug); callers capture `timezone_name` at connect time (section 04).

### 4.3 `server/services/social/adsErrorMap.ts`

```ts
export interface ResolvedAdsError {
  severity: "auth" | "throttle" | "validation" | "permission" | "version" | "unknown";
  retryable: boolean;
  code: number | null;
  subcode: number | null;
  userMessageTh: string;
  userMessageEn: string;
  remediation: string; // short actionable hint, e.g. "reconnect token in Settings"
}

export function resolveAdsError(graphError: unknown): ResolvedAdsError;
```

Seed entries (data table keyed by `code` with optional subcode overrides):

| code / subcode | severity | retryable | Thai message theme |
|---|---|---|---|
| 190 | auth | no | โทเคนหมดอายุ/ถูกเพิกถอน — เชื่อมต่อใหม่ในตั้งค่า |
| 100 | validation | no | ข้อมูลคำขอไม่ถูกต้อง |
| 17, 4, 32, 613 (+subcodes 80000 insights / 80004 ads_management / 80001 pages) | throttle | yes | เรียก API ถี่เกินไป — ระบบจะลองใหม่อัตโนมัติ |
| 200, 272, 294 | permission | no | สิทธิ์ไม่เพียงพอ (`ads_management`/บทบาทในบัญชีโฆษณา) |
| 2635 | version | no | เวอร์ชัน API เลิกใช้แล้ว — แจ้งผู้ดูแลระบบ |
| budget-below-minimum (Meta reports via code 100 + message/subcode) | validation | no | งบต่ำกว่าขั้นต่ำของสกุลเงิน |
| special-ad-category targeting violation | validation | no | การกำหนดเป้าหมายขัดกับหมวดโฆษณาพิเศษ |

Behavior rules:
- Accept both `{error: {...}}` (raw Graph body) and the inner error object; tolerate missing fields.
- When `error_user_msg` (and `error_user_title`) are present, prefer them for the user-facing message (they're already localized by Meta for the token's locale); keep the map's `remediation` and classification.
- Unknown code → return the `unknown` generic entry and log **WARN with code + subcode + fbtrace_id** so the map can be expanded from production logs. Never throw from `resolveAdsError` itself.
- Messages are inline literals in this module (Thai primary, English secondary) — deliberately NOT i18n keys, so this section has zero dependency on section 01's locale files and server-side jobs (sections 09/10) can embed messages in notifications without a client i18n runtime.
- Downstream contract (enforced in later sections, stated here for context): tRPC procedures convert Graph failures ONLY through this map; `adsGraphClient` (section 06) uses `retryable` for its GET retry matrix and `severity: "auth"` to trigger `markExpired`.

### 4.4 Sanitizer extension in `server/services/auditLogger.ts`

Current state (read before editing): `SENSITIVE_KEYS` set at `:238-254`, `sanitizeValue` at `:258-276` (key-name-based only; **returns string values untouched** at `:260` and early-returns anything at `depth > 6` at `:259`), `sanitizePayload` exported at `:314`, `AuditEventType` union at `:18+`.

Changes (all additive — existing tests must pass unmodified):

1. **String scrubbing** — add a module-level helper, e.g. `scrubTokenShapes(s: string): string`, applying two regexes: `access_token=[^&\s"']+` → `access_token=[REDACTED]` and `EAA[A-Za-z0-9]{20,}` → `[REDACTED]`. Call it from `sanitizeValue`'s string branch instead of returning the string as-is.
2. **Depth-guard fix** — move the `typeof obj === "string"` check (with scrubbing) **before** the `depth > 6` early return, so token-shaped strings at any depth are scrubbed while object recursion is still depth-capped. This is the regression the deep-nesting test targets.
3. **`sanitizeForActionLog(payload)`** — new export: run `sanitizePayload`, then if `JSON.stringify` of the result exceeds 8_192 bytes, truncate deterministically (e.g. keep a `{_truncated: true, _originalBytes: n, preview: <first ~8KB of the serialized form, scrubbed>}` wrapper — the exact shape is the implementer's choice, but it must (a) never exceed 8KB serialized, (b) be valid JSON-serializable, (c) pass through the scrubber AFTER slicing, since a slice can't split-protect a token that regex already removed but could truncate mid-`[REDACTED]` harmlessly). Consumed by section 08's `adsActionService` for `social_ads_action_log.request_payload`/`graph_response` and by section 06 for `ads_request/ads_response` audit events.
4. **`AuditEventType` members** — append `"social_ads_request" | "social_ads_response" | "social_ads_action" | "social_ads_guard_triggered" | "social_ads_advisor_report"` to the union. This section owns this edit (it is the only section whose file list includes `auditLogger.ts`); sections 06/08/09/12/13 only *use* these members.

Performance note: the regexes run on every string in every audit payload — keep them non-backtracking (both given patterns are linear) and skip strings shorter than ~10 chars as a fast path if profiling ever matters; do not pre-optimize beyond that.

## 5. Acceptance Criteria

- All new tests in §3 pass; the pre-existing `server/services/__tests__/auditLogger.test.ts` passes **without modification**.
- `cd apps/web && pnpm test` (full suite) green; `pnpm check` introduces no new type errors in the touched files (the repo has known pre-existing tsc noise — compare against baseline, don't chase unrelated errors).
- No float ever escapes a Money helper (`Number.isInteger` canary tests).
- Grep-level review: no `new Date().getDate()`-style bucketing inside `shared/socialAds/` other than through the `Intl` projection.
- `sanitizeForActionLog` output for a fixture containing a 10KB Graph error with an embedded `EAA…` token is ≤ 8KB and contains no `EAA` substring.

## 6. Notes for Neighboring Sections (do not implement here)

- Section 04 imports `accountTime` types when caching `timezone_name` per ad account and calls nothing else from here except the sanitizer via audit events.
- Section 06's Graph client is the primary consumer of `resolveAdsError` (retry matrix + markExpired trigger) and of the `Money` parsing of budget/spend fields; it also owns `META_GRAPH_VERSION = "v25.0"` — that constant does NOT live in this section's files.
- Section 01 seeds `ads.errors.*` i18n keys for *client-side* generic error UI; this section's map intentionally carries its own inline Thai/English strings for server-originated messages. Both exist by design — do not merge them.