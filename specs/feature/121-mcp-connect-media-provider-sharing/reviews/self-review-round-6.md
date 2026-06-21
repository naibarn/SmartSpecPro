# Self Review Round 6: UI-Managed Configuration Alignment

## Review Focus

Reviewed the plan against the requirement that MCP Connect configuration must be managed through SmartSpecPro UI surfaces only, matching existing system options, with no MCP-specific env-file edits.

## Findings Fixed

1. Runtime config still referenced MCP-specific env-style keys.
   - Replaced the runtime config contract with a UI-managed configuration contract.
   - Removed required `MCP_CONNECT_*` config keys from the plan.
   - Clarified that provider setup, callback/redirect settings, timeout/retry values, schema TTLs, provider enablement, and tenant rollout flags are configured through UI.

2. Admin/ops ownership needed to match existing settings patterns.
   - Added Platform Admin ownership through existing Admin Settings/provider config surfaces.
   - Added Tenant Admin ownership through existing Tenant Settings/feature-flag UI.
   - Kept User ownership in Settings/Profile integrations.

3. Section 02 was still described as backend-only.
   - Added provider config service/router responsibilities.
   - Added AdminSettings/TenantSettings UI targets, UI/UX contract, states, evidence, and tests.
   - Added config UI tests to the TDD map and command matrix.

4. Spec wording still allowed environment-style redirect configuration.
   - Updated security/implementation notes so redirect allowlists and provider setup are UI-managed or derived from the canonical app URL setting.

## Verification

- `check-sections.py`: complete, 9/9 sections.
- `check-ui-contracts.py`: passed, 9 UI-affecting section files checked.
- MCP-specific env key scan: no required `MCP_CONNECT_*` config remains.
- Placeholder and open-item scan: clean after wording cleanup.

## Residual Risk

No blocking plan gaps remain. Implementation must choose the exact existing admin/provider settings surface that best matches local UI conventions before adding the MCP provider config panel.
