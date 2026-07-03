# Self Review Round 3: Acceptance Criteria Coverage Tightening

Review date: 2026-07-01

## Result

Pass after targeted additions. The plan now explicitly covers the remaining acceptance-criteria details that were previously present in the spec but under-specified in implementation sections.

## Review Method

- Re-read all 65 acceptance criteria from `spec.md`.
- Compared acceptance criteria against `claude-plan.md`, `claude-plan-tdd.md`, and all section files.
- Used SocratiCode to confirm current tenant-isolation and domain-admin patterns before adding tenant-normalization requirements.
- Re-ran `check-sections.py` after edits.

## Gaps Found And Fixed

- Added canonical tenant normalization requirements before policy lookup, token validation, audit writes, and domain-admin policy updates.
- Added explicit registered-domain/primary-domain ownership checks for domain admins and warned against trusting Host-header tenant context alone.
- Added structured `country_profile_invalid` responses for non-browser/API/MCP/worker clients.
- Added profile/menu/unlock/policy cache and projection invalidation after DOB, country, tenant, policy, preset, enforcement-mode, and unlock-expiry changes.
- Added rule that declared residence country is separate from locale, IP geolocation, timezone, and billing country; those values are redacted risk signals only unless separately reviewed.
- Added explicit reachability for Settings/Security, profile completion, support/account recovery, admin safety recovery, and emergency kill-switch routes during profile-completion enforcement.
- Added privacy redaction coverage for error telemetry, session replay, feature flag payloads, provider payloads, and general admin/reporting list views.

## Verification

Command:

```bash
uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir "specs/feature/128-age-aware-safety-policy"
```

Result: complete, 12/12, no manifest warnings.

## Residual Notes

No implementation blocker remains in the plan. The only remaining gates are intentional legal/product launch gates for age-tiered minor access, guardian/minor consent, and jurisdiction-specific production activation.
