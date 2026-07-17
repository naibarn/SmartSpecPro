# Feature 135 — two follow-ups left uncommitted (2026-07-17)

Both were interrupted by a sustained Anthropic API 529 outage (6 consecutive
agent kills), not by any design or code problem. **The work is on disk,
unstaged** — pick it up with the context below; nothing needs re-discovery.

Everything else in Feature 135 is committed and green: 18 commits,
`d499ae00c` … `f9d87442f`. See `usage.md`.

---

## Follow-up A — Operator UI (the feature cannot be enabled from UI without it)

**Why it matters:** today `hermesMediaWorker` (the tenant master gate) and all
15 hermes `system_settings` keys are SQL-only. Raw SQL also *bypasses*
`updateSetting`'s cache-invalidation, the dev-drainer start/stop side effect,
and `validateHermesLimitCoherence` — so SQL can leave incoherent limits and a
stale cache. The admin panel at AdminMonitoring shows those kill switches
read-only and links to Settings, which has no such controls: the loop is open.

### On disk, DONE and green
- `client/src/components/admin/tenantFeatureFlagGroups.ts` — `hermesMediaWorker`
  entry added (L301), label/description deliberately distinguish it from the
  unrelated agent-gateway `hermesAgentRuntime` lane.
- `client/src/components/admin/TenantFeatureFlagsPanel.tsx` + its
  `__tests__/TenantFeatureFlagsPanel.hermes.test.tsx` — green.
- `client/src/components/admin/HermesWorkerAdminPanel.tsx` + test — green;
  now links to BOTH destinations (Settings→Integrations for connection
  mutations, `/admin/settings?tab=infrastructure` for kill switches/limits).
- `client/src/components/admin/hermesWorkerSettingsKeys.ts` +
  `__tests__/hermesWorkerSettingsKeys.guard.test.ts` — the client key/default
  list plus a drift guard against the server's `HERMES_WORKER_SETTINGS_KEYS`.
- `client/src/components/admin/InfrastructureSettingsPanel.tsx` — the Hermes
  card itself: `HermesSettingField` presentational sub-component (~L213-242),
  the state block (~L376-395: `HERMES_WORKER_SETTINGS_DEFAULTS_CLIENT`, six
  booleans, eight `*Draft` strings), all 15 keys wired through the generic
  `systemSettings.updateSetting` mutation, defaults rendered when a key is
  absent, coherence rejection surfaced via toast.

### The one blocker
`client/src/components/admin/__tests__/InfrastructureSettingsPanel.hermes.test.tsx`
(223 lines, 6 tests) **hangs** — `npx vitest run` on it from `apps/web` exits
124 (timeout), it does not fail assertions. Cause: it mounts the whole
`InfrastructureSettingsPanel` (3,564 lines, 22 useQuery/useMutation calls, huge
import chain) in jsdom. The other two admin test files pass in seconds. Net
effect of a combined run: `Test Files 2 passed (3)`.

### The fix (diagnosed, briefed, not yet applied)
Extract, don't fight the mock — the same move section-12 already used for
`HermesFleetBadge` (pulled out of `AdminMonitoring.tsx` precisely because that
page can't be mounted in tests):

1. New `client/src/components/admin/HermesInfrastructureSettingsCard.tsx` owning
   the state + fields + save handlers, taking the settings data and the
   updateSetting mutation (or onSave callbacks) as **props**. Move
   `HermesSettingField` with it.
2. `InfrastructureSettingsPanel.tsx` keeps the query/mutation and renders
   `<HermesInfrastructureSettingsCard … />` where the card sits today — one
   tightly scoped hunk, nothing else in that file touched.
3. Rewrite the test to mount the card directly with props. Keep all 6 intents:
   5 kill switches + dev-only toggle with documented defaults when absent; the
   8 number/text fields defaulted (not blank); hydrate from existing rows;
   flipping a switch calls the generic `updateSetting` (not a bespoke
   endpoint); saving a limit passes the right key/value; a server-side
   coherence rejection shows a visible error (toast + inline), not a silent
   no-op. Rename to match the component if that's the local convention.

**Non-negotiables:** the 15 keys must keep writing through `updateSetting`
(that's the whole point — see "why it matters"); run vitest **from `apps/web`**
(from the repo root it dies on `EACCES` scanning root-owned `data/hermes`, which
belongs to the OLD agent-gateway Hermes lane — unrelated).

---

## Follow-up B — "Test generation" button (spec §6.1, never built)

**Why it matters:** `probe` today runs `hermes auth status` + `hermes tools` —
it proves the OAuth session is valid and which media tools are
credential-gated-visible. It does **not** prove a generation succeeds. Spec
§12.3/§19 document the real failure mode: OAuth login succeeds but xAI returns
**403 on generation** for subscription tiers without OAuth API entitlement. A
user discovers that today only when their first real VD generation fails.

### On disk, partial (unstaged)
- `server/hermesWorker/connectionControlHandlers.ts` — `testGeneration` plumbed
  into the probe handler (6 refs).
- `server/services/hermesConnectionService.ts` — 9 refs.
- `server/routers/hermesConnections.ts` — 2 refs (incomplete).
- `shared/hermesMedia.ts` — modified (manifest type additions).
- `server/hermesWorker/__tests__/connectionControlHandlers.test.ts` — the
  existing probe tests were confirmed still byte-identical for the
  unmodified path.

### Remaining
1. Router: `probe` input gains `testGeneration?: z.enum(["image","video"]).optional()`
   (same procedure — keeps ownership/admin gating identical). Video test must
   refuse with `HERMES_DISABLED` when `hermes_worker_video_enabled` is off.
2. Cooldown: a live test burns real Grok quota — rate-limit per connection
   (settings-backed, e.g. 1 per 5 min) → `HERMES_RATE_LIMITED` +
   `retryAfterSeconds`. Never bill platform credits (provider_account).
3. Persist the result where the client can read it: `lastGenerationTest:
   { assetType, ok, at, errorCode? }` on the capability manifest, projected
   onto `SafeHermesConnection.capabilitySummary` so section-10's panel renders
   it.
4. Tests (against the shared fake CLI at
   `server/hermesWorker/__tests__/fixtures/fakeHermesCli/`, which already has a
   `generate` branch): probe-without-testGeneration byte-identical; image
   success recorded; xAI-403 → `entitlement_restricted` classification + the
   connection status flip; timeout → typed failure; video with the flag off →
   `HERMES_DISABLED`; cooldown → `HERMES_RATE_LIMITED`; **the artifact is never
   uploaded/registered** (assert those deps are never called — this is a
   liveness check, not a Library asset).
5. Client button (section-10's `HermesConnectPanel`) wired to the extended
   procedure once the contract lands.

**Do not invent error codes** — the 22 in `shared/hermesMedia.ts` are frozen.

---

## Also worth knowing

- Real typecheck baseline in this checkout today is **154**, not the ~140 the
  section docs cite — drift from concurrent sessions, not from this feature.
  What matters per file: zero errors in the files you touch.
- Related follow-ups already tracked outside this doc: `task_bf5fa5be` (6 tests
  red on main from a concurrent session's MCP auto-resolve change that rode
  along in `b85ccd818`), `task_8d22477a` (library parentId ownership),
  `task_f34c6e44` (drizzle-kit 0146/0147 snapshot collision).
