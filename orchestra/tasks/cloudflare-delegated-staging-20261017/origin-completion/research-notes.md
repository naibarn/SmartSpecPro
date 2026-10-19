# Research notes — 2026-10-19

## Source and observed behavior

Canonical preflight returned BASELINE_READY in the registered task workspace at `1d1b51da7cf40ba213030b0884adc63f28b388fe`. Root main was clean/current but policy required the isolated task workspace. Discovery used bounded rg and file reads; no specialized repository index was available. Earlier live acceptance and private receipts remain in the parent HANDOFF; this research did not mutate provider or production configuration.

| Surface | Observed implementation | Consequence |
| --- | --- | --- |
| `apps/cloudflare/src/authOriginProxy.ts` | HTTPS origin and exact host required; one app attestation secret; strips/rebuilds forwarded headers; manual redirects; 15-second response-header timeout | Existing useful transport; no Access service-token support or trusted public-host allowlist yet. Plain fetch to a hostname does not itself prove network privacy. |
| `apps/web/server/_core/index.ts` | trust proxy=1; rejects an invalid token only when the attestation header is present | Missing-token rejection must be scoped to the protected origin ingress; requiring it globally would break existing public production traffic. Verify the actual cloudflared/proxy chain rather than changing trust proxy globally. |
| `apps/web/server/_core/tenant.ts` | resolves req.hostname using primaryDomain/domains; unknown host 404; loopback can select first active tenant | Staging public hostname must map explicitly through existing tenant authority. Never make private/loopback host select an arbitrary tenant for edge traffic. |
| `apps/web/server/_core/cookies.ts` | takes the final two hostname labels | Actual helper returned Domain=.workers.dev for the live staging hostname. Browser rejects it. Host-only Worker fix is independently implemented; custom-domain staging isolation needs an explicit host-specific policy. |
| `apps/web/client/src/pages/Login.tsx` | web POST `/trpc/auth.login`, credentials=include | Test this actual endpoint, not a fictional successful `/api/auth/login` flow. |
| `apps/web/client/src/_core/hooks/useAuth.ts` | `auth.me` and `auth.logout` tRPC procedures | `/api/auth/session` is only a missing-proxy probe; no matching success handler was established. |
| `apps/web/server/routers.ts` | canonical session cookie, revocation on logout, pending 2FA, password validation | Preserve real auth/2FA/revocation; do not inject a synthetic cookie from JWT secrets for acceptance. |
| `python-backend/app/core/oauth_config.py` | global encrypted OAuth settings, default production callback URLs | A staging callback edit must not overwrite shared production settings. Use an environment-scoped approved callback/client configuration. Audit Python OAuth state handling as part of that path. |
| `apps/web/server/_core/oauthProxy.ts` | forwards the existing Google/GitHub authorization/callback routes to Python | Verify the full Worker → Express → Python path and existing SPA callback paths. The generic Worker proxy test labels are not an inventory of deployed auth routes. |
| `cloudflareStagingApiTransport.ts::uploadVersion` | emits only ASSETS, disabled activation, staging environment | Manual secret edits are not a durable deployment solution. Compose approved origin bindings on every version, with rollback provenance. Do not silently broaden artifact-only grants. |
| `cloudflareCredentialCenter.ts` | encrypted system_settings for API profiles; scoped provider_deployment_credentials for deployment token | Reuse settings encryption and callback resolution, but keep origin/Access secrets separate from the API token and R2 S3 credentials. |
| `providerDeploymentTargets` | tenant/project/environment/account/worker authority, runtimePolicy reference available | A versioned scoped origin descriptor can be referenced without a new registry or mandatory schema migration. runtimePolicy is a 160-character reference, not a JSON secret container. |
| `apps/cloudflare/src/apiRouteManifest.ts` | HTTP proxy inventory; WebSocket paths remain native-only | Login alone cannot certify full feature parity. Explicitly qualify streaming and WebSocket paths before broad production routing. |
| Worker `/readyz` | full runtime bindings, activation and job-handler readiness | It must remain false for disabled-activation HTTP staging; add a scoped application-origin diagnostic instead of setting activation=true to make a probe green. |

## Primary sources consulted

- [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/): Service Auth policy and Client ID/Secret headers; keep bearer Authorization for application users. Inspect strict-service-token behavior without changing organization-wide settings blindly. New secrets and legacy secrets have different valid formats; do not hardcode a single hex format.
- [Tunnel origin parameters](https://developers.cloudflare.com/tunnel/reference/origin-parameters/): cloudflared can validate the Access JWT with required/teamName/audTag before forwarding. Apply this to the dedicated ingress, preserving other hostname entries.
- [Workers VPC services](https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/): private service fetch through Tunnel; current documentation labels it beta and requires Connectivity Directory roles. Availability in this actual account and repository runtime is unverified.
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/): secret bindings stay out of client builds; direct secret put/delete can deploy immediately. Use version-aware upload within the existing executor, not an unrecorded CLI side effect.
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/): version includes code/assets/bindings/configuration; connected storage state is separate.
- [Rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/): versions do not restore external resources; preserve required bindings/resources and origin compatibility through rollback.
- [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [Public Suffix List](https://publicsuffix.org/list/public_suffix_list.dat): public-suffix Domain cookies are rejected; workers.dev is listed. Host-only is the appropriate scoped repair.

## Independently completed proof

Actual cookie helper before repair returned `.workers.dev`. New tests reproduced two failures. After repair, 12 cookie tests passed, preserving production behavior. Installed Chromium with entirely intercepted responses rejected the old Domain cookie, accepted the repaired Secure/HttpOnly host-only cookie and sent no cookie to a sibling Worker. No network request or live authentication occurred. Receipt: parent HANDOFF, private `cookie-browser-proof.json`.


## Fresh provider authority observation — 2026-10-19 19:39 Asia/Bangkok

Read-only probes used the existing target-scoped deployment credential inside its existing callback; no values were printed. Access application list, service-token list and Tunnel list returned HTTP200 with zero visible entries; exact zone lookup returned HTTP200 with one entry. This does NOT establish effective write scope or resource absence. Local production/development connector credential metadata both match the configured Cloudflare account, but GET for each exact existing Tunnel returned HTTP401/code1001. Investigate exact resource IAM before proposing reuse or mutation. Do not conclude that the account has no Tunnel, automatically replace the credential, or create duplicate connectors from list results. Installed cloudflared reports 2026.1.2. Private receipt: origin-readiness-probe.json; providerMutations=0.


## Root cause correction — 2026-10-19 20:28 Asia/Bangkok

The preceding 401/403 observations used the Deployment profile only. The saved Audit account-owned token reads exact existing Tunnels and root DNS successfully. /user/tokens/verify rejects that account token with 401; the documented /accounts/{account_id}/tokens/verify verifies it. The old helper wrongly rejected a usable credential before catalog probes. Corrected live probes verify the Audit token, list 3 Tunnels and read DNS, and the applicable account-only permission catalog is complete with 413 groups. Do not widen/replace credentials based on the previous incomplete diagnosis. Relevant write groups are visible in the Audit token's actual account metadata; no provider writes or origin execution authority are claimed. The existing typed staging grant still needs explicit origin configuration/resource scope.
