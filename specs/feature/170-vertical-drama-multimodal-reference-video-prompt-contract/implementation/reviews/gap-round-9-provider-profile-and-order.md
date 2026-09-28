# Post-implementation gap review 9 — provider profile and reference order

Date: 2026-08-31

Scope: Omni Flash 1.1, Seedance 2.0/2.5, MiniMax H3, declarative capability
profiles, future-version registration, and transport preservation of many
ordered references.

Findings and actions:

- MUST_FIX: the legacy image resolver could trim profile-backed mixed
  references before the provider adapter saw them. Video generation now opts
  into profile-governed preservation and leaves selection to the declarative
  adapter policy.
- NICE_TO_HAVE: a newly released provider version still needs a catalog profile
  and adapter mapping before enablement; no version-specific schema change is
  required.

Evidence: `verticalDramaVideoCapabilityProfile.test.ts` and
`mediaGenerationService.prompt.test.ts`.

Result: no open MUST_FIX findings for this boundary.
