# Feature 198 Interview

## Decisions

- Feature 198 owns the `/chat` and Universal Assistant control surfaces.
- It composes 195 Job, 196 plan/capability and 197 Runner contracts rather than replacing them.
- UI must show truthful loading, approval, progress, disconnect, failure and artifact states.
- Existing help/RAG/MCP/runtime patterns are reused; learning cannot override hard policy or explicit user pins.
- UI plans must include accessibility, responsive behavior, localization and browser evidence.

