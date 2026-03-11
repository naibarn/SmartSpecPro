# TDD Plan

## Test Strategy

Start with merge-engine and authz tests before UI changes.

## Tests To Add First

1. Policy ownership/authz tests
   - `domain_admin` can update tenant browser policy for own tenant
   - `domain_admin` cannot update platform guardrails
   - `user` cannot update tenant policy

2. Effective policy merge tests
   - user domain subset is intersected with tenant domains
   - user mode cannot exceed tenant mode
   - workflow quotas cap user/session behavior
   - platform hard blocks always win

3. User profile validation tests
   - reject widening writes
   - reject preferred models outside allowlist
   - reject approval TTL above tenant or platform bound

4. UI visibility tests
   - platform controls only appear for `admin`
   - tenant policy controls appear for `domain_admin` and `admin`
   - user automation preferences appear for authenticated users only

## Expected Initial Failures

- no dedicated user browser policy profile exists yet
- current admin panel authz is too strict for tenant-owned controls
- no shared effective-policy resolver exists for user overlays

## Regression Checks

- legacy `tenant_automation` sync still works until migration completes
- browser runtime still denies actions when DB/Redis is unavailable
- release gates remain enforced even if tenant policy says enabled
