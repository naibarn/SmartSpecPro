# Default Chat workspace and workspace switching — 2026-11-11

## Delivered

The Modular Chat route now provisions a personal default workspace on first authenticated visit when one is absent, then opens Chat in that workspace. The toolbar provides a workspace selector and a create action. A user-created workspace is selected immediately; an explicit selection is retained for that user's current browser session while the membership remains authorized. Personal workspace rows and memberships are environment-scoped in the shared canonical `smartspec` database and remain separate from canonical customer tenants.

Platform source `smartaihub-platform/main@d1e71fe8aa4b8019f08559a5e69a15a4f9228930` was built from an exact canonical source lease and deployed through `apps/web/scripts/modular_debian_dev_release.py` to `modular-debian-dev` / `https://aimarkethubs.com`.

- Release: `/home/dev/modular-development-releases/modular-debian-dev-d1e71fe8aa4b8019f08559a5e69a15a4f9228930-default-workspaces`.
- Release manifest records independent Core, Shell and Chat artifact digests and the exact source revision.
- Deployment controller returned `DEPLOYED_AND_VERIFIED` at `2026-11-11T05:10:07.682399Z`.
- Local Core, Chat and Shell health: 200; unauthenticated Chat session: 401; Chat manifest and entry: 200.
- Public Shell root/login, Chat health and Chat manifest: 200; unauthenticated Chat session: 401.
- Public Chat JS/CSS assets: 200. The shipped JS contains the default-provision and create-workspace routes and visible workspace action; the stylesheet contains the responsive toolbar/form rules.
- Legacy rollback `smartspec-dev-web.service:3100` remained healthy. Its rollback Tunnel config and the three previous systemd drop-ins are retained in the release's `rollback/` directory. `smartaihub.app` and production `smartsihub.com` were not changed.

Migrations `0420_modular_personal_workspaces.sql` and `0421_modular_default_workspace_serialization.sql` are applied to the development `smartspec` database. The registered migration runner reported success. A transaction-scoped smoke check verified that repeated default provisioning returns the same default, personal workspace creation/listing succeeds, the Modular auth role reaches workspace tables only through granted functions, wrong-environment access is rejected, direct table reads are denied, and the smoke transaction rolls back. No customer tenant or account membership was manually created.

## Ten focused gap-review passes

| Pass | Review lens and evidence | Result |
|---|---|---|
| 1 | First authenticated `/chat` visit with no default: Chat calls the Core default-workspace endpoint and refreshes the session before resolving capabilities. API/UI tests cover the provisioning flow. | PASS in code and focused tests; the account-specific browser visit is still for the user to exercise. |
| 2 | Duplicate and concurrent default provisioning: migration 0421 serializes the account/environment default path; the database smoke called the ensure function repeatedly and observed one stable default ID. | PASS. |
| 3 | Open and change workspace: the initial workspace resolves to the marked default; selector choices come from current authorized memberships; session preference is keyed by user and is discarded when no longer authorized. | PASS in API/UI tests. |
| 4 | Create workspace: server validates the name and signed-in account, limits personal workspaces to 20, and returns a typed membership; the UI selects the returned workspace and reloads capabilities for it. | PASS in Core route and Chat UI tests. |
| 5 | Authentication/session binding: endpoints derive the account from the host-bound, signed session cookie, check revocation and disabled state, and do not accept a user ID from the request body. | PASS in Core route tests and unauthenticated runtime boundary (401). |
| 6 | Host/origin and CSRF boundary: both workspace mutation routes require the verified request scope and same-origin request policy. The tested cross-origin mutation is rejected. | PASS in Core route tests. |
| 7 | Existing customer workspace safety: customer memberships continue to come from active canonical `tenant_users` records; personal defaults do not create customer tenants or infer membership from role, email, or hostname. | PASS in route/data-contract review; no customer membership was changed. |
| 8 | Database privilege and environment isolation: workspace tables are owned by the restricted workspace role; the Modular auth role has function execution rather than direct workspace-table access; environment ID is resolved from the target configuration. | PASS in catalog/grant smoke; production-scope request and direct table read were denied. |
| 9 | Responsive and accessible controls: the adaptive Astryx selector, labeled create form, disabled/loading state and live error copy are present; focused UI tests pass and the deployed CSS contains the responsive rules. | PASS for code, tests and shipped CSS; desktop/tablet/mobile visual browser UAT remains unverified. |
| 10 | Exact-source build, target, release and end-user flow: Core/Shell/Chat package builds and Wrangler dry-runs passed at the integrated SHA; controller verified target, service working directories, local/public health and rollback target. | PASS for release. Authenticated click-through is not available to this session; Chat message sending remains disabled until the scoped persistence and provider path is implemented/configured. |

## Remaining product gaps

- Workspace provisioning, creation and selection are deployed, but an authenticated browser click-through and visual desktop/tablet/mobile check have not been performed in this session. Refresh `/chat` in the existing signed-in browser to exercise the real account path.
- Chat message sending remains intentionally disabled: capabilities still report no configured model provider and no scoped conversation/message persistence adapter. This release makes the workspace usable and does not claim AI responses are available.
- `smartsihub.com` remains inactive. This release is only for the delegated development target `aimarkethubs.com`.
