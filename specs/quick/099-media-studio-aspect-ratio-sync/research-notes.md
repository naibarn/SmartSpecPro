# Research Notes

- Production task `d16ce5c9-418a-4a47-9316-9855ccaa0eb2` persisted and sent
  `aspect_ratio=16:9`; Kie.ai returned a 1672x941 image.
- The visible selector reads and writes `MediaStudio` tab state `aspectRatio`.
- Both initial and retry generation prefer hidden
  `dynamicFormValues.aspectRatio` when Advanced Mode is enabled.
- `DynamicSkillForm` seeds schema defaults before filtering `excludeFields`, so
  a hidden aspect field can retain a default such as `16:9`.
- Model fields with `syncWith=aspect_ratio` are populated from the computed
  final ratio, duplicating the stale value into `extraParams.aspect_ratio`.
- Existing tests cover Media Studio payload and model input synchronization;
  focused Vitest coverage can be added without browser or DB fixtures.
- No auth, tenant, schema, dependency, or external API contract changes are
  required.
