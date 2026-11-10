# Modular login language selector right alignment — 2026-11-10

- Target: `modular-debian-dev` (`https://aimarkethubs.com`), development only.
- Source: `smartaihub-platform` main at `b35231155cc5d0542225c5089ac5d9cb6a2fa384`.
- Release: `modular-debian-dev-b35231155cc5d0542225c5089ac5d9cb6a2fa384-language-selector-right-align`.
- Runtime: Core, Chat, and Shell systemd services are active with working directories under the release above. The public Shell login and root return 200, Chat health and module manifest return 200, and an unauthenticated Chat session returns the expected 401.
- UI evidence: `modular-login-language-selector-right-align-20261110.png` is a fresh public screenshot at 1440x1000. Browser layout inspection confirms the header uses `space-between`; the brand is at the left content edge and the English/ไทย selector ends at the right content edge.
- Build evidence: package typecheck and build passed for Shell; exact-SHA canonical-source builds passed separately for Core, Chat, and Shell with Wrangler dry-runs.
- Login scope: the existing `smartaihubapp@gmail.com` account metadata remains present in the shared `smartspec` database, enabled, with a bcrypt `$2b$12$` password hash and MFA enabled. The actual password was not available for verification; successful authentication remains unproven until the account owner signs in with the existing password and completes MFA. No password was changed, no account was created, and MFA was not bypassed.
- Production scope: `smartsihub.com` was not changed.

The release manifest records the actual systemd activation at `2026-11-10T07:35:04Z` and the post-activation smoke results. Its SHA-256 is `fc8b18a68c238f24887a810d4d7a349ce8ec47b6c5299d718102b95df37ec943`.
