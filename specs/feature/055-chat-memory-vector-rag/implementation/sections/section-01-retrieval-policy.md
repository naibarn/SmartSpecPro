# Retrieval Policy

The main rule for this feature is simple: the server should decide what context the model sees before the model answers.

- Use server-side retrieval only.
- Keep the chat page as a thin sender/streamer.
- Make retrieval adaptive rather than brute-force.
- Prioritize persona and rule memories before broader long-term memory.
- Use vector search when the query or feature flags justify it.
- Keep agency and skill-specific context builders separate unless a shared helper is proven safe.
