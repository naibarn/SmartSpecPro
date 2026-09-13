# Section 01 — runtime and routing

- Add validated output-token ceiling to `AgentRuntimeConfig`.
- Pass `ModelSettings(max_tokens=...)` from `AgentFactory`.
- Thread provider model id and API style from the server provider candidate to
  the Python bridge.
- Explicitly select Responses or Chat Completions; reject unsupported styles.
- Preserve logical model identity for server readiness and credit metadata.

Completion: fake SDK inspection proves the request receives the configured
bounded output setting and provider-qualified model id.
