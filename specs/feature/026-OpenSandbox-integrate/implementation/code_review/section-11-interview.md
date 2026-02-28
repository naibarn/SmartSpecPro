# Section 11 Code Review Interview

## Triage

### Auto-fix (applying without asking)

1. **#7 Python test flakiness from .env file loading** - Add `_env_file=None` to all `OpenSandboxSettings()` instantiations in tests to prevent local .env from interfering.

2. **#4 Python DISPATCH_MODE no validation** - Add `@field_validator` to clamp to `"optional"` for unrecognized values.

### Let go (not applicable to this section's scope)

3. **#1 Dead code / no callers** - By design. Section 11 creates the module. Sections 07 and 08 wire it into production code (skillExecutor, routers). The plan explicitly states these are separate sections.

4. **#3 Duplicate shouldUseSandbox functions** - `shouldUseSandbox` in dispatchService.ts was created in section-05 as the initial simple check. `shouldUseSandboxForFeature` is the full version. Section-07/08 will migrate callers. Expected phased development.

5. **#5 No get_sandbox_settings()** - Section-03 scope, not section-11.

6. **#6 Python dispatcher tests** - Section-04 scope, not section-11. Config-level tests are correct for this section.

7. **#2/#8 isFeatureRequiredForSandbox not integrated into shouldUseSandboxForFeature** - The plan's decision tree for shouldUseSandboxForFeature has 5 explicit steps that don't include per-feature flag checking. The per-feature flags are consumed by the dispatcher (section-04/07) independently. However, I'll add the missing test mentioned in the plan.

8. **#9 Weak API key default** - Matches docker-compose.opensandbox.yml default. Dev-only value.

9. **#10 Test isolation** - Known Vitest pattern, low risk.

## Applied Fixes

- Added `_env_file=None` to all Python test OpenSandboxSettings instantiations
- Added `@field_validator` for OPENSANDBOX_DISPATCH_MODE in Python config
- Added missing "per-feature flag forces sandbox" test to TS test file
