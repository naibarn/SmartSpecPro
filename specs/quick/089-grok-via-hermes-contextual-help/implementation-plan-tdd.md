# TDD Plan

## Red

- Add help content service expectations for all four slugs in English and Thai.
- Add component expectations for each contextual `HelpButton` topic and page.
- Assert the legacy `hermes-workers` topic remains distinct.

## Green

- Add bilingual Markdown help files.
- Wire the existing `HelpButton` into each target surface.
- Localize visible button labels with the page's existing locale source.

## Refactor and proof

- Remove duplicated labels only where an existing local copy object naturally
  owns them.
- Run the focused Vitest suite.
- Review topic frontmatter, internal links, UI states, and scoped diff.

