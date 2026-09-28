# Implementation Plan

## Objective

Make the visible Media Studio aspect-ratio selector authoritative throughout
state synchronization, first generation, retry, and gateway submission.

## Approach

1. Add a pure Media Studio aspect-ratio resolver that uses canonical tab state
   for normal image/video generation and delegates only the existing Veo
   storyboard case to its specialized resolver.
2. Replace duplicated first-generation and retry precedence expressions with
   that resolver.
3. Prevent `DynamicSkillForm` from seeding defaults for fields listed in
   `excludeFields`; excluded fields are parent-owned by contract.
4. Synchronize existing hidden `aspectRatio`/`aspect_ratio` aliases from the
   canonical value without manufacturing unrelated skill fields.
5. Normalize conflicting model-specific aspect ratio aliases at the server
   boundary before dispatching the request.

## Risks and Mitigations

- Veo constraints: retain existing specialized path and regression tests.
- Skill schemas relying on excluded defaults: exclusion already means the
  parent owns the control, so skipping their defaults matches rendered UX.
- Retry drift: use the same pure resolver for both paths.
- Server over-normalization: limit normalization to model fields explicitly
  synced with aspect ratio and common aspect-ratio aliases.

## Acceptance Criteria

- Visible `9:16` plus hidden `16:9` produces `9:16` at all request locations.
- Initial and retry generation behave identically.
- Excluded skill aspect fields are not seeded from schema defaults.
- Non-excluded defaults continue to seed.
- Veo storyboard behavior remains unchanged.
- Focused Vitest tests and relevant TypeScript checks pass.
