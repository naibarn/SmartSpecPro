# Section 03: UI And Migration Sequencing

## Goal

Move from the temporary browser-policy bridge in `AdminSettings` to a complete UI model aligned with ownership.

## Scope

- platform admin UI
- tenant admin UI
- user settings UI
- migration sequencing from legacy/bridge state

## Implementation Steps

1. Keep the current `AdminSettings` panel as a temporary compatibility surface
2. Add a tenant-scoped "Automation Policy" page for `domain_admin` and `admin`
3. Move tenant-owned settings there:
   - feature toggles
   - tenant baseline config
   - rules
   - workflow entitlements
   - user-customization policy
4. Add a user-facing "Automation Preferences" panel in `Settings.tsx`
5. Show effective-policy summaries and why an action is restricted
6. Deprecate tenant editing from the global admin page after parity and migration

## Constraints

- do not strand existing tenants on the legacy `tenant_automation` keys
- preserve backward-compatible reads during migration
- avoid duplicate edit surfaces once tenant UI parity exists

## Done When

- platform, tenant, and user settings each have an appropriate UI home
- current admin bridge remains backward-compatible during migration
- future users understand both editable preferences and non-editable inherited restrictions
