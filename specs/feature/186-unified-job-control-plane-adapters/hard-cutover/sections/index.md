<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-gateway-registry
section-02-outbox-runtime
section-03-generic-consumers
section-04-node-wave
section-05-python-wave
section-06-evidence-gates
END_MANIFEST -->

# Hard Cutover Sections

| Section | Scope | Depends on |
|---|---|---|
| 01 | Gateway, registry, server context | Existing Feature 186 foundation |
| 02 | Real outbox publisher runner | 01 |
| 03 | Generic BullMQ/Celery executor consumers | 01, 02 |
| 04 | Low-risk Node producer wave | 01, 02, 03 |
| 05 | Python/Celery bridge and low-risk wave | 01, 02, 03 |
| 06 | Inventory, manifest, rollout evidence | 04, 05 |
