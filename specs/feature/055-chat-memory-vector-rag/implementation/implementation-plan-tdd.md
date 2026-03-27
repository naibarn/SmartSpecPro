# TDD Plan — Feature 055 Chat Memory Retrieval Upgrade

## First Tests to Add or Update

1. `buildChatContext` should include persona and rule memory before the rest of the prompt.
2. `buildChatContext` should use vector-enabled retrieval when the current message is relevant and the feature flag is on.
3. `buildChatContext` should fall back to the legacy path when vector retrieval is off or unavailable.
4. `processConversationMemory` should keep memory writeback running after a successful chat turn.
5. `ChatView` should still fetch server-built context once per send and stream normally afterward.

## Expected Failing Conditions

- Retrieval-first ordering is not yet enforced.
- Vector search is still bypassed in the main chat context path.
- The fallback path may still work, but the new retrieval policy will be missing.
- Tests around memory writeback may fail if archive or extraction ordering changes.

## Regression Checks

- Persona instructions still appear in the final prompt.
- Session summaries and recent turns still fit inside the token budget.
- Long-term memories still stay tenant-scoped and user-scoped.
- Streaming still returns the final assistant response without extra round trips.

## Mocking and Fixture Notes

- Mock Drizzle chains the same way the existing memory service tests do.
- Mock memory retrieval service calls rather than hitting the database for unit tests.
- Keep one integration-style test around the server context assembly path so prompt ordering stays stable.

