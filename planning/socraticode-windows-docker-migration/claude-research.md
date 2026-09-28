# Research: SocratiCode Migration to Windows Docker Desktop

## Research scope

This research supports a planning-only handoff. No server service was started,
no Docker volume was changed, and no data was transferred.

## Current server inventory

### Repository

- Repository root: `/home/dev/projects/SmartSpecPro`
- Branch: `main`
- Baseline commit at planning time:
  `f6a6c62dc7ec630a90f60e59b79798e3795c1dc2`
- Git object database: approximately 12.04 GiB of packed objects plus 546 MiB
  of loose objects.
- The working tree contains unrelated modified and untracked files. Those files
  belong to active work and must neither be reset nor copied implicitly.
- The repository directory is approximately 181 GiB when broad working-tree
  contents are counted. A whole-directory `scp`, `rsync`, or tar transfer is
  therefore prohibited.
- The root filesystem had approximately 191 GiB free at planning time. This is
  an observation, not a reservation; execution must measure it again.

### SocratiCode runtime

- Repository-managed reference runtime:
  `/home/dev/projects/SmartSpecPro/ops/socraticode-runtime/`
- Active launcher path:
  `/home/dev/tools/socraticode-docker/socraticode-mcp.sh`
- Launcher mode at planning time: `000`, owned by `dev:dev`.
- Watch, index, and cleanup-timer units are disabled and inactive; the cleanup
  service is static and inactive.
- Managed SocratiCode MCP container count is zero.
- Server-side MCP image:
  - tag: `socraticode-mcp:1.8.11`
  - digest ID:
    `sha256:435e00dd3470ff1316b883549b1b14a82734cd6916a74e85cc0de229dfcc1dc8`
  - platform: `linux/amd64`
  - local size: 209,157,644 bytes
- The repository launcher would create one full MCP container per interactive
  client. That fan-out is the pattern that must not be reproduced on Windows.
- The reference launcher uses:
  - project root `/home/dev/projects/SmartSpecPro`
  - embedding model `nomic-embed-text`
  - embedding dimension `768`
  - external Ollama mode
  - an old machine-specific Ollama URL that must not be copied as a target
    configuration value
- The active launcher is byte-for-byte identical to the repository source, but
  it must not be copied as the Windows launcher because it hard-codes Linux
  server paths, host networking, Docker socket/GID behavior, and the
  `system-smartspec-agent.slice` cgroup.

### Qdrant and Ollama

- Qdrant container:
  - name: `socraticode-qdrant`
  - image: `qdrant/qdrant:v1.17.0`
  - image ID:
    `sha256:f1c7272cdac52b38c1a0e89313922d940ba50afd90d593a1605dbbc214e66ffb`
  - platform: `linux/amd64`
  - status at planning time: stopped
  - restart policy: `no`
  - server ports: `16333` and `16334`
  - volume: `socraticode_qdrant_data`
  - volume size: approximately 1.2 GiB
- Collections observed in the stopped volume:
  - `44e4cf618b3d_symgraph_file`
  - `44e4cf618b3d_symgraph_index`
  - `44e4cf618b3d_symgraph_meta`
  - `7651cae158e3_symgraph_file`
  - `7651cae158e3_symgraph_index`
  - `7651cae158e3_symgraph_meta`
  - `codebase_44e4cf618b3d`
  - `codebase_7651cae158e3`
  - `socraticode_metadata`
- The `7651cae158e3` collection family corresponds to the current
  `/home/dev/projects/SmartSpecPro` path. The `44e4cf618b3d` family corresponds
  to a different/stale checkout. This reinforces the project-path identity
  risk.
- A stopped local Ollama container exists with volume
  `socraticode_ollama_data`, approximately 262 MiB. The active launcher used
  external Ollama instead, so this old local volume is not authoritative and is
  excluded by default.
- The Ollama volume includes a private identity key. Do not transfer the volume;
  re-pull `nomic-embed-text` on the target.

## Data classification

| Class | Examples | Authority | Default action |
|---|---|---|---|
| Source | Git-tracked SmartSpecPro files | Authoritative | Clone from Git at the recorded commit |
| Approved dirty work | Explicitly named patches/untracked paths | Potentially authoritative | Transfer only from a reviewed allowlist |
| Qdrant collections | Code embeddings and symbol graph | Rebuildable derived data | Fresh local reindex |
| MCP/Qdrant images | Pinned Linux images | Reproducible artifact | Pull/build locally; `docker save/load` only as fallback |
| Runtime reference | `ops/socraticode-runtime/` | Reference only | Read from the clone; do not activate on server |
| Logs/evidence | status, versions, checksums, timings | Diagnostic | Transfer only the generated evidence bundle |
| Secrets | SSH private keys, `.env`, tokens, Docker auth | Sensitive | Never copy from the server |
| Application data | PostgreSQL, uploads, production volumes | Production-critical | Out of scope; never touch |

## Recommended architecture

Use Docker Desktop with the WSL 2 Linux-container backend. Keep the SmartSpecPro
working copy in the WSL Linux filesystem, such as
`/home/<wsl-user>/projects/SmartSpecPro`, rather than under `/mnt/c`. Run the
MCP stdio client locally from the Windows/WSL development environment and let
Docker Desktop own long-lived Qdrant and, if desired, Ollama containers.

This keeps stdio local to Codex, avoids a per-session full MCP container, and
allows Docker Desktop/WSL resource limits to contain indexing memory pressure.
The Windows Codex MCP entry must use a local stdio command. Wrapping the MCP
command in SSH would move the process, filesystem path, and watcher activity
back to the server and defeat the migration objective.

## Transfer-strategy decision

