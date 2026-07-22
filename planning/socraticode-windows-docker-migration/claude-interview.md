# Stakeholder Decisions

## Conversation-derived decisions

The user requested:

1. Keep SocratiCode stopped on the server because recurring memory exhaustion
   had forced daily reboots.
2. Move SocratiCode usage to Docker Desktop on the currently used Windows
   client.
3. Create the complete migration plan as files before any migration action.
4. Make the plan self-contained so Codex on Windows can connect over SSH, read
   it, and execute the migration later.

## Non-blocking technical values

The following values are intentionally not requested during planning because
the Windows executor can discover them safely:

- Windows hostname and username;
- WSL distribution and Linux username;
- RAM, CPU, swap, and free disk;
- Docker Desktop and WSL versions;
- SSH alias, server address, and verified host-key fingerprint;
- final Windows staging and WSL repository paths.

They must be written into the evidence manifest during execution and must not be
hard-coded in this plan.

## Planning decisions

- This turn is planning-only. No transfer, installation, service start, MCP
  configuration change, or volume mutation is authorized.
- The server remains the source of inventory evidence, not the future
  SocratiCode runtime.
- The primary migration path is a clean repository clone plus fresh local
  reindex because the index is rebuildable and project paths may change.
- Existing Qdrant data is an optional optimization, not a required source of
  truth.
- Starting server Qdrant to create snapshots requires a separate explicit
  maintenance approval at execution time.
- Dirty server work is excluded unless the user supplies or approves an exact
  allowlist.
- Production databases, uploads, application volumes, credentials, and Docker
  authentication are never part of this migration.
- Destructive cleanup on either machine is outside the runbook's autonomous
  authority.

## Acceptance priorities

In order:

1. No production-data loss or SmartSpecPro disruption.
2. Do not re-enable the server-side memory failure pattern.
3. Produce reproducible, auditable evidence at every checkpoint.
4. Complete SocratiCode functionality on Windows.
5. Optimize transfer time only after the first four priorities are satisfied.
