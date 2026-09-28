# Section 04 — Local Runtime and Index

> Status: **PLAN ONLY — DO NOT EXECUTE WITHOUT USER AUTHORIZATION**
>
> Executor: Codex on the user's Windows machine, operating in the selected
> WSL 2 distribution with Docker Desktop integration.
>
> Depends on: Sections 01-03 and gates G0-G5.
>
> Produces: gates G6-G7 and the evidence required by Section 05.

## 1. Objective and boundary

Create a resource-bounded SocratiCode target on the Windows client, connect the
local Codex MCP stdio process to local Qdrant and Ollama endpoints, and build a
fresh index by default.

All runtime resources created by this section are local to Windows/WSL/Docker
Desktop. Do not change SmartSpecPro application Compose files, the repository
`.mcp.json`, production services, or any server SocratiCode unit. SSH is not a
runtime transport. The MCP command must not invoke `ssh` or start compute on the
server.

## 2. Required inputs

Do not begin until the execution manifest records:

- explicit user authorization to execute the migration;
- G0-G5 as `pass`;
- verified `WSL_DISTRO`, `WSL_USER`, and `WSL_REPO`;
- target commit and approved dirty-state reconciliation;
- WSL memory, CPU, swap, and disk ceilings;
- `QDRANT_VERSION`, initially `v1.17.0`;
- `SOCRATICODE_VERSION`, initially `1.8.11`;
- `TARGET_PROJECT_ID`, initially `smartspecpro`;
- `OLLAMA_ROUTE` as `native` or `docker`;
- validated `OLLAMA_URL`;
- embedding model `nomic-embed-text` and dimensions `768`;
- Qdrant route as `fresh_reindex` or separately approved `snapshots`;
- target-only operations and evidence directories outside production paths.

Required default decisions:

```yaml
qdrant_route: fresh_reindex
qdrant_image: qdrant/qdrant:v1.17.0
socraticode_version: 1.8.11
target_project_id: smartspecpro
embedding_provider: ollama
embedding_model: nomic-embed-text
embedding_dimensions: 768
```

Any unresolved placeholder blocks execution.

## 3. Local architecture invariants

The target must contain:

- one Docker network dedicated to local SocratiCode data services;
- one new Qdrant volume for the accepted local index;
- one Qdrant container pinned to the recorded image tag or digest;
- one local Ollama endpoint, either native or a separately bounded Docker
  container;
- one local `npx -y socraticode@<version>` stdio process for each active Codex
  connection;
- no full SocratiCode MCP Docker container;
- no Docker socket mount, `--network host`, server path, systemd cgroup parent,
  or SSH wrapper;
- loopback-only published Qdrant and Ollama ports;
- a stable `SOCRATICODE_PROJECT_ID` so a WSL path change does not silently
  create another collection family.

Use target-only names such as:

```text
network:   socraticode-local
qdrant:    socraticode-local-qdrant
volume:    socraticode_local_qdrant_data
restore:   socraticode_local_qdrant_restore_eval
```

Do not reuse or delete a pre-existing resource merely because it has a similar
name. Stop and reconcile ownership first.

## 4. Verification-first baseline

Before creating or starting anything, capture these results in the manifest:

```bash
set -euo pipefail
git -C "$WSL_REPO" rev-parse HEAD
git -C "$WSL_REPO" status --short --branch
free -h
df -hT /
cat /proc/pressure/memory 2>/dev/null || true
docker version
docker info --format '{{.OSType}} {{.Architecture}} {{.DockerRootDir}}'
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker network ls
docker volume ls
docker system df
pgrep -af 'socraticode|node|npx|ollama' || true
```

Pass only when:

- the commit and approved dirty state still match G5;
- Docker reports Linux containers and works from the selected WSL
  distribution;
- WSL ceilings remain visible and free disk still exceeds the recorded
  requirement;
- no conflicting local SocratiCode container, process, port, network, or volume
  exists;
- the planned ports are not already owned by an unrelated process.

Record a pre-mutation timestamp, command summaries, output hashes where
applicable, and baseline memory/swap/container/process counts.

## 5. Create controlled local data services

### 5.1 Configuration contract

Create configuration only in the target-only operations directory. Validate
the final Compose/config rendering before starting containers.

Qdrant must satisfy:

- image `qdrant/qdrant:v1.17.0` initially, with the resolved image ID/digest
  recorded;
- platform `linux/amd64`, unless a separately tested native target is selected;
- bindings `127.0.0.1:16333:6333` and `127.0.0.1:16334:6334`;
- new volume `socraticode_local_qdrant_data`;
- dedicated network `socraticode-local`;
- initial restart policy `no`;
- initial memory limit 4 GiB, or the lower pre-approved value supported by the
  measured host;
