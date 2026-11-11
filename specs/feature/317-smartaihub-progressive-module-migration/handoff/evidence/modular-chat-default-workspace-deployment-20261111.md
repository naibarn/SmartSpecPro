# SPEC-317 Chat workspace default and controls — 2026-11-11

The independently built Chat and Core slice from `smartaihub-platform/main@d1e71fe8aa4b8019f08559a5e69a15a4f9228930` is deployed to `modular-debian-dev` / `https://aimarkethubs.com`. On first authenticated Chat load, Core provisions an environment-scoped personal default workspace idempotently. The Chat toolbar lets the user select an authorized workspace or create and immediately switch to another personal workspace.

Migrations 0420 and 0421 are applied to the existing development `smartspec` database. Independent Core, Shell and Chat builds passed. The target release controller returned `DEPLOYED_AND_VERIFIED`; local and public health checks, unauthenticated-session 401, Chat manifest/assets, target binding and port-3100 rollback health passed. The controller retained a Tunnel rollback config and the previous service drop-ins are preserved under the release's `rollback/systemd/`.

Ten focused review passes and detailed DB/security/UI evidence are recorded in [SPEC-312 workspace deployment evidence](../../../312-smartaihub-modular-saas-rebuild-master-plan/handoff/evidence/modular-chat-default-workspace-deployment-20261111.md).

Authenticated visual UAT remains open. The composer remains disabled until scoped Chat persistence and a model provider are configured; this release does not claim AI responses are available. Browser Pilot and `smartsihub.com` production remain unchanged.


## Follow-up — focused default Chat workspace, 2026-11-11

After the reported “Chat not ready” screen, platform revision `d6b8231a7e12884c1d4296d881fc94c4ea0aa5dd` was deployed to `modular-debian-dev` at `https://aimarkethubs.com` using release controller revision `4fbef4dfe49675143cbeecbc390a08caa4281889`. The release receipt records `DEPLOYED_AND_VERIFIED` at `2026-11-11T07:23:52.326577+00:00`. Core, Chat and Shell local probes returned 200; public Shell root/login, Chat health and module manifest returned 200; unauthenticated Chat session returned the expected 401. The legacy rollback site on port 3100 remained healthy. The deployed Chat manifest and imported main chunk were fetched from the public domain; the chunk contains the new default-workspace and provider-unavailable copy.

The Chat view now opens directly into the account’s default personal workspace. Unavailable history and artifact panels are omitted so they do not look like failed controls; workspace selection/creation remains available. Responsive local browser preview with mocked session/capabilities rendered without horizontal overflow at 1440×900, 768×1024 and 390×844. This is layout verification, not authenticated hosted UAT.

Actual message sending and persisted history are still unavailable: the Chat Worker has no configured model provider, and its verified role lacks the scoped conversation/message/artifact write path and RLS evidence. The composer remains disabled with an explicit reason instead of presenting a non-working send button. Do not route this through the retired Express app. The next readiness work is to provision an approved provider binding and a tenant-scoped persistence role/RLS contract, then enable the relevant capabilities and perform authenticated UAT.

The active development target map now points to release `modular-debian-dev-d6b8231a7e12884c1d4296d881fc94c4ea0aa5dd-default-chat-ui`. Cloudflare production target `smartsihub.com` remains inactive and unchanged. The first handover attempt was automatically rolled back; its evidence remains under the release root’s `failed-handover-evidence-20261111-attempt-1/` directory.
