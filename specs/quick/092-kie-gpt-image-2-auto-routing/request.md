# Request

Unify the two Kie.ai GPT Image 2 media-model choices into one user-visible model.
Automatically send `gpt-image-2-image-to-image` when reference images are attached
and `gpt-image-2-text-to-image` otherwise.

Constraints:

- preserve saved model selections and aliases;
- do not alter other media models;
- keep the current credit price and Kie createTask transport;
- implement with focused tests and an additive Drizzle migration.

Approved design:
`docs/portable-skill-pack/specs/2026-07-20-kie-gpt-image-2-auto-routing-design.md`
