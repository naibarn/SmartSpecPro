# Modular Debian DEV release — Chat authority metadata

**Target:** `modular-debian-dev` · `https://aimarkethubs.com` · Debian systemd + local Workerd · shared Core database `smartspec`
**Source revision:** `smartaihub-platform@ad04c244c3996cc81220d7efae0f0c536dd07f4b`
**Release ID:** `modular-debian-dev-ad04c244c3996cc81220d7efae0f0c536dd07f4b-chat-authority-metadata`
**Deployed:** 2026-11-15 00:10:36 UTC
**Controller:** `apps/web/scripts/modular_debian_dev_release.py` with `--target modular-debian-dev`. This was not a `smartaihub.app` release, a Cloudflare Worker deployment, or a production action.

## Exact-source artifacts

| Component | Artifact path | Digest |
|---|---|---|
| Core | `apps/saas-core/dist` | `sha256:10f94afaa3032049348d77093f14963197e8ad164dbd409ff3599d6ef0e43739` |
| Shell | `apps/saas-shell/dist` | `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d` |
| Chat | `modules/chat/dist/ui` | `sha256:bfc67ee501e6c8cd7e2aa62d4c9a07a6a11ce82e7fd1c9e5b278de1f885338ac` |

Public source asset bytes matched the exact release artifact:

| Public Chat asset | SHA-256 | Match |
|---|---|---|
| `assets/main-zV8LwF3g.js` | `61983186af3799ed28b2caf56c0ccddde3fce62c9a9c5ec229cc1c82da526ea0` | Yes |
| `assets/main-24yfBvyQ.css` | `b48492cc770a47ee9671e5f96bbad40be450683d082f007b758d733117a2a03b` | Yes |

The public Chat module manifest now reports `Core-authenticated-workspace-scoped-writes`, `user-workspace-scoped-R2-attachments`, and `worker_jobs-outbox-Cloudflare-Queue`; it no longer claims writes are disabled. This corrects stale module metadata. It is **not** proof that this metadata caused or fixed the user's earlier send failure; authenticated send/response was not exercised.

## Runtime smoke and rollback

Controller outcome: `DEPLOYED_AND_VERIFIED`.

- Local Core, Chat and Shell health/entry routes: `200`.
- Public Shell root/login, Chat health and module manifest: `200`.
- Chat session without a cookie: `401` locally and publicly, preserving the authentication boundary.
- Previous service `smartspec-dev-web.service:3100` remains the rollback target.
- Rollback configuration: `/home/dev/modular-development-releases/modular-debian-dev-ad04c244c3996cc81220d7efae0f0c536dd07f4b-chat-authority-metadata/rollback/cloudflared.pre-modular.yml`.
- Target registry now points to this release and receipt.

The Chat bundle still reports a non-blocking `main` chunk warning: `516.91 kB` minified (`130.21 kB` gzip); Astryx vendor chunk is `395.84 kB` minified.

This release proves exact-source deployment, unauthenticated service health, asset-byte parity and rollback availability only. Authenticated Chat flows and responsive screenshot UAT remain blocked as described in [authenticated UAT evidence](authenticated-uat-20261115.md).
