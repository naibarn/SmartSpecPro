# Cloudflare Admin Center — Design and implementation plan

## Objective

Provide one Admin → Infrastructure → Cloudflare page that inventories the Cloudflare credentials SmartSpecPro already uses, explains permission sets, tests read access without changing Cloudflare resources, and points each credential to its real configuration owner. Synchronize settings that already have a canonical home instead of copying secrets into a second setting.

## Credential sources and ownership

- Vectorize API token and Account ID remain in `system_settings(category='vectordb')`; the center reads their configured state and updates the Account ID through the same legacy key so Vectorize and Cloudflare views stay aligned.
- New Cloudflare API credentials are separate purpose-scoped entries stored encrypted in `system_settings(category='infrastructure', key='cloudflare_api_credentials_v1')`. The UI never returns a saved token.
- R2's existing S3-compatible Access Key ID and Secret Access Key remain in `storage_settings`. The center embeds the existing Storage Settings editor and displays only provider/bucket labels and credential presence; it does not migrate or duplicate credentials.
- Worker-to-app runtime/search-cache bearer secrets remain deployment-owned environment/secret-manager values. Show configured/source status and exact names; do not copy them into the API-token vault.
- Deployment automation secrets are documented with their destination (CI/deployment secret manager). A read-only permission probe cannot prove write scopes and the UI will say so explicitly.

## Purpose profiles

1. **Vectorize (existing)** — continue to serve existing Vectorize calls; do not broaden or duplicate this token.
2. **Infrastructure audit (read-only)** — inspect account/zone Workers, KV, Queues, Workflows, Hyperdrive, Tunnels, Vectorize, DNS and Load Balancing resources used by this repo and Spec 245. UI probes report granted, missing-scope (403), unauthenticated (401), or resource-not-found (404) per service.
3. **Deployment (CI-owned)** — deployment system owns this write-capable token. The UI lists the recommended Workers Scripts/Routes, KV, Queue/Workflow, Hyperdrive, DNS and Load Balancing write scopes by target operation; it does not deploy or mutate resources.
4. **R2 S3 storage (existing, separate)** — retain its current bucket-scoped credentials and existing Storage Settings connection test.

This catalog covers Cloudflare services found in the current runtime and Spec 245 target; it does not claim to inventory every product in a Cloudflare account.

## UI and API changes

- Add an Admin-only credential center within the existing Cloudflare tab.
- Display credential count, purpose, source, configured state, last probe, and sanitized per-service results; never show token values, token prefixes, response bodies, or account secrets.
- Allow Admin to set/replace/remove the audit and deployment-profile tokens and update the shared Account ID. Deployment credentials still require the same value at the actual CI destination. No token read-back or clipboard endpoint.
- Save credentials with the existing AES-GCM setting encryption helper. Restrict probes to fixed HTTPS Cloudflare API GET endpoints, bounded timeout, bounded response parsing, and only status/code output.
- Show a permission guide grouped by Cloudflare Account vs Zone scope. Clearly mark read probes vs write permissions that are required by deployment but not verified by read-only probes.
- Fetch both Cloudflare permission catalogs on demand: `GET /accounts/{account_id}/tokens/permission_groups` and `GET /user/tokens/permission_groups`. Show account and user scopes independently; these endpoints require Account API Tokens Read/Write and API Tokens Read/Write respectively. Persist only a complete, non-secret combined catalog so a failed refresh is visibly stale. Catalog access does not prove the caller holds each permission it lists.
- Classify HTTP 400 as an unsupported/invalid request and 429 as rate-limited. Mark a catalog incomplete if a page fails or the bounded page limit is reached; never cache incomplete results as current.
- Test every declared account and zone probe with GET-only regression tests. Container and Worker App execution readiness is checked through runtime bindings, not an invented account REST endpoint. Deployment write permission remains unverified by read-only probes.
- Show and edit R2 settings in place through the existing `storage_settings` router; don't migrate credentials. Keep legacy `?tab=storage` links working by redirecting to Admin → Infrastructure → Cloudflare.

## Acceptance criteria

- Admin can configure and probe the infrastructure-audit and deployment-profile tokens; non-admin callers are denied by the existing admin-only tRPC boundary.
- The saved token is encrypted at rest and absent from all query/mutation responses and sanitized errors.
- Vectorize Account ID/token and R2/runtime settings show their existing source and state without secret duplication.
- Updating the shared Account ID updates the existing Vectorize setting. Updating the old Vectorize token is reflected by the center without copying it.
- The permission guide includes all Cloudflare resources used by this codebase/Spec 245 and names the least-privilege read/write scope separately.
- Probe performs GET requests only and reports 403 distinctly from 401, 404, and network/API errors.
- The live permission-group list reports current group IDs/names/categories/scopes/selectability, pagination completeness, last successful time, and stale fallback state. Selectability is not represented as a permission already granted to the token.
- A focused regression suite covers all declared account/zone probe endpoints, permission-catalog pagination, malformed/partial responses, and HTTP status classification.
- Existing Cloudflare runtime activation and deployment behavior are unchanged.

## Verification notes

Implementation follows the established system-settings encryption and Admin tRPC patterns. Per repository instructions, automated tests and TypeScript typecheck are not run unless explicitly requested; review the focused diff and `git diff --check` instead.
