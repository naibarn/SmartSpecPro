# Modular login language selector deployment — 2026-11-10

- Target: `modular-debian-dev` (`https://aimarkethubs.com`), development only.
- Source: `smartaihub-platform` main at `4349529142843d42a78b8e961a5e4e863efcf676`.
- Release: `modular-debian-dev-4349529142843d42a78b8e961a5e4e863efcf676-language-selector-accent`.
- Runtime: Core, Chat, and Shell services are active from that release; public smoke returned Shell root/login 200, Chat health 200, unauthenticated Chat session 401, and module manifest 200. The 401 is the expected unauthenticated response.
- UI evidence: `modular-login-segmented-accent-20261110.png` shows the English/ไทย segmented language selector with the selected language highlighted in blue.
- Database/auth review: read-only metadata confirmed `smartaihubapp@gmail.com` exists in the shared `smartspec` database, is enabled, uses a bcrypt `$2b$12$` password hash, and has MFA enabled. No password or hash contents were read into output, changed, or reset. The actual password was not verified; successful sign-in and the MFA challenge remain unproven until the account owner retries with the existing password and completes MFA.
- Scope: no account was created, no credential was reset, and MFA was not bypassed. `smartsihub.com` production was not touched.

The release manifest SHA-256 is `c2a7c2de8f1ba97e9a0017bf069895a9c9257828b4f1016b172b9c4d5a670935`.
