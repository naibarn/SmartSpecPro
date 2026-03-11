## Goal

Create a server-side enabled-model resolver and apply it to primary router/service execution paths.

## Scope

- shared helper/service for enabled LLM resolution
- translation/chat/skills immediate execution paths

## Done When

- routes no longer hardcode `gpt-4o-mini`/`gpt-4o` as execution defaults
- explicit or persisted disabled IDs are normalized or rejected through the helper