- explicit CPU and PID limits;
- a health check against the Qdrant REST endpoint.

If Docker Ollama is selected:

- pin a tested tag or digest, never an unrecorded `latest`;
- use a new local volume and loopback-only binding;
- apply explicit memory, CPU, and PID limits;
- pull `nomic-embed-text` locally;
- never restore the server `socraticode_ollama_data` volume.

If native Ollama is selected, record its version, endpoint, GPU availability,
model digest, and successful access from WSL. If the endpoint runs on the
Windows host rather than inside WSL, validate the documented local host route
instead of guessing an address.

### 5.2 Tests before start

Run configuration validation and inspect the rendered result. It must prove:

- every published address is `127.0.0.1`, not `0.0.0.0`;
- only target-only names and volumes appear;
- Qdrant and Ollama tags/digests match the manifest;
- resource and PID ceilings are present;
- no production path, Docker socket, secret, or remote server address appears.

Also verify that the new Qdrant volume is empty. An unexpected file or
collection blocks the fresh-reindex route.

### 5.3 Start and health-test data services

Start only the target Qdrant service and the selected local Ollama service.
Immediately collect:

```bash
curl -fsS http://127.0.0.1:16333/healthz
curl -fsS http://127.0.0.1:16333/collections
docker stats --no-stream
docker inspect socraticode-local-qdrant \
  --format 'restart={{.RestartCount}} status={{.State.Status}} oom={{.State.OOMKilled}}'
docker port socraticode-local-qdrant
```

Validate the selected Ollama endpoint from WSL and prove that
`nomic-embed-text` exists. Record its model digest when available. Do not start
the MCP process until both endpoints pass.

Keep restart policy `no` through initial indexing and Section 05 smoke tests.
Changing it to `unless-stopped` is a later local-only decision after stability
is proven and recorded.

## 6. Configure the local stdio MCP

Back up the selected local Codex configuration before editing it. Store the
backup in the restricted WSL evidence directory and hash it. Do not transfer or
reuse the server Codex configuration.

The local entry must be equivalent to:

```toml
[mcp_servers.socraticode]
command = "npx"
args = ["-y", "socraticode@1.8.11"]
cwd = "/home/<WSL_USER>/projects/SmartSpecPro"

[mcp_servers.socraticode.env]
QDRANT_MODE = "external"
QDRANT_URL = "http://127.0.0.1:16333"
EMBEDDING_PROVIDER = "ollama"
OLLAMA_MODE = "external"
OLLAMA_URL = "<VALIDATED_LOCAL_OLLAMA_URL>"
EMBEDDING_MODEL = "nomic-embed-text"
EMBEDDING_DIMENSIONS = "768"
SOCRATICODE_PROJECT_ID = "smartspecpro"
SOCRATICODE_LOG_LEVEL = "info"
SOCRATICODE_LOG_FILE = "/home/<WSL_USER>/.local/state/socraticode/socraticode.log"
```

Create the log directory with user-only permissions. Restart only the local
Codex task/agent so it reloads this entry.

### Gate G6 tests

Before indexing, prove:

- `npx` and the MCP `cwd` resolve inside the selected WSL distribution;
- the resolved SocratiCode version matches the manifest;
- Qdrant and Ollama endpoints are local and healthy;
- MCP initialization succeeds over local stdio;
- one active Codex connection creates one local MCP process;
- no SocratiCode MCP Docker container appears;
- no MCP command line contains `ssh`;
- Qdrant/Ollama restart counts remain zero and OOM flags remain false.

Record process parent/child relationships and container counts as the initial
fan-out baseline. G6 fails on any mismatch.

## 7. Fresh local index — default route

Fresh reindex is the required fallback and the default accepted target even
when a snapshot is available.

### 7.1 Tests before indexing

Prove and record:

- the target Qdrant collection list is empty;
- `TARGET_PROJECT_ID=smartspecpro`;
- provider/model/dimensions are Ollama, `nomic-embed-text`, and `768`;
- the WSL repository commit and approved dirty state still match G5;
- exactly one local MCP process is attached;
- no unexpected watcher or index process is running;
- memory, swap, disk, Qdrant, and Ollama baselines remain within their
  pre-approved ceilings.

### 7.2 Index operation and observation

Through the local Codex task:

1. invoke `codebase_status`;
2. invoke `codebase_index`;
3. poll `codebase_status` approximately every 60 seconds until complete.

Keep the MCP connection alive. In a second WSL terminal, sample at the same
cadence:

```bash
date -u +%FT%TZ
free -h
cat /proc/pressure/memory 2>/dev/null || true
df -hT /
docker stats --no-stream
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
pgrep -af 'socraticode|node|npx|ollama' || true
```

Each sample goes into the manifest or a checksummed, sanitized evidence log.
The executor must verify progress and resource use before allowing the next
interval.

