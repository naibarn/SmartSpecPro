<!-- PROJECT_CONFIG
runtime: node-npm
test_command: npm test --workspace @smartspec/web --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-durable-acceptance
section-02-initialization-worker
section-03-client-recovery-and-integration
END_MANIFEST -->

# Section Index

1. `section-01-durable-acceptance.md` — split API acceptance from LLM
   initialization and persist the job atomically.
2. `section-02-initialization-worker.md` — safely claim, heartbeat, initialize,
   retry, and fail durable jobs.
3. `section-03-client-recovery-and-integration.md` — keep polling ambiguous
   starts and run cross-flow regression checks.
