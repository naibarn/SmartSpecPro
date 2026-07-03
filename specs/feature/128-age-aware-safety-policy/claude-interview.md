# Deep-Plan Interview Transcript: Age-Aware Safety Policy

Interview mode: inferred from existing user decisions and completed spec review.

No live follow-up questions were asked because the user requested the deep-plan be completed end-to-end and the feature spec already records the key product decisions. Remaining legal/product decisions are represented as launch gates or assumptions below.

## Confirmed Decisions From Prior User Input

1. The solution must be system-wide, not limited to Chat and Media Studio.
2. Human users must provide date of birth and country/region of residence.
3. If date of birth or country is missing, production enforcement should route human users to safety profile completion before normal product routes, with safe exemptions.
4. Unknown age is enforced as child-under-13 until profile completion.
5. Age is computed from current date minus DOB, not stored as a static age.
6. Age bands are `unknown`, `child`, `teen`, and `adult`.
7. Admins need central policy controls for features, menus, routes, topics, media categories, model families, and custom rules.
8. Chat must be filtered both before model execution and after model output.
9. Image/video/audio generation must preflight prompts before provider dispatch and before credit reservation/deduction.
10. Existing Private Vault PIN behavior must remain compatible.
11. A generalized Security PIN can temporarily unlock overridable protected surfaces.
12. PIN unlock is temporary and expires on logout/session end, day rollover, PIN/profile/policy/preset/tenant changes, or admin revocation.
13. Country-aware presets must support Thailand, United States, United Kingdom, EU/EEA country overrides, and strict unsupported-country fallback.
14. Current public policy is adult-only; age-tiered child/teen product access requires legal/product updates before launch.
15. Generated/shared content must be governed at viewer time, not only creation time.

## Planning Assumptions

1. V1 implementation will default all blocking tenant flags to `false` and start in observe/prompt-only modes.
2. V1 will support a no-migration prototype using `users.userPreferences.safetyProfile`, but production enforcement sections will include typed-column migration planning.
3. Legal preset data in the spec is seed data requiring legal approval before broad enforcement.
4. Child/teen service access remains disabled until Privacy/Terms/consent/support/retention changes are approved.
5. Admin/domain-admin policy management follows existing tenant RBAC patterns and normalized tenant id comparisons.
6. Media policy first protects Node user-facing media routes; Python endpoints must be internal-only or policy-envelope enforced.
7. Implementation will use existing test stacks: Vitest/TypeScript for web and pytest for Python.

## Non-Blocking Product Questions To Resolve Before Enabling Age-Tiered Minor Access

1. Which jurisdictions are approved for age-tiered minor access at launch?
2. What guardian consent verification provider/process will be used, if any?
3. Which support roles may resolve appeals and DOB/country correction reviews?
4. What age assurance level is required beyond self-declared DOB for high-risk surfaces?
5. Should adult PIN unlock be enabled for actual underage accounts, or only for adult users temporarily locked by unknown/profile state?

## Implementation Priority

Build foundation and observe-mode first:

1. Shared types, policy service, profile service, and audit helpers.
2. Safety profile completion and protected-surface token plumbing.
3. Chat and media preflight in observe mode.
4. Admin policy tooling, metrics, and tests.
5. Enforce sensitive surfaces only after no-credit-on-block and no-lockout gates pass.
