# Focused test plan

1. Render 12 distinct authorized job fixtures; assert active job tabs are navigable, stable IDs are used, and most-recently-observed order is correct.
2. Change selected job; assert detail and durable output query scope use only that job. Output from one session never renders in another tab.
3. Reload with `jobId` in URL; assert exact job selection. Hiding a tab changes no mutation API state.
4. Runner snapshot fixtures distinguish discovered, stale, online, trusted, and dispatch-ready counts; ensure inventory visibility is not mislabeled as ready.
5. New task action routes to existing Task Control with selected conversation/thread context; no new scheduler or job mutation occurs from the read-only console.
6. Empty, loading, unavailable, and small viewport states have useful actions and accessible labels.
