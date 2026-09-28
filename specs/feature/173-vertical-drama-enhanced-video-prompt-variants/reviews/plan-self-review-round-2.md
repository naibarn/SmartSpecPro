# Plan adversarial self-review — round 2

## Attack questions

- Could Enhanced overwrite Legacy through an existing whole-pack writer? The
  plan explicitly inventories those writers and requires preservation/stale
  marking tests.
- Could a preview be rendered accidentally? The plan binds rendering to the
  active projection and requires explicit Apply before preview rendering.
- Could the Agent spend credits or choose a provider? The adapter and readiness
  sections prohibit those tools and force locked routing.
- Could an image model be mislabeled as a video model? Three IDs, capability
  snapshots, and role badges are required.
- Could a late job change newer state? Task ID, input fingerprint, revision/CAS,
  and fresh-read terminal merge are required.
- Could disabling a flag make stored content unreadable? The rollout matrix
  requires operation-specific blocking while preserving readability.
- Could nine split sub-shots become partially active? Group fingerprint and
  atomic Apply rules block partial projection.

## Result

No unresolved MUST_FIX issue found. The main residual risk is environment-level:
the isolated Python runtime, browser session, live provider, and deployment
must be proven during implementation/rollout. They are explicitly recorded as
gates rather than silently assumed.
