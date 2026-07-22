# Specification: SocratiCode Windows Docker Desktop Migration

## Purpose

Provide an execution-ready, checkpointed migration package that a fresh Codex
client on Windows can retrieve from the SmartSpecPro server over SSH and follow
to establish SocratiCode locally without activating SocratiCode on the server.

## Actors

- **User/approver**: supplies SSH target details, verifies the host key, chooses
  optional snapshot or dirty-work transfer, and grants any separate maintenance
  authorization.
- **Windows Codex executor**: reads the runbook, performs local preflight,
  records evidence, transfers only approved artifacts, builds the local target,
  validates it, and stops at approval gates.
- **Linux production server**: read-only inventory and artifact source. It must
  remain free of active SocratiCode after cutover.

## Required artifacts

- `MIGRATION_PLAN.md`: canonical human- and Codex-readable runbook.
- `WINDOWS_CODEX_HANDOFF.md`: short bootstrap contract for the Windows executor.
- `evidence-manifest.template.yaml`: machine-readable execution record.
- Deep-plan research, specification, TDD/verification, review, and section
  artifacts for traceability.

## Functional requirements

### FR-1: Secure remote bootstrap

The Windows executor must be able to connect using OpenSSH, verify the server
host key, read the canonical plan, and copy the plan package to a local staging
directory without modifying the server.

### FR-2: Read-only inventory

Before transfer, the executor must re-measure source commit, dirty state,
relevant sizes, images, containers, volumes, collections, systemd state,
available disk, and server health. The evidence must be timestamped.

### FR-3: Data boundary

The executor must classify each candidate item as authoritative, rebuildable,
reference-only, diagnostic, sensitive, or production-critical. Only allowlisted
items may cross the SSH boundary.

### FR-4: Windows target preflight

The executor must validate WSL 2, Linux-container mode, Docker integration,
available resources, WSL filesystem placement, tools, network access, and
checksum support before copying large artifacts.

### FR-5: Source acquisition

The default source path is a clean Git clone pinned to the manifest commit.
Uncommitted work may be transferred only through a separately reviewed patch and
untracked-file allowlist. Whole-repository transfer is forbidden.

### FR-6: Local SocratiCode runtime

The target must use a local MCP stdio process with Docker Desktop-managed data
services. It must not create one full SocratiCode MCP container per Codex
session. Qdrant must be pinned to the selected compatible version and have a
persistent named volume.

### FR-7: Index migration

The primary path creates an empty local Qdrant store and performs a fresh index.
An optional snapshot path must pin Qdrant 1.17.x compatibility, use collection
snapshots, verify hashes and project identity, and fall back to fresh reindex on
any mismatch.

### FR-8: Validation

The target must pass:

- MCP initialize and status;
- codebase search;
- symbol lookup;
- impact lookup;
- collection and indexed-file completeness checks;
- repeated client-open/client-close checks without container/process fan-out;
- memory observation during initial and incremental indexing;
- checksum and inventory reconciliation.

The server must simultaneously pass:

- SocratiCode launcher remains non-executable;
- watcher/index/timer units remain disabled/inactive and the cleanup service
  remains static-or-disabled/inactive;
- no managed MCP containers are running;
- Qdrant remains stopped after any separately approved snapshot window;
- SmartSpecPro public, local, backend, and PostgreSQL health checks.

### FR-9: Cutover and rollback

Cutover is accepted only after all required gates pass and an observation window
shows bounded memory and stable process/container counts. Rollback disables the
local MCP entry and preserves evidence; it never re-enables server SocratiCode
automatically.

### FR-10: Audit trail

Every phase must update the evidence manifest with commands, results, hashes,
timestamps, approvals, deviations, rollback state, and final disposition.

## Non-functional requirements

- **Safety**: no application/database volume changes and no destructive command
  without a new explicit authorization.
- **Repeatability**: all discovered machine values are stored as variables and
  commands use those variables.
- **Least privilege**: normal accounts and read-only server commands by default.
- **Resource containment**: WSL/Docker memory, CPU, and swap limits are explicit
  and observable.
- **Portability**: no server-specific IP address or secret is copied into the
  target configuration.
- **Data integrity**: all transferred archives, patches, images, and snapshots
  have SHA-256 hashes recorded on both sides.
- **Recoverability**: target resources are created under new names; source
  artifacts remain intact until acceptance.

## Exclusions

- SmartSpecPro database or production-data migration.
- Server application deployment or code changes.
- Automatic copying of `.env`, credentials, private keys, Docker auth, caches,
  node modules, build outputs, uploads, databases, or backups.
- Automatic deletion of old server artifacts.
- Automatic startup of any server-side SocratiCode component.

## Acceptance criteria

The plan package is complete when:

1. A Windows Codex client with no prior conversation can locate and follow the
   canonical runbook.
2. The default path requires no server-side SocratiCode service start.
3. Every mutation is preceded by a precondition, evidence requirement, stop
   condition, and rollback.
4. Optional snapshot and dirty-work paths are clearly separated from the
   default path and require explicit approval.
5. The manifest template can record all required evidence without storing
   secrets.
6. The final validation proves local functionality and proves the server remains
   disabled and healthy.
