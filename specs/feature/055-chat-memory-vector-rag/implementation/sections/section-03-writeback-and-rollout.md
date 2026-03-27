# Writeback and Rollout

The writeback path should continue to learn from every turn without blocking the response.

- Keep archive, fact extraction, chunking, and summarization as post-response work.
- Keep feature flags available so the retrieval upgrade can roll out per tenant.
- Add tests for both the enabled and disabled paths.
- Verify that memory extraction still updates learned facts after chat completes.
- Roll out with observability around latency, retrieval hit rate, and fallback usage.