If a controlled stop is required, invoke `codebase_stop` so the current batch
can checkpoint. Do not use a Docker Desktop kill or Windows reboot as the normal
stop mechanism.

### Gate G7 tests

Pass only when:

- `codebase_status` reports completion for the expected WSL repository and
  project ID;
- file/chunk/collection counts are non-zero and recorded;
- watcher state is active;
- memory reaches a bounded plateau within the pre-approved ceiling;
- swap does not grow continuously;
- Qdrant/Ollama restart counts remain zero and OOM flags remain false;
- no duplicate MCP/index/watcher process or container appears;
- Section 05 can use the index without any server connection.

## 8. Optional compatible snapshot evaluation

This route is skipped unless the manifest contains separate, explicit user
approval for the server Qdrant-only snapshot window. That approval does not
authorize starting the MCP launcher, watcher, indexer, cleanup timer, Ollama,
SmartSpecPro services, or any production container.

Section 02 records the separate approval and approved collection allowlist but
does not start or export Qdrant. Before this section performs target-side
evaluation, execute the server export subphase from `MIGRATION_PLAN.md` under
that recorded approval: take the stopped-volume safety archive, start only the
bounded loopback export container, snapshot only the approved collection list,
stop the export container through the fail-safe, transfer the checksummed
snapshot archive, and revalidate the server. If any export evidence or
post-export disabled-state check fails, skip restore and use fresh reindex.

### 8.1 Compatibility tests before restore

Require all of the following:

- source Qdrant is `v1.17.0`;
- target Qdrant is the same 1.17 minor line and is not an older patch;
- snapshot file size and SHA-256 match the server ledger;
- target restore volume is new, empty, and distinct from the fresh-index
  volume;
- at least twice the restored collection size is free;
- embedding provider/model/dimensions match exactly;
- the old project identity `7651cae158e3` is used only in the isolated
  compatibility test;
- snapshot artifacts are protected as confidential source-derived data.

Any failed prerequisite rejects the restore without changing the accepted
fresh-index volume.

### 8.2 Restore and acceptance tests

Start a second Qdrant 1.17.x evaluation container on loopback using only the new
restore volume. Upload each collection snapshot through:

```text
/collections/{collection}/snapshots/upload?priority=snapshot
```

For every restored collection, record:

- collection name and point/count result;
- source and target Qdrant versions;
- snapshot name, size, and SHA-256;
- project identity;
- embedding configuration;
- representative payload paths;
- search, symbol, impact, and graph results.

Reject the restored index when any path resolves unusably to the old server,
project identity is wrong, counts are inconsistent, graph metadata is missing,
embedding settings differ, or any functional tool fails. Stop the evaluation
container, label the restore volume as quarantined, preserve evidence, and
return to fresh reindex with project ID `smartspecpro`.

Raw-volume restore is not authorized by this section. It requires a separate
emergency plan and explicit approval.

## 9. Stop conditions

Stop this section immediately when:

- a port is exposed on a non-loopback address;
- a production or pre-existing local resource would be overwritten;
- WSL approaches its memory cap without a plateau;
- swap grows continuously or Windows becomes unstable;
- disk headroom falls below the recorded safety margin;
- Qdrant/Ollama health fails, restarts, or reports OOM;
- multiple unexpected MCP/index/watcher processes or full MCP containers
  appear;
- the MCP repeatedly disconnects;
- repository/project/embedding identity differs from the manifest;
- a snapshot checksum or compatibility test fails;
- server health or memory regresses;
- a command would require authority not recorded in the manifest.

On stop, perform only the local rollback steps below. Preserve the evidence
needed to diagnose the failure.

## 10. Local rollback and evidence handoff

Rollback is local and non-destructive:

1. invoke `codebase_stop` when the MCP remains responsive;
2. close/disable only the new local MCP entry;
3. stop the new local Qdrant/Ollama containers gracefully;
4. preserve and label failed target volumes; do not delete them;
5. restore the previous local Codex configuration from its checksummed backup
   if needed;
6. preserve sanitized logs, hashes, Compose/config render, image IDs, and
   resource samples;
7. confirm no server SocratiCode component was enabled.

The handoff to Section 05 must include:

- G6 and G7 status;
- exact image/version/digest ledger;
- local paths, ports, network, containers, and volumes;
- repository commit and approved dirty-state summary;
- project ID, provider, model, and dimensions;
- collection/file/chunk counts;
- idle and peak memory/swap/disk values;
- process/container fan-out baseline;
- restart/OOM results;
- snapshot acceptance or quarantine decision;
- deviations, stop events, and rollback actions.

Do not proceed to Section 05 unless mandatory G6-G7 tests pass on the accepted
fresh or proven-compatible target.
