# Section 05 — Ten gap-review rounds

- Review date: 2026-11-10
- Reviewed source: `smartaihub-platform@6c1b97a65f860ba5d9dadb06e188fa53316efbdb`
- Profile: `package`
- Resource evidence: 30 GiB RAM; 23 GiB available at 2026-11-10 04:16 UTC.
- Scope: independently built Browser Pilot policy/adapter package, Chat capability projection, package build graph, and Section 05 acceptance boundaries.

## Review results

1. **Spec authority and development path.** Found the old R1.1 text still made SPEC-224 mandatory. Added R1.7, explicitly superseded that entry-path rule while preserving the historical text, and updated the Claude implementation plan. Direct Codex/Claude work and the existing SPEC-224 route are now both supported; Run evidence remains path-specific.
2. **Build isolation.** Confirmed there is no root `build` script. `build:browser-pilot` selects Browser Pilot plus the small contracts dependency; `build:chat` selects Chat plus contracts. Neither scope includes Core, Shell, Legacy `apps/web`, or other modules.
3. **Module dependency direction.** The first review found Chat importing Browser Pilot implementation, which violated the module boundary. Removed that import. Chat now consumes only the shared capability DTO; Browser Pilot builds independently and no module imports another module's implementation.
4. **Authentication and tenant boundary.** The capability response remains behind Core-session authentication and membership-verified tenant selection. No Browser Pilot run route was added, and no caller-supplied user or tenant identity grants authority.
5. **Canonical durable-job authority.** Browser Pilot exposes only a typed adapter port requiring idempotency and canonical `worker_jobs` plus outbox admission. It creates no queue, table, or job store. No configured canonical adapter was found, so no job is admitted and the UI exposes no run action.
6. **URL and egress policy.** Exact HTTPS origins, malformed URLs, embedded credentials, unsupported origins, IP literals and local-only hostnames are covered by focused tests. Review confirmed this is only an origin preflight: DNS rebinding, private-address egress and redirect validation require the authorized provider. That prerequisite is documented and the capability remains disabled.
7. **Capability honesty and compatibility.** The server returns all actual unavailable reasons. The UI maps only those reasons, shows no Browser Pilot action, and treats an older Chat API response without the new field as unavailable. Unit coverage confirms these paths.
8. **Browser and responsive UI.** Local Playwright covered 360×800, 390×844, 768×1024, 1024×768, 1280×800 and 1440×900. Every mocked session landed on `/chat`; there was no horizontal overflow or JavaScript error, and history/artifact panels opened as expected. One viewport also exercised the missing-capability-field fallback. These calls used mocked Core/Auth/Chat responses and do not prove real account login.
9. **Worker footprint and runtime fit.** Browser Pilot emits a 2,706-byte JS module and 1,803-byte declaration file. Chat assets measured 222.40 kB JS (69.24 kB gzip) and 3.14 kB CSS (0.91 kB gzip); its Wrangler dry-run measured 56.20 KiB Worker upload (13.59 KiB gzip). No browser binary, Playwright runtime, `waitUntil` task, Express import, or Legacy runtime import was added. Wrangler ran in dry-run mode only.
10. **Domains, data and acceptance claims.** No database, DNS, Worker deployment, service, port, or Tunnel was changed. `aimarkethubs.com` remains untouched and `smartsihub.com` remains inactive. Real canonical-account login, Chat persistence/provider, browser execution, target health, and human UAT remain unverified and are not claimed.

## Verification record

| Profile | Command/scope | Outcome |
|---|---|---|
| package | `pnpm run test:browser-pilot` | PASS — 7 tests |
| package | `pnpm run typecheck:browser-pilot` | PASS |
| package | `pnpm run test:chat` | PASS — 24 tests |
| package | `pnpm run typecheck:chat` | PASS |
| package | `pnpm run build:browser-pilot` | PASS — Browser Pilot + contracts only |
| package | `pnpm run build:chat` | PASS — Chat + contracts only; Wrangler dry-run |
| package | `pnpm --filter @smartaihub/saas-contracts test` | PASS — 2 tests |
| package | local mocked Playwright matrix | PASS — 6 viewport sizes |
| package | `git diff --check` | PASS |

Screenshots: `section-05-browser-20261110/smartaihub-chat-small-mobile.png` and `section-05-browser-20261110/smartaihub-chat-desktop.png`. Both contain mocked preview data.

## Open external/runtime gaps

- Browser provider/approved executor, canonical `worker_jobs` plus outbox adapter, and host egress/redirect enforcement are absent. Keep Browser Pilot unavailable until those are provisioned and verified.
- Existing development DB audit found the Core auth role cannot access Chat tables, and those tables do not have RLS enabled. Do not enable Chat persistence with the auth role; provision/verify a separate least-privilege tenant-scoped adapter first.
- No model provider is configured. No real account credential was supplied to the local test harness; do not create or reset an account to close this evidence gap.
- No deployment, real `aimarkethubs.com` health, handover, Cloudflare staging, or production acceptance is established by these checks.
