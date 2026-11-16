# R03.3 Implementation Plan

## Architecture decisions
- Keep `/dev/mission-control-prototype` and `/dev/task-control-prototype` fixture-only and unchanged.
- Add a separate host-gated, authenticated LIVE route in the Modular SaaS shell.
- Source identity/workspace authority from the current Core session and `x-smartaihub-tenant-id`; Core revalidates membership on each request.
- Reuse existing `list_modular_chat_missions`, task-control projection, job status and events; add only a workspace-scoped list route wrapper around the existing Mission read model.
- Mission and job IDs remain canonical. Display Harness/Agent/Run identities only where a canonical projection supplies them. The currently unavailable identities remain unavailable.
- Tab, split, inspector, cursor, and return context are presentation state; none may invoke a mutation or grant access.
- Since no canonical Harness inventory/Chat-to-Harness execution association is exposed yet, deliver the safe runtime view and keep genuine Harness acceptance pending rather than manufacture data.

## Work order
1. Core API: authenticated workspace Mission list route and tests proving reauthorization/tenant scope/no mutation.
2. Shell: isolated LIVE route, workspace/Mission/job selectors, same R03.2 layout, read-only details/evidence/unavailable coverage, canonical Task deep links and context return; tests for separation and exact IDs.
3. Build and targeted tests both repos, run configured modular DEV release only if target/source controller confirms mapping; record actual runtime/browser evidence and update SPEC handoff with unresolved upstream Harness gap.

## Verification
- Core auth route tests: 401, membership denial, selected workspace, actual read model invoked with authenticated user/workspace; no POST/mutation.
- Shell component tests: live API calls only, never fixture imports; empty/unavailable state; exact selected Job/Attempt; query context restore and invalid IDs rejected; responsive view contract.
- Run platform shell/Core focused tests and builds; no repository-wide typecheck. Inspect deployment mapping and serving SHA before claiming deployed. Authenticated owner browser UAT is only PASS if actually exercised.
