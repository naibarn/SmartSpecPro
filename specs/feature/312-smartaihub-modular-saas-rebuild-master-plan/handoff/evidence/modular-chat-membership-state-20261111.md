# Modular Chat membership state and responsive recovery — 2026-11-11

## Root cause and change

The account can authenticate on the Modular development site, but Core has no active `tenant_users` membership for this user. `/v1/core/me` therefore returns an empty membership list and Chat correctly rejects tenant-scoped access. Read-only account metadata found the existing enabled account (`userId=1`) with zero active and total memberships. This is an authorization/workspace assignment gap, not a password mismatch or a missing chat route.

Platform commit `61f548101d9ca538d485c3712ee481897b0703e9` updates the Chat loader to distinguish expired sessions, missing memberships, forbidden workspaces, and service failures. The missing-membership state explains that sign-in worked but an administrator must assign a workspace; Retry now shows a loading state. When the session has multiple valid memberships, the UI offers a workspace chooser. Loading, error, and chooser states are centered in a responsive Astryx card, with tablet and mobile spacing rules.

No tenant or membership was created or changed. A hostname, the account's Legacy role, or the platform's environment-tenant ID was not used as a customer-data authorization grant.

## Build and deployment

- Integrated platform source: `smartaihub-platform` `main` at `61f548101d9ca538d485c3712ee481897b0703e9`.
- Target: `modular-debian-dev`, `https://aimarkethubs.com`, Debian with local Workerd, shared canonical `smartspec` database.
- Release: `modular-debian-dev-61f548101d9ca538d485c3712ee481897b0703e9-chat-access-ui`.
- Release receipt SHA-256: `34f87fe7a4fe430a7ce1209c782a30e04d8373f6f080dbe96fc0ed5e49f84323`.
- Core, Chat, and Shell builds passed from the exact integrated source after `pnpm install --frozen-lockfile`; `typecheck:chat` and `build:chat` passed in the focused checkout.
- Deployment controller returned `DEPLOYED_AND_VERIFIED`. Local Core/Chat/Shell health, Chat manifest/entry/assets, public Shell root/login, public Chat health, and the unauthenticated-session boundary passed (200/401 as expected).
- The public Chat stylesheet was fetched and confirmed to contain the centered state styles and the `64rem`/`48rem` responsive breakpoints.
- The old `smartspec-dev-web.service:3100` rollback path remains healthy. `smartaihub.app` and production `smartsihub.com` were not changed.

An initial systemd drop-in write was rejected during local preflight; the previous per-service working directories were restored and Core/Chat/Shell health was verified before retrying the release with corrected drop-ins. The successful release above is the active target.

## Remaining gaps

- The signed-in account still cannot enter a tenant-scoped chat until the owner identifies an existing customer workspace for which the user is authorized, or explicitly directs creation of a dedicated development-only workspace and membership. Do not guess a customer tenant or grant access from a role/domain.
- The Chat composer remains disabled until its scoped persistence and generation/provider path is implemented and provisioned (`canSend` is currently false). This is separate from loading the Chat UI.
- Authenticated browser click-through and visual checks on desktop, tablet, and mobile remain unverified. HTTP asset and responsive CSS checks are not browser UAT.
- `smartsihub.com` remains inactive.
