# Section 05 — Validation, Cutover, Observation, and Rollback

> Status: **PLAN ONLY — DO NOT EXECUTE WITHOUT USER AUTHORIZATION**
>
> Executor: Codex on the user's Windows machine, operating in the selected
> WSL 2 distribution and using SSH only for read-only server validation.
>
> Depends on: Section 04 and gates G0-G7.
>
> Produces: gates G8-G11, final evidence, and the closeout recommendation.

## 1. Objective and boundary

Prove that the local SocratiCode target is functionally correct, bounded under
normal client fan-out, and independent of the production server. Revalidate
that server SocratiCode remains disabled and SmartSpecPro remains healthy,
observe local stability for 24 and 72 hours, and preserve a non-destructive
rollback path.

Cutover means only that the user's Windows Codex client uses the local WSL
SocratiCode MCP entry. It does not authorize:

- enabling SocratiCode on the server;
- adding a repository-wide MCP entry;
- modifying SmartSpecPro production services;
- deleting server or local volumes;
- removing retained artifacts;
- copying secrets or production data.

## 2. Entry gate and acceptance ledger

Do not begin until the manifest proves:

- G0-G7 are `pass`;
- the accepted target is identified as fresh reindex or proven-compatible
  snapshot restore;
- the local repository commit and approved dirty state are recorded;
- Qdrant/SocratiCode/Ollama versions and image digests are recorded;
- project ID, embedding model, dimensions, collection/file/chunk counts, and
  accepted volume are recorded;
- Qdrant and Ollama are healthy with restart count zero and OOM false;
- the initial process/container/memory/swap baseline is available;
- server health commands or endpoints approved in Section 02 are available;
- a restricted evidence directory and append-only manifest are active.

Before testing, define numeric local ceilings in the manifest:

```yaml
resource_acceptance:
  wsl_memory_max: "<FROM_G2>"
  wsl_swap_max: "<FROM_G2>"
  qdrant_memory_max: "<FROM_G6>"
  ollama_memory_max: "<FROM_G6>"
  mcp_processes_per_active_client: 1
  full_mcp_containers: 0
  restart_count_max: 0
  oom_killed_allowed: false
  fanout_final_idle_growth:
    percent: 10
    minimum_tolerance_mib: 256
```

If a different tolerance is required, record and approve it before the first
fan-out cycle, not after seeing the result.

## 3. Verification-first validation baseline

Capture a new immediate baseline before invoking functional tools:

```bash
set -euo pipefail
date -u +%FT%TZ
git -C "$WSL_REPO" rev-parse HEAD
git -C "$WSL_REPO" status --porcelain=v1
free -b
cat /proc/pressure/memory 2>/dev/null || true
df -hT /
docker stats --no-stream
docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect socraticode-local-qdrant \
  --format 'restart={{.RestartCount}} status={{.State.Status}} oom={{.State.OOMKilled}}'
pgrep -af 'socraticode|node|npx|ollama' || true
curl -fsS http://127.0.0.1:16333/healthz
curl -fsS http://127.0.0.1:16333/collections
```

Also verify that:

- MCP initialization occurs locally through stdio;
- the MCP command has no SSH wrapper;
- the selected Qdrant and Ollama endpoints are local;
- no SocratiCode MCP Docker container exists;
- no unexpected collection family appeared after G7.

Any mismatch returns execution to Section 04 diagnosis. Do not normalize the
baseline after a failure.

## 4. Functional validation

Run the following from the local Windows/WSL Codex task and preserve concise,
sanitized results:

1. `codebase_status` reports the expected WSL repository, project ID, completed
   index, and active watcher.
2. `codebase_search` for a known SmartSpecPro domain concept returns relevant
   files from the accepted commit.
3. `codebase_symbols` or `codebase_symbol` locates a known exported symbol and
   its definition.
4. `codebase_impact` returns plausible dependents for the selected symbol.
5. `codebase_graph_stats` returns non-empty, internally consistent graph
   metadata.

Choose the known concept and symbol before testing and record their expected
paths/results. Do not accept a test chosen after inspecting incorrect output.

### 4.1 Incremental watcher test

Record the exact pre-test Git state and its hash. Use one uniquely named,
temporary, harmless file under a dedicated test directory in the WSL clone:

1. verify the path does not exist;
2. create the one probe file;
3. wait for watcher processing;
4. prove the index sees the probe;
5. change the probe once and prove an incremental update;
6. remove only that exact probe file and its now-empty test directory;
7. prove the index no longer returns the probe;
8. prove Git state exactly matches the recorded pre-test state.

Do not edit a production source file, run `git clean`, or remove a directory
that was not created by this test.

### Gate G8 functional criteria

Pass only when all functional tools, expected-result checks, the incremental
update, cleanup reconciliation, and local-only runtime proof succeed.

