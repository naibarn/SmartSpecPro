# Output Contract — Vertical Drama Preset Synthesizer

Every output must validate against the contract requested by the caller before
being returned to the Create Series Wizard. `schemas/output.schema.json` is the
legacy v1 contract; Mix and Match v2 uses the runtime v2 schema and must never
be silently downgraded to v1.

Required top-level fields: title, category, logline, mainPlot, seasonArc, tone, cliffhangerStyle, creatorSummary, characters, visualBible, mixRecipe, warnings, contract_version.

`creatorSummary` is the creator-facing pre-acceptance synopsis. It must contain `whatItIsAbout`, `protagonistAndGoal`, `conflictAndDiscovery`, `centralMystery`, and 1-4 `decisionNotes`. These fields are natural-language prose and must not expose synthesis metadata.

Every character must also include `narrativeRole`, `roleTier`, and `occupation`; story function is required and must not be inferred from occupation alone.

For `contract_version: 2`, the output keeps every field above and adds
`blendFacets`, which must contain the exact requested facets and concrete
`{presetId, element, kept}` contributions for the assigned presets. A v2
`visualIdentity` object is returned only when visual-identity context is
supplied by the request.

The output is a draft only. It is not persisted as a global or private preset unless another workflow explicitly saves it later.
