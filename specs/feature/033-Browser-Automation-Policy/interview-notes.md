# Interview Notes

## Q1. Notification transport for approvals

**Question:** Do you want Feature 033 to ship the commit-phase approval path with SSE immediately, or is polling acceptable for the first production cut?

**Answer:** Polling is acceptable for the first production cut. Do not block Feature 033 on SSE.

## Q2. Scope of enforcement across browser execution surfaces

**Question:** Should policy be always-on for both execution surfaces from day 1: the raw browser tool and Automation Copilot / Playwright executor? The current codebase treats these as separate paths, and the raw Python endpoint is not wired through `BrowserSessionFactory`.

**Answer:** Policy should be always-on for every production browser execution surface, but the system must not ship two separate enforcement implementations. Automation Copilot / Playwright executor must enforce from day 1. The raw browser tool must not remain as an unenforced bypass path; it must either be routed through the same policy path before launch or remain disabled for tenant production use / internal-only until it is wired.

## Q3. Tenant policy storage model

**Question:** Should browser-policy configuration live in a new dedicated tenant-scoped browser policy table, the existing `workflow_policy_rules` table plus browser-specific extensions, or another arrangement?

**Answer:** Use a new dedicated tenant-scoped browser policy table. Do not extend `workflow_policy_rules` for this. Preferred shape:

- `tenant_browser_policy_config` for top-level config and defaults
- `tenant_browser_policy_rules` or `tenant_browser_policy_overrides` for rule rows, allowlists, thresholds, and enforcement mode

## Q4. Approval model and UI

**Question:** Do you want to reuse the existing approval request flow and UI with browser-specific payload fields, or create a distinct browser approval model/UI from the start?

**Answer:** Reuse the existing approval request flow and UI for v1, with browser-specific payload fields.

## Q5. Raw browser tool launch policy

**Question:** For v1, should the plan keep the raw browser tool production-disabled until it shares the same enforcement path as Copilot, or make raw browser tool integration part of the initial implementation scope?

**Answer:** Keep the raw browser tool production-disabled until it shares the same enforcement path as Copilot.

## Q6. Policy evidence retention

**Question:** What evidence is allowed to be stored in browser policy and approval records?

**Answer:** Allow structured minimal evidence only. Do not store raw DOM snippets or full screenshots by default.

## Q7. Admin surface for v1

**Question:** Should tenant admins get CRUD UI for browser policy config and rules in the first release, or is API/backend plus seeded defaults enough for the first production cut?

**Answer:** API/backend plus seeded defaults is enough for v1. No tenant CRUD UI is required at launch.

## Q8. Approval invalidation strictness

**Question:** When a pending approval exists, should it be invalidated only on major context change as in the draft spec, or on any navigation, frame, or popup change for v1?

**Answer:** For v1, invalidate on any navigation, frame, or popup context change.
