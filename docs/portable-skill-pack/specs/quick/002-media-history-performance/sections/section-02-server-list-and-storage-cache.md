# Section 02 — server list and storage cache

- Parallelize independent `media.listTasks` source reads with `Promise.all`.
- Preserve tenant resolution, deferred shadow filtering, deduplication, sorting, totals, durability hydration, and artifact projection.
- Extend protected media private cache lifetime while preserving ETag, `Vary`, range support, and authorization.
- Add tests for concurrency contract and cache policy.
