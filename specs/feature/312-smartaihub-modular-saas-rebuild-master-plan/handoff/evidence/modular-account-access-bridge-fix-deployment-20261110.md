# Modular account access bridge fix and development deployment — 2026-11-10

- Target: `modular-debian-dev` at `https://aimarkethubs.com` (Debian systemd with local Workerd); `smartaihub.app` remains the legacy site and `smartsihub.com` remains inactive.
- Source: `smartaihub-platform` `main` at `f85520edeaa574844338448b4352712629f832dc`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-f85520edeaa574844338448b4352712629f832dc-legacy-auth-bridge-fixed/release-manifest.json`.
- Core artifact digest: `sha256:f6371058c0e4bfa4f6ffd293ddcb0d38d922df8f6173fcf90f4cb90a1bfa0b8a` (Wrangler dry-run: 402.48 KiB / 94.18 KiB gzip). Shell and Chat remained separate build artifacts with their own release-manifest digests.
- Public login screenshot: `handoff/evidence/modular-login-final-20261110.png`.

The new login links, signup and password recovery UI were already implemented in the preceding Modular release. This follow-up fixed the API bridge that made signup and password recovery unavailable: Workerd rejects `redirect: "error"` before making the request. The bridge now uses `redirect: "manual"` and accepts only the expected successful tRPC response; redirects and malformed replies remain failures. The Debian development Core calls the existing legacy auth service on loopback port 3000, preserving its existing account database, invite rules, verification codes and email delivery. The Cloudflare production target remains fail-closed for this bridge.

Verification on the deployed release:

- Core unit tests: 73 passed across 12 files; Core TypeScript check passed.
- Public UI routes `/`, `/login`, `/signup`, `/forgot-password`, and `/verify-email`: HTTP 200.
- A password-reset request for a nonexistent `example.invalid` address returned HTTP 200 with the generic `reset_code_requested` status. It did not send a message to a real account or alter credentials.
- Release controller: `DEPLOYED_AND_VERIFIED`; local Core/Chat/Shell and public Shell/Chat smoke checks passed. The unauthenticated Chat session returned 401 as expected. All three systemd services run from this release.
- Shell tests and typecheck passed in the preceding UI commit; its login-link and signup/recovery-flow tests remain unchanged.
- Playwright captured the deployed `/login` page at 1280×900. The screenshot shows the SmartSIHub branding, right-aligned language toggle, show-password control, and both forgot-password and signup links.

No real password was read, logged or changed. The existing account's password acceptance and MFA completion are still unverified because the account owner has not retried sign-in against this release. A safe rejection category is logged by Core if that attempt still fails; it excludes the email, password and stored hash. Continue with owner login/MFA, customer membership/data UAT, matched same-database latency comparison, and development/production-isolation evidence. Keep the parent Spec acceptance partial.
