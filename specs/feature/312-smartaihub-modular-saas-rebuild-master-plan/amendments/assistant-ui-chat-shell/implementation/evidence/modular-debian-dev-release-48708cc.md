# Modular Debian DEV release — Assistant UI audit source

**Target:** `modular-debian-dev` · `https://aimarkethubs.com` · Debian systemd + local Workerd · shared Core database `smartspec`
**Source revision:** `smartaihub-platform@48708cc241ae85e57774fa60d15b88c57c65ce6a`
**Release ID:** `modular-debian-dev-48708cc241ae85e57774fa60d15b88c57c65ce6a-safe-markdown`
**Deployed:** 2026-11-14 23:57:12 UTC
**Controller:** `apps/web/scripts/modular_debian_dev_release.py` with `--target modular-debian-dev`; the legacy target and Cloudflare production target were not used.

## Build artifact digests

| Component | Artifact path | Digest |
|---|---|---|
| Core | `apps/saas-core/dist` | `sha256:965ecf6a5e5771257440567ffd5afb0036328856592b2d45eaebc40b6c406a2a` |
| Shell | `apps/saas-shell/dist` | `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d` |
| Chat | `modules/chat/dist/ui` | `sha256:ea4e23e2d2c51d9121f8dd888ad4eded42037f1f32ef44a3852be88ba9fac721` |

## Controller smoke results

Controller outcome: `DEPLOYED_AND_VERIFIED`.

| Local service | Result |
|---|---:|
| Core | HTTP 200 |
| Chat | HTTP 200 |
| Shell | HTTP 200 |
| Chat session without cookie | HTTP 401 (expected auth boundary) |
| Chat manifest | HTTP 200 |
| Chat entry | HTTP 200 |

| Public route | Result |
|---|---:|
| Shell root | HTTP 200 |
| Shell login | HTTP 200 |
| Chat health | HTTP 200 |
| Chat session without cookie | HTTP 401 (expected auth boundary) |
| Chat module manifest | HTTP 200 |

Rollback remains available at `/home/dev/modular-development-releases/modular-debian-dev-48708cc241ae85e57774fa60d15b88c57c65ce6a-safe-markdown/rollback/cloudflared.pre-modular.yml`; the previous legacy service remains `smartspec-dev-web.service:3100`.

The registered target now points to this release receipt in `apps/web/scripts/deployment-targets.json`. These checks establish exact-source deployment and unauthenticated service/asset health only. They do **not** establish a logged-in send/response, attachment round-trip, history restore, cross-tenant denial, inspector correctness, or responsive browser behavior.

## Remaining runtime verification

Authenticated browser UAT was not possible: `orca-ide computer list-apps --json` and the required provider capability check both returned `accessibility_error: computer sidecar exited with code 1`. No credentials, cookies, tokens, or authenticated HTTP requests were used. The minimum follow-up is for the owner to open the deployed URL in a supported browser session, authenticate interactively (including MFA), and run the scenario matrix in `authenticated-uat-20261115.md` while recording redacted outcomes/screenshots.

Chat bundle build emitted a non-blocking chunk warning: `main` 516.91 kB minified (130.21 kB gzip), Astryx vendor 395.84 kB minified. Track code splitting separately from functional acceptance.
