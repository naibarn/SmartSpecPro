# section-01-isc-native-bundle

## Scope

Implement the ISC native bundle path for `agents_python`, including creation, evaluation, and legacy migration support.

## What this section must cover

- Add `agents_python` as a supported target platform in ISC.
- Split ISC generation into platform-specific exporter modules instead of keeping all bundle logic in `creator.py`.
- Generate the native bundle surface:
  - `SKILL.md`
  - optional `skill.md` mirror during migration
  - `scripts/run.sh`
  - `scripts/verify.sh`
  - `references/input_contract.md`
  - `references/output_contract.md`
  - `references/maintenance.md`
  - `MODEL_COMPATIBILITY.md`
  - `skill.lock.json`
- Update evaluation so the native bundle is validated as a bundle, not just as a legacy entrypoint.
- Add migration from legacy skill layouts into the native bundle contract.
- Ensure `MODEL_COMPATIBILITY.md` captures the support tier policy described in the master plan.

## Plan constraints

- Keep the legacy target path available for older skill formats.
- Do not implement the Python runtime in this section.
- Do not change Node registry behavior in this section except where needed to support bundle metadata output shapes.

## Tests to write before implementation

- create emits every required native bundle file.
- frontmatter includes `target_platform: agents_python`.
- verify script and run script are present and executable.
- evaluate fails for missing required bundle files.
- evaluate fails when lock metadata and emitted bundle surface disagree.
- migrate-legacy creates a runnable native bundle from a representative legacy skill.

## Dependencies

This section must be completed before the runtime and Node integration sections because it defines the bundle contract they consume.
