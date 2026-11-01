<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/cloudflare exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-inventory-and-portability
section-02-worker-api-and-database
section-03-identity-auth-and-email
section-04-application-api-parity
section-05-queues-and-job-control
section-06-chat-agents-and-native-work
section-07-readiness-and-staging-acceptance
section-08-cutover-and-rollback
END_MANIFEST -->

# SPEC-311 implementation sections

Normative source: [spec.md](../spec.md). Requirement closure is recorded only through the canonical handoff writer; section completion is not runtime acceptance.

| Section | Prerequisites | Requirements |
|---|---|---|
| [01 Inventory, portability and resource proof](section-01-inventory-and-portability.md) | None; first development section | REQ-311-01, REQ-311-02, REQ-311-15, REQ-311-17 |
| [02 Worker API adapter and scoped database](section-02-worker-api-and-database.md) | section-01 | REQ-311-02, REQ-311-03, REQ-311-04, REQ-311-09 |
| [03 Identity, authentication, 2FA and email](section-03-identity-auth-and-email.md) | section-02 | REQ-311-04, REQ-311-05, REQ-311-06 |
| [04 Application APIs and browser feature parity](section-04-application-api-parity.md) | section-02, section-03 | REQ-311-07, REQ-311-09, REQ-311-15 |
| [05 Cloudflare Queues and durable job control](section-05-queues-and-job-control.md) | section-02 | REQ-311-10, REQ-311-11, REQ-311-12, REQ-311-13 |
| [06 Chat, agents and remaining execution dependencies](section-06-chat-agents-and-native-work.md) | section-03, section-04, section-05 | REQ-311-08, REQ-311-12, REQ-311-14 |
| [07 Readiness, observability and Staging acceptance](section-07-readiness-and-staging-acceptance.md) | section-03, section-04, section-05, section-06 | REQ-311-01, REQ-311-14, REQ-311-16, REQ-311-17, REQ-311-18, REQ-311-19 |
| [08 Controlled cutover and rollback](section-08-cutover-and-rollback.md) | section-07 | REQ-311-13, REQ-311-19, REQ-311-20 |
