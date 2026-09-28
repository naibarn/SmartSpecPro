# Request

Fix the production `verticalDramaCharacters.previewCharacterPrompt` failure where an LLM
response is rejected because `comparison_evidence` disagrees with deterministic values
derived by the server.

Use approved Approach A from
`docs/portable-skill-pack/specs/2026-07-13-character-visual-bible-authoritative-evidence-design.md`:
normalize only server-observable evidence before nested DNA validation, conservatively
downgrade unsupported `pass` status to `provisional`, and preserve every creative,
identity, and candidate-count validation.

Non-goals: UI changes, database migrations, provider changes, schema relaxation, or
automatic repair of creative Character DNA fields.
