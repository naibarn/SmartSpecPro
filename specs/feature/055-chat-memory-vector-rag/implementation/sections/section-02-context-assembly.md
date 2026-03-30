# Context Assembly

The target assembly order is:

- Persona and system guidance
- User rules and durable preferences
- Relevant summaries and recent session context
- Long-term memories and vector RAG results
- The current user message

Implementation notes:

- Preserve existing token budgets so the buffer does not collapse.
- Keep deduplication and ranking on the server.
- Do not add a second vector retrieval step in the frontend.
- Preserve the current streaming contract from `ChatView`.
