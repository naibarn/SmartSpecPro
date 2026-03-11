# Section 05 - Template Seeding And Scope Resolution

## Objective

Ship the three experiences as built-in platform templates that tenants clone into editable drafts, and implement mixed retrieval scope resolution that starts from template defaults but remains bounded by tenant permissions.

## Prerequisites

- Section 01 complete.

## Scope

- Seed built-in templates for Deep Research, Storyboard Planner, and Deck Builder.
- Support clone-to-draft without mutating the platform canonical template.
- Define template-level default scope behavior for research.
- Resolve per-run user overrides within tenant permissions.

## Primary files and areas

- `apps/web/server/routers/agency.ts`
- Template persistence/schema areas already used by agency templates
- Any seeding logic for platform-owned templates
- Retrieval-scope resolution logic in agency run request handling or supporting services

## Required implementation work

### 1. Seed platform-owned templates

Add canonical templates for:

- Deep Research
- Storyboard Planner
- Deck Builder

Each template should define:

- curated instructions
- curated tool surface
- default result intent expectations
- default retrieval scope rules where applicable

### 2. Preserve clone-to-draft behavior

Tenants should clone built-in templates into editable drafts. Platform templates remain canonical and should not be edited in place by tenant actions.

### 3. Resolve mixed retrieval scope

For research-capable templates, resolve scope in this order:

1. template default
2. user override
3. permission filter

Persist the resolved scope in immutable run metadata for auditability.

## Tests to write first

- Node test: built-in templates are discoverable as active templates.
- Node test: cloning a built-in template creates an editable tenant draft.
- Node test: cloning does not mutate the platform canonical template.
- Node test: template default retrieval scope applies when the user provides no override.
- Node test: user overrides cannot exceed readable tenant scope.
- Node test: resolved scope is stored in run metadata.

## Risks and safeguards

- Product rigidity risk if templates are immutable everywhere. Keep only platform copies fixed; tenant drafts remain editable.
- Permission escalation risk if user overrides bypass ACL filtering. Always apply permission filtering last.
- Template drift risk if seed data is not versioned or identifiable. Keep platform template identity explicit.

## Exit criteria

- Three built-in platform templates exist and clone to tenant drafts.
- Mixed retrieval scope resolution is implemented and audited.
- Tenant permissions remain the hard boundary on run scope.

## Implementation notes

- Added `apps/web/server/services/agencyExperienceTemplateService.ts` to seed the three platform-owned templates: Deep Research, Storyboard Planner, and Deck Builder.
- `agency.listTemplates` and `agency.createFromTemplate` now call the seeding helper so the built-in templates are available without a separate manual seed step.
- `agency.createFromTemplate` now clones each template agent’s `defaultTools` into `agency_agent_tools`, preserving the curated tool surface when a tenant creates an editable draft.
- Added lightweight retrieval-scope resolution for built-in experience drafts by deriving the originating experience from the cloned agency slug and resolving a run-scoped mode (`tenant_accessible`, `library_only`, or `web_fallback`) plus tenant/user audit metadata.
- `agency.sendMessage` now propagates the resolved retrieval scope to Python, and the Python agency service persists it in `agency_runs.metadata` while appending a scoped runtime instruction to the agency system prompt for that run.
- The scope path stays additive: existing non-template agencies continue to run unchanged, and template-derived scope resolution only activates when the agency slug matches one of the built-in experiences.

## Tests added and updated

- `apps/web/server/services/agencyExperienceTemplateService.test.ts`
- `apps/web/server/routers/__tests__/agency.test.ts`

## Known follow-ups

- Retrieval-scope identity currently derives from the cloned agency slug; if a tenant later renames the slug, the built-in experience defaults no longer apply automatically.
- Scope enforcement in Phase 1 is audit-first plus prompt-level guidance; deeper tool-config or collection-level enforcement can remain an additive hardening step if product requirements demand stricter runtime guarantees.
