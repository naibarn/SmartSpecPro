# Decision Log

- Depth: `standard` with two sections because the fix crosses reusable client
  state handling and the server request boundary.
- Canonical source: visible tab `aspectRatio` state.
- Hidden skill aspect fields are aliases and cannot override the canonical
  value.
- Excluded Dynamic Skill fields must not seed defaults.
- The server normalizes known duplicated aspect-ratio keys to the top-level
  value as a defense-in-depth measure.
- Veo storyboard ratio logic remains an explicit specialized resolver.

## Self-review

Rounds 1-3 found and addressed retry parity, excluded-field seeding, and
server-boundary conflict handling. Rounds 4-5 found no meaningful gaps.
