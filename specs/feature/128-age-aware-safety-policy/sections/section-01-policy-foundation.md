# section-01-policy-foundation

## Goal

Create the shared age-safety policy foundation used by every later section. This section must not depend on database state, UI state, or provider-specific code. It defines the canonical vocabulary, default jurisdiction presets, decision contracts, and pure policy evaluation helpers.

## Depends On

- None.

## Files In Scope

- `apps/web/shared/ageSafetyPolicy.ts` or equivalent shared module.
- `apps/web/shared/__tests__/ageSafetyPolicy.test.ts`.
- Optional server-only preset seed helper under `apps/web/server/services/` if existing patterns prefer server placement for tenant defaults.

## Test First

Add unit tests before implementation for:

- Age calculation from date of birth and an injected evaluation date, including birthday boundary cases and leap-day users.
- Profile status classification: `unknown`, `child`, `teen`, `adult`.
- Unknown or incomplete profile defaults to child-under-13 behavior.
- Country/jurisdiction preset resolution for Thailand, United States, EU/EEA, United Kingdom if included by preset, and global fallback.
- Policy decisions for menu/action access, chat input, chat output, media prompt, media output, private/protected surface, generated asset view, generated asset download, generated asset share, and generated asset reuse.
- Deterministic reason codes and audit-safe metadata for allow, block, require profile, require PIN, require review, and allow with transformations.

## Implementation Requirements

- Use explicit enums/string unions for:
  - `AgeBand`: `unknown | child | teen | adult`.
  - `SafetyActorKind`: authenticated user, public API key, widget visitor, delegated worker, system job, admin, domain admin.
  - `SafetySurface`: chat, media image, media video, media audio, private chat, generated asset library, public share, admin policy, settings safety, API/MCP/widget.
  - `SafetyAction`: read, create, submit prompt, receive output, download, share, remix/reference, configure policy, unlock protected surface.
  - `SafetyDecisionEffect`: allow, block, require profile, require PIN, require review, transform.
- The evaluator must accept an explicit `now` date/time argument. Do not read current time inside pure helpers.
- Keep legal presets data-driven. Do not hard-code page-specific checks into chat/media code.
- Include preset metadata: country/region code, default minor thresholds, consent threshold if relevant, adult threshold, source label, effective date, and notes.
- Keep the presets conservative and configurable. The implementation must allow admin overrides through later sections.
- Avoid storing or exposing sensitive DOB details in policy decisions. Decision output should include age band and policy version, not full birth date.

## Integration Notes

- Later service sections should import this shared module rather than redefining age bands or decision shapes.
- Provider-specific moderation categories should map into this policy vocabulary, not the other way around.
- The section should remain executable in Node/browser test environments.

## Verification

- `cd apps/web && pnpm test -- ageSafetyPolicy`
- `cd apps/web && pnpm check`

## Handoff

Later sections can depend on these exports:

- `calculateAgeOnDate`
- `classifyAgeBand`
- `resolveJurisdictionPreset`
- `evaluateAgeSafetyPolicy`
- shared decision, policy, preset, actor, surface, and action types.