### Primary path: clean clone plus fresh local reindex

This is the recommended path because:

- the Qdrant data is derived from source;
- the server and Windows/WSL absolute project paths may differ;
- the existing collections include more than one project identity;
- a fresh index makes the target configuration and current source baseline
  explicit;
- no server-side SocratiCode or Qdrant service needs to start.

The Windows client clones the repository at the recorded commit, applies only
explicitly approved dirty-work patches if required, creates new local Qdrant
storage, and indexes locally.

### Optional path: Qdrant collection snapshots

Use this only when the user explicitly chooses to preserve the existing index
and accepts a separate maintenance approval to start only Qdrant temporarily.
Create collection snapshots through Qdrant's snapshot API, stop Qdrant, hash the
snapshot files, transfer them, and restore them to a target running a compatible
Qdrant 1.17.x version.

The official Qdrant documentation states that snapshot recovery must use the
same minor version and a target patch version equal to or newer than the source.
After restore, validate project identity and file paths before accepting the
index. Failure at that gate falls back to a clean local reindex.

### Emergency-only path: stopped raw-volume archive

A raw Docker volume archive is not the normal path. It may be considered only
when:

- the Qdrant container is confirmed stopped;
- the exact Qdrant image version is pinned on both sides;
- the user separately authorizes the operation;
- a manifest and checksum are recorded;
- restoration occurs into a new empty target volume.

Never overwrite an existing target volume and never archive a live Qdrant
volume.

## Windows and WSL requirements

- Supported Windows 11 host with WSL 2 enabled.
- Current WSL kernel; Docker documents WSL 2.1.5 as the minimum supported
  version for this backend.
- Docker Desktop in Linux-container mode with WSL integration enabled for the
  selected distribution.
- Source stored in the WSL Linux filesystem for bind-mount performance.
- WSL resource settings explicitly reviewed:
  - memory
  - processors
  - swap
  - optional `autoMemoryReclaim`
- Docker Desktop disk capacity sufficient for:
  - the selected repository transfer;
  - Qdrant data plus snapshot/reindex headroom;
  - required images;
  - at least one rollback copy.
- OpenSSH client, Git, Node.js, Docker CLI, Compose, and checksum tools
  available before transfer.
- Container-to-host access, if Ollama runs outside Docker, uses
  `host.docker.internal`; do not hard-code the server's old LAN address.
- Bind Qdrant and Ollama host ports to `127.0.0.1` only. Docker publishes to all
  host interfaces when no host IP is specified.
- If Windows has a suitable GPU, prefer native Windows/WSL Ollama according to
  SocratiCode's platform guidance; Dockerized Ollama on Windows may be CPU-only
  and slower. Whichever mode is selected must be recorded and tested.

## SSH and secret-handling requirements

- Use an existing named SSH host or explicit host/user supplied by the user.
- Verify the server host-key fingerprint out of band before accepting it.
- Prefer an encrypted key loaded in `ssh-agent`.
- Never place private keys, passphrases, tokens, or passwords in the migration
  plan, evidence manifest, shell history, or transferred archive.
- Use `StrictHostKeyChecking=yes` after the first verified connection.
- Run discovery and transfer as the normal `dev` account unless a documented
  read-only inventory command needs elevation.
- Do not use SSH agent forwarding.
- The Windows Codex client may read and copy planning artifacts, but must not
  mutate the server repository or start services unless a checkpoint explicitly
  authorizes that exact action.

## Official references

- SocratiCode quick start and MCP configuration:
  <https://github.com/giancarloerra/socraticode>
- Codex on Windows with WSL:
  <https://learn.chatgpt.com/docs/windows/wsl>
- Codex Windows application:
  <https://learn.chatgpt.com/docs/windows/windows-app>
- Codex remote connections:
  <https://learn.chatgpt.com/docs/remote-connections>
- Codex MCP configuration:
  <https://developers.openai.com/codex/mcp/>
- Codex configuration reference:
  <https://developers.openai.com/codex/config-reference/>
- Docker Desktop WSL 2 backend:
  <https://docs.docker.com/desktop/features/wsl/>
- Docker WSL best practices:
  <https://docs.docker.com/desktop/features/wsl/best-practices/>
- Docker Desktop networking:
  <https://docs.docker.com/desktop/features/networking/networking-how-tos/>
- Docker port publishing:
  <https://docs.docker.com/engine/network/port-publishing/>
- Microsoft WSL configuration:
  <https://learn.microsoft.com/windows/wsl/wsl-config>
- Microsoft OpenSSH overview:
  <https://learn.microsoft.com/windows-server/administration/openssh/openssh-overview>
- Microsoft OpenSSH key management:
  <https://learn.microsoft.com/windows-server/administration/openssh/openssh_keymanagement>
- Docker image export:
  <https://docs.docker.com/reference/cli/docker/image/save/>
- Docker image import:
  <https://docs.docker.com/reference/cli/docker/image/load/>
- Qdrant snapshots:
  <https://qdrant.tech/documentation/snapshots/>
- Qdrant snapshot operations:
  <https://qdrant.tech/documentation/operations/snapshots/>
- Qdrant migration and recovery options:
  <https://qdrant.tech/documentation/migration-recovery-options/>

## Verification approach

This work is an operations migration, so verification is checkpoint-driven
rather than application-code unit testing. Each phase must define:

- preconditions;
- read-only or authorized mutation boundary;
- commands to run;
- expected output/evidence;
- stop conditions;
- rollback.

The target must pass MCP initialize/status/search/symbol/impact smoke tests,
memory and process-fan-out checks, checksum reconciliation, and server/application
health checks before cutover is accepted.
