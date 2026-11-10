# Modular login bcrypt Worker-runtime fix — 2026-11-10

## Finding

The account owner's saved credentials were accepted by the Legacy site through to its MFA challenge, while Modular Core rejected the same login as a password mismatch. A safe Core log entry at `2026-11-10 19:08 +07` recorded only `password_mismatch`.

The cause was the bcrypt verifier's runtime WebAssembly compilation. Workerd rejects `WebAssembly.compile()`; the verifier caught that runtime error and returned `false`, which the login route reported as invalid credentials. A synthetic bcrypt check in Workerd reproduced the runtime error before the fix.

## Change and release

- Platform source: `smartaihub-platform` main, `cef2354c6110bf558a12fac4558546c0878c57c2`.
- The Worker entrypoint now uses the pinned precompiled bcrypt module as a static Wasm import. Each password check receives a fresh Wasm instance because bcrypt mutates instance-local state; input bytes are cleared after verification.
- The existing `smartspec` database, account rows, password hashes, and legacy `smartaihub.app` runtime were not changed. `smartsihub.com` remains inactive.
- Target: `modular-debian-dev`, `https://aimarkethubs.com`, Debian with local Workerd.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-cef2354c6110bf558a12fac4558546c0878c57c2-worker-bcrypt-precompiled`.
- Core artifact digest: `sha256:957cbcde432d183d3577d05fbcd4b85ccf4d5769339afd1ac1a5674db499faa4`.
- The Core, Chat, and Shell remain independently built modules; no aggregate Legacy build or Cloudflare production deployment ran.

## Verification

- Core tests: 75/75 passed across 13 files; Core TypeScript check passed.
- Core Wrangler dry-run passed at 420.46 KiB (102.96 KiB gzip). Chat and Shell builds also passed independently.
- The updated verifier passed a Workerd probe using a synthetic bcrypt hash: matching password returned `true`, mismatching password returned `false`, with no runtime compilation error.
- The Modular Debian release controller returned `DEPLOYED_AND_VERIFIED`. Local Core/Chat/Shell health and public Shell/Chat smoke checks passed; the unauthenticated Chat session remained 401.
- A post-deploy login probe used only `modular-auth-probe@example.invalid` and a synthetic password. It returned the expected generic 401 and logged only `account_missing`; the Core log showed no Wasm error.

The owner must retry the real saved-password login and complete MFA to verify the full account flow. No real password was read, sent, logged, reset, or changed. If login still fails, provide only the attempt time so the safe rejection category can be checked; do not send credentials.