## 5. Client fan-out and leak test

The purpose is to prove that the previous one-full-container-per-client failure
mode has not been recreated.

Record a fully idle baseline after a five-minute stabilization period. Then
perform three identical cycles:

1. open one Codex task using the local SocratiCode entry;
2. run `codebase_status` and one known `codebase_search`;
3. record MCP process tree, process count, container count, WSL memory/swap,
   Qdrant/Ollama memory, restart counts, and OOM state;
4. close the Codex task cleanly;
5. wait up to five minutes for the stdio child to exit and memory to settle;
6. record the same measurements again.

Required observations:

- one active client has at most one corresponding local MCP process;
- no full MCP Docker container exists at any point;
- Qdrant and Ollama remain one singleton each;
- the stdio MCP process exits after its client closes;
- there is no orphan index/watcher process;
- restart counts stay zero and OOM remains false;
- WSL swap does not increase continuously;
- after cycle three, settled idle memory is no more than the recorded baseline
  plus the larger of 10% or 256 MiB, unless another threshold was approved
  before testing.

Any monotonic resource baseline growth, orphan, duplicate service, unexpected
container, restart, or OOM fails G8 and triggers local rollback.

## 6. Resource and isolation validation

During functional and fan-out tests, continuously compare actual values with
the predeclared ceilings. Record:

- Windows total/free memory relevant to the WSL allocation;
- WSL idle and peak memory, swap, and memory PSI;
- Qdrant and Ollama idle/peak memory and CPU;
- MCP process count and peak memory;
- Docker container count, restart count, and OOM state;
- index/search latency and MCP error/disconnect count;
- remaining disk and Docker disk use.

Also prove:

- Qdrant/Ollama ports bind only to loopback;
- no server address appears in the local runtime configuration;
- no Docker socket is mounted into the MCP;
- the Windows target remains usable when the SSH session is closed;
- a local tool call does not create a process or container on the server.

Stop before observation when the runtime requires SSH, exceeds a ceiling, or
cannot reach a stable idle state.

## 7. Read-only server and SmartSpecPro revalidation

Run the same read-only checks captured in Section 02 through the verified SSH
alias. Do not restart or repair a service from this section.

At minimum, compare before/after values for:

- launcher mode, expected `000`, and launcher hash;
- watcher, indexer, and cleanup timer state, expected disabled/inactive;
- cleanup service state, expected static-or-disabled/inactive;
- managed SocratiCode MCP process/container count, expected zero;
- Qdrant status, expected stopped, and restart policy, expected `no`;
- SmartSpecPro public health;
- local web/backend health;
- PostgreSQL/container health;
- application/service restart counts;
- memory PSI and OOM events since the migration run began.

Core disabled-state check:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" '
  set -eu
  date -u +%FT%TZ
  stat -c "%a %U:%G %s %n" \
    /home/dev/tools/socraticode-docker/socraticode-mcp.sh
  sudo -n sha256sum \
    /home/dev/tools/socraticode-docker/socraticode-mcp.sh
  systemctl show \
    socraticode-smartspecpro-watch.service \
    socraticode-smartspecpro-index.service \
    socraticode-smartspecpro-cleanup.service \
    socraticode-smartspecpro-cleanup.timer \
    --property=Id,ActiveState,SubState,UnitFileState
  docker ps --filter label=com.smartspec.socraticode.managed=true \
    --format "{{.ID}}\t{{.Names}}\t{{.Status}}"
  docker ps -a --filter name=socraticode-qdrant \
    --format "{{.Names}}\t{{.Image}}\t{{.Status}}"
  docker inspect socraticode-qdrant \
    --format "restart={{.HostConfig.RestartPolicy.Name}} status={{.State.Status}}" \
    2>/dev/null || true
  cat /proc/pressure/memory
