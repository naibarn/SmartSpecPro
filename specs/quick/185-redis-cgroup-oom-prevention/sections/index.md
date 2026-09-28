<!-- PROJECT_CONFIG
runtime: bash-yaml-docker
test_command: bash -n scripts/system-crash-monitor.sh scripts/redis-memory-preflight.sh && docker compose -f docker-compose.infra.yml config
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-resource-policy
section-02-monitor-preflight-runbook
END_MANIFEST -->

# Sections

- `section-01-resource-policy.md`: Redis Compose budget and host sysctl policy.
- `section-02-monitor-preflight-runbook.md`: attribution, preflight, operations,
  and verification.