'
```

Run the exact SmartSpecPro health probes approved during Section 02 and store
only sanitized outputs.

### Gate G9

Pass only when:

- server launcher remains `000` with the expected hash;
- watch/index/timer units remain disabled/inactive and the cleanup service
  remains static-or-disabled/inactive;
- managed MCP count is zero;
- Qdrant is stopped with restart policy `no`;
- SmartSpecPro and PostgreSQL remain healthy;
- no server memory/OOM/restart regression is attributable to the migration.

An unexpected server process, health failure, or pressure event blocks cutover
and must be handled as a separate server incident. Do not enable server
SocratiCode as a fallback.

## 8. Cutover

Cutover is allowed only after G8 and G9 pass.

1. confirm the local Codex configuration backup remains readable and
   checksummed;
2. make the local WSL stdio entry the only SocratiCode entry used by the
   Windows Codex client;
3. leave the repository `.mcp.json` unchanged;
4. leave Qdrant/Ollama restart policy as approved; if changing Qdrant from
   `no` to `unless-stopped`, record the local-only change and repeat health,
   restart, OOM, port-binding, and resource checks;
5. record the cutover timestamp and immediate functional/resource baseline;
6. close the SSH session and repeat one local `codebase_status` and search to
   prove runtime independence.

There is no server-side activation step.

## 9. Observation checkpoints

Use separate scheduled/resumed checks rather than a long blocking sleep. At
each checkpoint, verify function first, then resource state, then server safety.

| Checkpoint | Required evidence |
|---|---|
| Immediate | status/search smoke, processes, containers, idle/peak memory, swap, ports, restart/OOM |
| 1 hour | settled memory, swap trend, restart counts, MCP errors/disconnects, local search |
| 24 hours | representative daily workload, peak/idle resources, index latency, fan-out count, local errors |
| 72 hours | leak trend, orphan/fan-out assessment, restart/OOM history, final function smoke, server safety |

For the 24-hour and 72-hour checkpoints:

- use the same commands and units as the baseline;
- compare values rather than storing isolated snapshots;
- repeat at least `codebase_status`, known search, process/container counts,
  memory/swap, restart/OOM, and disk checks;
- repeat the read-only server G9 checks;
- record missing intervals or deviations explicitly; do not mark an
  unobserved checkpoint as pass.

### Gate G10

Pass only after both 24-hour and 72-hour checkpoints show:

- correct local function;
- stable idle/peak memory within declared ceilings;
- no continuously growing swap;
- no restart/OOM loop;
- no orphan or container/process fan-out;
- no server SocratiCode activation;
- healthy SmartSpecPro/PostgreSQL.

## 10. Stop and rollback conditions

Rollback is required when:

- functional or incremental checks fail;
- memory grows continuously or exceeds the declared ceiling;
- Windows/WSL becomes unstable;
- swap grows continuously;
- Qdrant/Ollama restarts or reports OOM;
- duplicate/orphan MCP, index, watcher, or full MCP containers appear;
- a local tool requires SSH or creates server activity;
- server SocratiCode becomes active;
- SmartSpecPro/PostgreSQL health regresses;
- artifact, collection, project, embedding, or hash integrity fails.

### Local non-destructive rollback

1. invoke `codebase_stop` if the MCP is responsive;
2. disable/remove only the new local Codex SocratiCode entry;
3. close local Codex tasks using it;
4. stop the new local Qdrant/Ollama containers gracefully;
5. preserve logs, manifest, hashes, process samples, and error outputs;
6. label failed or incompatible volumes as quarantined; do not delete them;
7. restore the prior local Codex config and, when relevant, `.wslconfig` from
   the checksummed local backups;
8. confirm local ports and processes are no longer active;
9. re-run the read-only server G9 checks and leave server SocratiCode disabled.

Rollback does not start server SocratiCode. The user can continue without
codebase intelligence until a corrected local attempt is separately approved.

## 11. Retention and evidence

Retain for 7-14 days, with owner and expiration timestamp recorded:

- the unchanged server Qdrant volume;
- any separately approved server snapshot/safety archive;
- Windows/WSL staging hashes and manifests;
- local Codex and `.wslconfig` backups;
- Compose/config render and resolved image/version/digest ledger;
- sanitized runtime/index/validation/observation logs;
- accepted and quarantined target volumes;
- source commit, approved dirty-state, and transfer hash ledger.

Evidence must contain no private keys, passphrases, tokens, cookies, `.env`
contents, Docker auth, or full Codex configuration. Hashes do not replace the
need to redact sensitive command output.

Deletion, volume pruning, server cleanup, and removal of retained artifacts are
a new destructive task requiring explicit user authorization after the
retention window.

## 12. Gate G11 and final closeout

G11 passes only when:

- G0-G10 are `pass`;
- the 72-hour observation is complete;
- source, transfer, image, snapshot, and configuration hashes reconcile;
- all required evidence is present and sanitized;
- server SocratiCode remains disabled;
- SmartSpecPro/PostgreSQL remain healthy;
- retained artifacts and deletion dates are recorded;
- destructive cleanup remains unapproved;
- the user accepts the final evidence manifest.

The Windows Codex executor's final handoff must report:

- selected route and final local architecture;
- exact versions, image IDs/digests, WSL path, project ID, and endpoints;
- source commit and approved dirty-state summary;
- collection/file/chunk counts;
- functional, incremental, fan-out, isolation, and resource results;
- idle/peak memory, swap, restart/OOM, and 24/72-hour results;
- server disabled-state and SmartSpecPro health proof;
- retained/quarantined artifacts with expiration dates;
- deviations, failures, and rollback actions;
- explicit user acceptance or the remaining blocking gate.

Do not call the migration complete merely because the local MCP starts. It is
complete only after G11 and user acceptance.
