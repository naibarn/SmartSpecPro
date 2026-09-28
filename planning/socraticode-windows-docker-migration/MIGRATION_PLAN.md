# Canonical Runbook: Move SocratiCode to Windows Docker Desktop

> Status: **PLAN ONLY — NOT AUTHORIZED FOR EXECUTION YET**
>
> Canonical server path:
> `/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration/MIGRATION_PLAN.md`
>
> Target executor: Codex on the user's current Windows machine, using a WSL 2
> agent and Docker Desktop.

## 1. Mission

Establish SocratiCode on the Windows client so code indexing, Qdrant, embedding,
and MCP workload no longer consume production-server memory.

SSH is a control and transfer channel only. SocratiCode itself must run locally
in WSL/Windows, and Qdrant/Ollama must run locally under Docker Desktop or as an
explicitly selected local native service.

## 2. Non-negotiable safety rules

1. Do not execute this runbook until the user explicitly authorizes migration.
2. Keep server SocratiCode stopped:
   - launcher mode remains `000`;
   - watcher, indexer, and cleanup timer remain disabled/inactive;
   - managed MCP container count remains zero;
   - Qdrant remains stopped except during the optional, separately approved
     snapshot window.
3. Never start the server launcher.
4. Never copy the whole server repository. It is roughly 181-189 GiB and
   contains unrelated active work, generated data, caches, and secrets.
5. Never run `git reset --hard`, `git clean`, destructive checkout, volume
   deletion, or production-container recreation.
6. Never copy SSH private keys, `.env*`, `~/.codex`, Docker auth, credentials,
   tokens, cookies, application databases, uploads, or production volumes.
7. Do not copy the Linux SocratiCode launcher as the Windows launcher.
8. Do not configure the MCP stdio command through SSH. The MCP process must run
   in the local WSL agent.
9. Bind local Qdrant/Ollama ports to loopback only.
10. Every transferred artifact must have a SHA-256 hash in the evidence
    manifest.
11. Stop immediately when a stop condition is met. Do not improvise around an
    approval gate.
12. Rollback never re-enables SocratiCode on the server.

## 3. Planning-time server baseline

Re-check all values during execution; do not assume they are still current.

| Item | Baseline |
|---|---|
| Repository | `/home/dev/projects/SmartSpecPro` |
| Branch | `main` |
| Commit | `f6a6c62dc7ec630a90f60e59b79798e3795c1dc2` |
| Working tree | Dirty; unrelated tracked and untracked work exists |
| Active launcher | `/home/dev/tools/socraticode-docker/socraticode-mcp.sh` |
| Launcher mode | `000` |
| Systemd watch/index/timer | disabled and inactive |
| Cleanup service | static or disabled, and inactive |
| Running managed MCP containers | 0 |
| Qdrant | `socraticode-qdrant`, stopped, restart `no` |
| Qdrant image | `qdrant/qdrant:v1.17.0`, Linux amd64 |
| Qdrant volume | `socraticode_qdrant_data`, about 1.2 GiB |
| Ollama volume | about 262 MiB; excluded from migration |
| SocratiCode version | `1.8.11` |
| Embedding | Ollama, `nomic-embed-text`, 768 dimensions |
| Main collection identity | `7651cae158e3` |

The other observed collection family, `44e4cf618b3d`, belongs to another/stale
checkout and is not part of the default migration.

## 4. Target architecture

```text
Codex Windows app
  -> selected WSL 2 agent
     -> local stdio: npx -y socraticode@1.8.11
        -> external Qdrant at 127.0.0.1:16333
        -> local Ollama endpoint with nomic-embed-text
     -> source at /home/<user>/projects/SmartSpecPro

Docker Desktop / Linux containers
  -> one persistent, resource-limited Qdrant service
  -> optional resource-limited Ollama service
```

Use a stable target project identity such as `smartspecpro` through
`SOCRATICODE_PROJECT_ID`, so future WSL path changes do not silently create a
new collection family. Do not commit `.socraticode.json` during migration.

## 5. Migration route

### Route A — required/default

1. Clone source cleanly into the WSL Linux filesystem.
2. Pin the recorded commit.
3. Build controlled local Qdrant/Ollama services.
4. Create a fresh SocratiCode index locally.

This route does not start any server SocratiCode service and is the recommended
cutover.

### Route B — optional dirty work

Transfer only user-approved tracked patches and user-approved untracked files.
This route is independent of Qdrant migration.

### Route C — optional Qdrant snapshots

Preserve existing collections as a cold backup or attempt a compatible restore.
This requires a separate explicit maintenance approval because only Qdrant must
start temporarily on the server.

Even after a successful snapshot transfer, default acceptance is a fresh index
unless path/project identity and embedding compatibility are proven.

## 6. Required variables

The Windows executor must fill these in
`evidence-manifest.yaml` before using any command. Placeholder values such as
`<SERVER_HOST>` must never be executed literally.

| Variable | Meaning |
|---|---|
| `RUN_ID` | UTC timestamp plus short label |
| `SERVER_SSH_ALIAS` | verified SSH config alias or host |
| `SERVER_USER` | expected `dev` |
| `SERVER` | `<user>@<alias>` |
| `SERVER_REPO` | `/home/dev/projects/SmartSpecPro` |
| `REMOTE_PLAN_DIR` | server planning directory |
| `WINDOWS_STAGE` | local Windows staging directory |
| `WSL_STAGE` | local WSL execution/evidence directory |
| `WSL_DISTRO` | selected WSL distribution |
| `WSL_USER` | selected Linux user |
| `WSL_REPO` | `/home/<user>/projects/SmartSpecPro` |
| `TARGET_COMMIT` | commit recorded by Phase 2 |
| `QDRANT_VERSION` | initially `v1.17.0` |
| `SOCRATICODE_VERSION` | initially `1.8.11` |
| `TARGET_PROJECT_ID` | initially `smartspecpro` |
| `OLLAMA_URL` | validated local endpoint |

## 7. Checkpoint summary

| Gate | Pass requirement | Mutation boundary |
|---|---|---|
| G0 SSH identity | host key independently verified | none |
| G1 Plan copy | plan hashes match | local staging only |
| G2 Windows preflight | WSL/Docker/resources/tools pass | local config only |
| G3 Server baseline | disabled state and app health pass | none |
| G4 Data lane | source/dirty/snapshot choices recorded | none |
| G5 Source | clone/patch/hash reconciliation pass | local filesystem |
| G6 Local services | bounded Qdrant/Ollama healthy | local Docker only |
| G7 Index | complete or compatible restore proven | local Qdrant only |
| G8 Functional | MCP/search/symbol/impact pass | local only |
| G9 Safety | server still disabled and app healthy | none |
| G10 Soak | stable at 24h and 72h | local only |
| G11 Closeout | manifest accepted | no cleanup |

---

# Execution Procedure

## Phase 0 — User approval and host identity

### Entry criteria

- The user explicitly says to execute the migration.
- The user supplies the intended SSH alias/host.
- The user verifies the server's SSH host-key fingerprint through an
  independent trusted channel.

### Windows PowerShell checks

Run in a normal, non-elevated PowerShell:

```powershell
ssh -V
Get-Command ssh, scp, wsl, docker, git
ssh-keygen -F "<SERVER_SSH_ALIAS>"
```

Do not treat `ssh-keyscan` alone as identity verification.

After the user confirms that the recorded key is correct:

```powershell
$ServerAlias = "<SERVER_SSH_ALIAS>"
$ServerUser = "dev"
$Server = "$ServerUser@$ServerAlias"
$RemotePlanDir = "/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration"

ssh -o BatchMode=yes -o StrictHostKeyChecking=yes $Server `
  "hostname; id; sha256sum '$RemotePlanDir/MIGRATION_PLAN.md' '$RemotePlanDir/WINDOWS_CODEX_HANDOFF.md' '$RemotePlanDir/evidence-manifest.template.yaml'"
```

### Pass evidence

- verified fingerprint;
- server hostname;
- remote account UID/name;
- remote runbook hash;
- timestamp.

### Stop conditions

- unknown or changed host key;
- unexpected hostname/account;
- password fallback when key authentication was expected;
- missing plan.

## Phase 1 — Copy the planning package

Create a new local staging directory:

```powershell
$RunId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ") + "-socraticode"
$WindowsStage = Join-Path $env:USERPROFILE "socraticode-migration\$RunId"
New-Item -ItemType Directory -Path $WindowsStage | Out-Null
```

Copy only these planning artifacts:

```powershell
scp -o StrictHostKeyChecking=yes `
  "${Server}:${RemotePlanDir}/MIGRATION_PLAN.md" `
  "${Server}:${RemotePlanDir}/WINDOWS_CODEX_HANDOFF.md" `
  "${Server}:${RemotePlanDir}/evidence-manifest.template.yaml" `
  $WindowsStage
```

Record local hashes:

```powershell
Get-FileHash -Algorithm SHA256 `
  (Join-Path $WindowsStage "MIGRATION_PLAN.md"),
  (Join-Path $WindowsStage "WINDOWS_CODEX_HANDOFF.md"),
  (Join-Path $WindowsStage "evidence-manifest.template.yaml")
```

Copy the template locally as `evidence-manifest.yaml`; retain the original
unchanged.

### Gate G1

Pass only when remote and local SHA-256 values match.

## Phase 2 — Windows, WSL, and Docker preflight

### 2.1 Record Windows/WSL state

PowerShell:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName,WindowsVersion,OsBuildNumber,CsTotalPhysicalMemory,CsNumberOfLogicalProcessors
wsl --version
wsl --status
wsl --list --verbose
docker version
docker context show
docker info --format '{{.OSType}} {{.Architecture}} {{.DockerRootDir}}'
docker system df
Get-PSDrive -PSProvider FileSystem
node --version
npm --version
git --version
```

Required:

- selected distribution reports WSL version `2`;
- Docker reports `linux`;
- Docker commands work inside the selected WSL distribution;
- Node.js is version 18 or newer;
- target source path is in WSL `/home`, not `/mnt/c`.

### 2.2 Record WSL state

Run inside the selected WSL distribution:

```bash
set -euo pipefail
uname -a
uname -m
id
pwd
free -h
df -hT /
docker version
docker info --format '{{.OSType}} {{.Architecture}} {{.DockerRootDir}}'
docker compose version
node --version
npm --version
git --version
ssh -V
sha256sum --version | head -n 1
npm view socraticode@1.8.11 version
docker manifest inspect qdrant/qdrant:v1.17.0 >/dev/null
git ls-remote git@github.com:naibarn/SmartSpecPro.git HEAD
```

Create the execution staging directory in the WSL Linux filesystem, then copy
the same three planning files directly from the verified server with WSL
`scp`. Use this WSL directory for patches, archives, hashes, and evidence:

```bash
export RUN_ID="<RUN_ID_FROM_PHASE_1>"
export SERVER="dev@<SERVER_SSH_ALIAS>"
export REMOTE_PLAN_DIR="/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration"
export WSL_STAGE="/home/<WSL_USER>/socraticode-migration/$RUN_ID"

mkdir -p "$WSL_STAGE"
chmod 700 "$WSL_STAGE"
scp -o StrictHostKeyChecking=yes \
  "$SERVER:$REMOTE_PLAN_DIR/MIGRATION_PLAN.md" \
  "$SERVER:$REMOTE_PLAN_DIR/WINDOWS_CODEX_HANDOFF.md" \
  "$SERVER:$REMOTE_PLAN_DIR/evidence-manifest.template.yaml" \
  "$WSL_STAGE/"
sha256sum "$WSL_STAGE/"*
cp "$WSL_STAGE/evidence-manifest.template.yaml" \
  "$WSL_STAGE/evidence-manifest.yaml"
chmod 600 "$WSL_STAGE/evidence-manifest.yaml"
```

At the start of every later WSL shell, re-export `RUN_ID`, `SERVER`,
`SERVER_REPO`, `REMOTE_PLAN_DIR`, `WSL_STAGE`, `WSL_REPO`, and
`TARGET_COMMIT` from the manifest. Do not assume shell variables survive a
terminal or Codex-task restart.

### 2.3 Resource ceiling

Back up `%UserProfile%\.wslconfig` before modifying it. Choose a starting cap
that leaves at least 8 GiB, and preferably 12 GiB, for Windows and other
applications.

Suggested starting points:

| Host RAM | WSL memory | WSL swap |
|---:|---:|---:|
| 16 GiB | 8 GiB | 4 GiB |
| 32 GiB | 16 GiB | 8 GiB |
| 64 GiB | 24-32 GiB | 8 GiB |
| More | begin at 40-50% of RAM | 8-16 GiB |

Record the chosen `memory`, `processors`, `swap`, and optional
`autoMemoryReclaim` settings. Apply a changed `.wslconfig` with:

```powershell
wsl --shutdown
```

Then restart WSL and repeat the memory/CPU checks. Do not continue if WSL ignores
the limits.

### 2.4 Disk calculation

Before source transfer, require free space for:

- fresh clone;
- required Docker images;
- at least 2x expected Qdrant storage during indexing/restore;
- one cold backup if Route C is selected;
- 20% operational headroom.

Record the numeric calculation separately for the WSL repository filesystem,
Docker Desktop disk-image allocation, and the Windows drive backing both VHDX
files. Do not assume WSL `df` is the Docker capacity and do not rely on the
server repository's apparent working-tree size.

### Gate G2

Pass only when all required tools, WSL integration, Linux-container mode,
resource ceilings, target path, and disk headroom are proven.

## Phase 3 — Read-only server inventory

Run from WSL bash so binary transfer and shell quoting remain Linux-native:

```bash
set -euo pipefail
export SERVER="dev@<SERVER_SSH_ALIAS>"
export SERVER_REPO="/home/dev/projects/SmartSpecPro"

ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" '
  set -eu
  echo "=== identity ==="
  date -u +%FT%TZ
  hostname
  id

  echo "=== repository ==="
  git -C /home/dev/projects/SmartSpecPro rev-parse HEAD
  git -C /home/dev/projects/SmartSpecPro status --short --branch
  git -C /home/dev/projects/SmartSpecPro remote -v

  echo "=== disabled launcher ==="
  stat -c "%a %U:%G %s %n" \
    /home/dev/tools/socraticode-docker/socraticode-mcp.sh
  sha256sum \
    /home/dev/projects/SmartSpecPro/ops/socraticode-runtime/socraticode-mcp.sh
  sudo -n sha256sum \
    /home/dev/tools/socraticode-docker/socraticode-mcp.sh 2>/dev/null ||
    echo "active launcher hash unavailable without noninteractive sudo"

  echo "=== units ==="
  systemctl show \
    socraticode-smartspecpro-watch.service \
    socraticode-smartspecpro-index.service \
    socraticode-smartspecpro-cleanup.service \
    socraticode-smartspecpro-cleanup.timer \
    --property=Id,ActiveState,SubState,UnitFileState

  echo "=== containers ==="
  docker ps -a --filter name=socraticode \
    --format "{{.Names}}\t{{.Image}}\t{{.Status}}"
  docker inspect socraticode-qdrant \
    --format "restart={{.HostConfig.RestartPolicy.Name}} image={{.Config.Image}}" \
    2>/dev/null || true
  docker ps --filter label=com.smartspec.socraticode.managed=true \
    --format "{{.ID}}\t{{.Names}}\t{{.Status}}"

  echo "=== images and volumes ==="
  docker image inspect socraticode-mcp:1.8.11 qdrant/qdrant:v1.17.0 \
    --format "{{index .RepoTags 0}}\t{{.Id}}\t{{.Os}}/{{.Architecture}}\t{{.Size}}" \
    2>/dev/null || true
  docker volume inspect socraticode_qdrant_data \
    --format "{{.Name}}\t{{.Mountpoint}}" 2>/dev/null || true
  sudo -n du -sh \
    /var/lib/docker/volumes/socraticode_qdrant_data/_data 2>/dev/null || true
  sudo -n find \
    /var/lib/docker/volumes/socraticode_qdrant_data/_data/collections \
    -mindepth 1 -maxdepth 1 -type d -printf "%f\n" 2>/dev/null | sort || true

  echo "=== capacity and pressure ==="
  df -h /
  cat /proc/pressure/memory
  journalctl -k --since "-24 hours" --no-pager 2>/dev/null |
    grep -Ei "oom|out of memory|memory cgroup" | tail -n 50 || true
'
```

Redact remote URLs before saving evidence if they contain credentials.

Create a candidate untracked manifest without transferring files:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  'cd /home/dev/projects/SmartSpecPro &&
   git ls-files --others --exclude-standard' \
  > "$WSL_STAGE/server-untracked-candidates.txt"
sha256sum "$WSL_STAGE/server-untracked-candidates.txt"
```

### SmartSpecPro health baseline

Record:

- current production/public health result;
- current local web/backend health result;
- PostgreSQL/container health;
- relevant service restart counts;
- memory PSI and recent OOM events.

Use the server's existing documented health endpoints and unit/container names.
Do not restart anything to make a check pass.

Planning-time endpoints and service names can be rechecked with:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" '
  set -eu
  systemctl is-active \
    smartspec-web.service \
    smartspec-backend.service \
    smartspec-monitor.service
  curl -fsS -o /dev/null -w "public %{http_code} %{time_total}\n" \
    https://smartaihub.app/healthz
  curl -fsS -o /dev/null -w "web %{http_code} %{time_total}\n" \
    http://127.0.0.1:3000/healthz
  curl -fsS -o /dev/null -w "node-backend %{http_code} %{time_total}\n" \
    http://127.0.0.1:3001/healthz
  curl -fsS -o /dev/null -w "python-backend %{http_code} %{time_total}\n" \
    http://127.0.0.1:8000/health
  docker inspect smartspec-postgres \
    --format "postgres={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restart={{.RestartCount}}"
'
```

### Gate G3

Stop if:

- launcher is executable;
- a SocratiCode MCP process/container is active;
- watch/index/timer is enabled or active, or the cleanup service is active;
- Qdrant is running unexpectedly;
- restart policy differs from the expected stopped state;
- SmartSpecPro/PostgreSQL is unhealthy;
- server memory pressure is elevated;
- source commit/dirty state changed and has not been reconciled.

## Phase 4 — Record data-lane decisions

The user must record one value for each:

```yaml
source_route: github_clone | server_shallow_clone
include_dirty_tracked: false | true
include_dirty_untracked: false | true
qdrant_route: fresh_reindex | snapshots
ollama_route: native | docker
```

Defaults:

```yaml
source_route: github_clone
include_dirty_tracked: false
include_dirty_untracked: false
qdrant_route: fresh_reindex
ollama_route: native_when_gpu_available_otherwise_docker
```

### Exclusion policy

Reject any transfer candidate matching or living under:

- `.env`, `.env.*`, `**/.env`, `**/.env.*`;
- `.claude/**`, `~/.codex/**`, `.git/**`;
- Docker credential/config directories;
- `node_modules/**`, `dist/**`, `build/**`, `target/**`, caches;
- uploads, media libraries, databases, logs, backups, crash/core dumps;
- `orchestra/backups/**`;
- SSH keys, certificates with private material, tokens, cookies.

The tracked file `.claude/settings.local.json` is machine-local and must be
excluded from a dirty-work patch.

### Gate G4

Do not transfer dirty work or Qdrant data unless the corresponding explicit
decision is recorded.

## Phase 5 — Acquire source in the WSL Linux filesystem

Prepare the parent directory:

```bash
set -euo pipefail
export WSL_REPO="/home/<WSL_USER>/projects/SmartSpecPro"
mkdir -p "$(dirname "$WSL_REPO")"
test ! -e "$WSL_REPO"
```

### Preferred: clone from GitHub

```bash
git clone git@github.com:naibarn/SmartSpecPro.git "$WSL_REPO"
git -C "$WSL_REPO" checkout --detach "$TARGET_COMMIT"
```

### Fallback: shallow clone through the verified server SSH channel

Use this only if GitHub access is unavailable:

```bash
git clone --depth 1 --branch main \
  "$SERVER:/home/dev/projects/SmartSpecPro" \
  "$WSL_REPO"
git -C "$WSL_REPO" rev-parse HEAD
```

If the shallow clone does not contain `TARGET_COMMIT`, stop and reconcile the
server branch. Do not clone the entire 20 GiB server `.git` history by default.

### Verify clean baseline

```bash
test "$(git -C "$WSL_REPO" rev-parse HEAD)" = "$TARGET_COMMIT"
test -z "$(git -C "$WSL_REPO" status --porcelain)"
git -C "$WSL_REPO" status --short --branch
```

### Optional Route B: tracked patch

First create a reviewed `approved-tracked-paths.txt`. It must contain only
repository-relative paths, one per line, with no blank, absolute, parent (`..`),
or excluded paths.

Stream the patch from the server into WSL; do not create it inside the server
repository:

```bash
# Codex must expand only the reviewed path list and retain the explicit
# exclusion of .claude/settings.local.json.
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  'git -C /home/dev/projects/SmartSpecPro diff \
     --binary --no-ext-diff HEAD -- \
     <APPROVED_TRACKED_PATHS> \
     ":(exclude).claude/settings.local.json"' \
  > "$WSL_STAGE/tracked-server-changes.patch"

sha256sum "$WSL_STAGE/tracked-server-changes.patch"
git -C "$WSL_REPO" apply --check \
  "$WSL_STAGE/tracked-server-changes.patch"
```

Only after review and `apply --check` pass:

```bash
git -C "$WSL_REPO" apply \
  "$WSL_STAGE/tracked-server-changes.patch"
```

### Optional Route B: untracked allowlist

Review the candidate manifest and create
`approved-untracked-files.nul` containing exact file paths only. Directories
must be expanded to individual files. Reject symlinks that resolve outside the
repository.

Then stream a tar archive from the server to WSL:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  'cd /home/dev/projects/SmartSpecPro &&
   tar --null --files-from=- --no-recursion -czf -' \
  < "$WSL_STAGE/approved-untracked-files.nul" \
  > "$WSL_STAGE/approved-untracked-files.tar.gz"

sha256sum "$WSL_STAGE/approved-untracked-files.tar.gz"
tar -tzf "$WSL_STAGE/approved-untracked-files.tar.gz"
```

Inspect the archive list before extracting. Extract only into `WSL_REPO` and
then compare `git status --short` with the approved manifest.

### Gate G5

Pass when:

- target commit matches;
- clean or approved dirty state reconciles exactly;
- all hashes are recorded;
- no excluded path crossed the boundary.

## Phase 6 — Create the controlled local data services

### 6.1 Target-only configuration location

Create a local operations directory outside the repository or under an
untracked local state directory. Do not modify SmartSpecPro application Compose
files.

Required Qdrant service contract:

- image `qdrant/qdrant:v1.17.0`;
- named container distinct from production, for example
  `socraticode-local-qdrant`;
- named volume `socraticode_local_qdrant_data`;
- named network `socraticode-local`;
- loopback bindings `127.0.0.1:16333:6333` and
  `127.0.0.1:16334:6334`;
- restart `unless-stopped` only after smoke tests pass; use `no` initially;
- memory limit initially 4 GiB;
- CPU limit appropriate to the host;
- PID limit;
- health check against the Qdrant REST endpoint.

Required Ollama service contract when Docker route is selected:

- pin a tested tag or digest, not `latest`;
- use a new target volume;
- loopback binding only;
- explicit memory/CPU limit;
- pull `nomic-embed-text` fresh;
- never restore `socraticode_ollama_data`.

If native Ollama is selected, record its version, endpoint, GPU availability,
model digest, and connectivity from WSL.

### 6.2 Start data services only

Before start:

```bash
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
docker network ls
docker volume ls
free -h
cat /proc/pressure/memory 2>/dev/null || true
```

Start only the target Qdrant and selected Ollama service. Then:

```bash
curl -fsS http://127.0.0.1:16333/healthz
curl -fsS http://127.0.0.1:16333/collections
docker stats --no-stream
docker inspect socraticode-local-qdrant \
  --format 'restart={{.RestartCount}} status={{.State.Status}} oom={{.State.OOMKilled}}'
```

Validate the Ollama endpoint and confirm `nomic-embed-text` exists before
starting SocratiCode.

If the target cannot pull the pinned Qdrant image but the verified SSH channel
works, the approved image-only fallback is:

```bash
ssh "$SERVER" \
  'docker image save qdrant/qdrant:v1.17.0 | gzip -1' \
  > "$WSL_STAGE/qdrant-v1.17.0-linux-amd64.tar.gz"
sha256sum "$WSL_STAGE/qdrant-v1.17.0-linux-amd64.tar.gz"
gzip -t "$WSL_STAGE/qdrant-v1.17.0-linux-amd64.tar.gz"
gunzip -c "$WSL_STAGE/qdrant-v1.17.0-linux-amd64.tar.gz" |
  docker image load
docker image inspect qdrant/qdrant:v1.17.0 \
  --format '{{.Id}} {{.Os}}/{{.Architecture}}'
```

`docker image save/load` transfers image layers and tags only; it does not
transfer Qdrant data. If npm cannot retrieve
`socraticode@1.8.11`, stop and resolve package availability rather than
switching silently to the old full-MCP-container design.

### Stop conditions

- port is published on `0.0.0.0`;
- container exceeds the planned resource ceiling;
- restart count is non-zero;
- OOM flag is true;
- health check fails;
- duplicate old/managed SocratiCode containers appear.

## Phase 7 — Configure local Codex MCP

Back up the local Codex config belonging to the selected WSL agent. Do not copy
the server config and do not modify the repository `.mcp.json`.

The resulting Codex structure must be equivalent to:

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

Create the log directory with user-only permissions. No secret is required for
loopback Qdrant/Ollama.

Restart the Codex task/agent so it loads the local MCP configuration. Confirm
that `npx`, `cwd`, Qdrant, and Ollama resolve inside WSL rather than on the
server.

### Gate G6

Pass only when:

- MCP is local;
- no server SSH wrapper exists;
- external Qdrant and Ollama endpoints are local and healthy;
- one MCP process corresponds to one active client connection;
- no MCP Docker container is created.

## Phase 8 — Fresh local index (default)

Ask Codex to invoke:

1. `codebase_status`
2. `codebase_index`
3. `codebase_status` approximately every 60 seconds until complete

Keep the MCP connection alive during indexing. In a second WSL terminal,
capture every 60 seconds:

```bash
date -u +%FT%TZ
free -h
cat /proc/pressure/memory 2>/dev/null || true
docker stats --no-stream
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'
pgrep -af 'socraticode|node|npx' || true
```

If indexing must stop, call `codebase_stop` so the current batch checkpoints.
Do not kill Docker Desktop or reboot as a normal stop method.

### Stop conditions

- WSL approaches its memory cap and does not plateau;
- swap grows continuously;
- the Windows UI becomes unstable;
- Qdrant/Ollama restarts or reports OOM;
- multiple index/watch processes are created unexpectedly;
- the MCP client disconnects repeatedly;
- server memory or application health regresses.

### Gate G7

Pass when `codebase_status` reports completion, expected repository identity,
file/chunk counts, and active watcher, with bounded memory.

## Optional Phase 8C — Qdrant snapshot route

This phase is skipped by default.

### Separate approval required

The user must explicitly approve:

- temporary Qdrant-only startup on the server;
- creation of a stopped-volume safety archive;
- creation and transfer of collection snapshots;
- additional server disk use and a maintenance window.

Approval does not include the SocratiCode MCP launcher, watcher, indexer,
cleanup timer, Ollama, application services, or volume deletion.

### Compatibility prerequisites

- source Qdrant `v1.17.0`;
- target Qdrant must be 1.17.x and must not be an older patch;
- embedding provider/model/dimensions remain Ollama,
  `nomic-embed-text`, and `768`;
- target restore volume is new and empty;
- at least 2x collection size is free during restore;
- snapshots are treated as confidential source-derived data.

### Server export design

1. Confirm the original Qdrant container is stopped.
2. Create and hash a stopped-volume safety archive in a dedicated migration
   staging directory with restrictive permissions.
3. Start a temporary container named `socraticode-qdrant-export` using:
   - `qdrant/qdrant:v1.17.0`;
   - the existing `socraticode_qdrant_data` volume;
   - loopback-only port `127.0.0.1:16333`;
   - explicit memory/CPU/PID limits;
   - restart policy `no`;
   - no MCP, watcher, indexer, or Ollama.
4. Query `/collections`.
5. Create per-collection snapshots through
   `POST /collections/{collection}/snapshots`.
6. Record collection name, snapshot name, size, creation time, and count.
7. Stop the temporary Qdrant container immediately.
8. Confirm no SocratiCode-related container remains running.
9. Archive and hash only the snapshot files.
10. Copy the snapshot archive with `scp` from WSL and verify hashes on both
    sides.

Do not start the existing container with its old all-interface port binding.

After approval, the executor must render and review commands equivalent to the
following. These commands are examples with variables; do not run unexpanded
placeholders:

```bash
export EXPORT_DIR="/home/dev/socraticode-migration-export/$RUN_ID"

# Default approved SmartSpecPro collection family. Append
# socraticode_metadata only if the compatibility review explicitly approves it.
APPROVED_COLLECTIONS=(
  "7651cae158e3_symgraph_file"
  "7651cae158e3_symgraph_index"
  "7651cae158e3_symgraph_meta"
  "codebase_7651cae158e3"
)
printf '%s\n' "${APPROVED_COLLECTIONS[@]}" \
  > "$WSL_STAGE/approved-qdrant-collections.txt"
sha256sum "$WSL_STAGE/approved-qdrant-collections.txt"

# Confirm stopped state, disk headroom, and tools.
ssh "$SERVER" "
  set -eu
  test \"\$(docker inspect socraticode-qdrant --format '{{.State.Running}}')\" = false
  command -v curl
  command -v jq
  df -h /home/dev /var/lib/docker
  install -d -m 700 '$EXPORT_DIR'
"

scp -o StrictHostKeyChecking=yes \
  "$WSL_STAGE/approved-qdrant-collections.txt" \
  "$SERVER:$EXPORT_DIR/"

# Safety archive of the stopped volume before Qdrant opens it.
ssh "$SERVER" "
  set -eu
  sudo -n tar --numeric-owner \
    -C /var/lib/docker/volumes/socraticode_qdrant_data/_data \
    -czf '$EXPORT_DIR/qdrant-stopped-volume-before-export.tar.gz' .
  sudo -n chown dev:dev \
    '$EXPORT_DIR/qdrant-stopped-volume-before-export.tar.gz'
  chmod 600 '$EXPORT_DIR/qdrant-stopped-volume-before-export.tar.gz'
  sha256sum '$EXPORT_DIR/qdrant-stopped-volume-before-export.tar.gz'
"

# Start only a bounded, loopback-only temporary Qdrant.
ssh "$SERVER" '
  set -eu
  docker run -d --rm \
    --name socraticode-qdrant-export \
    --restart no \
    --memory 4g \
    --memory-swap 4g \
    --cpus 2 \
    --pids-limit 256 \
    -p 127.0.0.1:16333:6333 \
    -v socraticode_qdrant_data:/qdrant/storage \
    qdrant/qdrant:v1.17.0
'
```

Wait only for Qdrant health. Then create and download per-collection snapshots
into the restrictive export directory:

```bash
ssh "$SERVER" "
  set -eu
  trap 'docker stop --time 30 socraticode-qdrant-export >/dev/null 2>&1 || true' EXIT
  test \"\$(docker inspect socraticode-qdrant-export --format '{{.State.Running}}')\" = true
  curl -fsS http://127.0.0.1:16333/healthz
  install -d -m 700 '$EXPORT_DIR/snapshots'
  curl -fsS http://127.0.0.1:16333/collections \
    > '$EXPORT_DIR/collections.json'
  while IFS= read -r collection; do
    printf '%s' \"\$collection\" | grep -Eq '^[A-Za-z0-9_-]+$'
    jq -e --arg collection \"\$collection\" \
      '.result.collections[] | select(.name == \$collection)' \
      '$EXPORT_DIR/collections.json' >/dev/null
    response=\$(curl -fsS -X POST \
      \"http://127.0.0.1:16333/collections/\${collection}/snapshots\")
    snapshot=\$(printf '%s' \"\$response\" | jq -er '.result.name')
    printf '%s\n' \"\$response\" \
      > \"$EXPORT_DIR/snapshots/\${collection}.create.json\"
    curl -fsS \
      \"http://127.0.0.1:16333/collections/\${collection}/snapshots/\${snapshot}\" \
      -o \"$EXPORT_DIR/snapshots/\${collection}--\${snapshot}\"
  done < '$EXPORT_DIR/approved-qdrant-collections.txt'
  cd '$EXPORT_DIR'
  sha256sum snapshots/* > snapshots.sha256
"
```

Stop the export container even if snapshot creation fails:

```bash
ssh "$SERVER" '
  docker stop --time 30 socraticode-qdrant-export >/dev/null 2>&1 || true
  test -z "$(docker ps -q --filter name=socraticode-qdrant-export)"
  test -z "$(docker ps -q --filter label=com.smartspec.socraticode.managed=true)"
  docker inspect socraticode-qdrant \
    --format "running={{.State.Running}} restart={{.HostConfig.RestartPolicy.Name}}"
'
```

Create a checksummed snapshot archive only after Qdrant is stopped:

```bash
ssh "$SERVER" "
  set -eu
  tar -C '$EXPORT_DIR' -czf '$EXPORT_DIR/qdrant-collection-snapshots.tar.gz' \
    approved-qdrant-collections.txt collections.json snapshots snapshots.sha256
  chmod 600 '$EXPORT_DIR/qdrant-collection-snapshots.tar.gz'
  sha256sum '$EXPORT_DIR/qdrant-collection-snapshots.tar.gz'
"

scp -o StrictHostKeyChecking=yes \
  "$SERVER:$EXPORT_DIR/qdrant-collection-snapshots.tar.gz" \
  "$WSL_STAGE/"
sha256sum "$WSL_STAGE/qdrant-collection-snapshots.tar.gz"
```

Compare the server and WSL hashes before restore. The stopped-volume safety
archive remains on the server for the approved retention period unless the user
separately approves its transfer.

### Target restore design

1. Keep the fresh-index target volume untouched.
2. Create a second empty volume for snapshot evaluation.
3. Start Qdrant 1.17.x against that volume on loopback.
4. Restore each snapshot through
   `/collections/{collection}/snapshots/upload?priority=snapshot`.
5. Use `SOCRATICODE_PROJECT_ID=7651cae158e3` only for compatibility testing
   against the old collection family.
6. Verify collection counts, sample payload paths, search results, graph
   metadata, and embedding settings.
7. Reject the restored index if any path points unusably to the old server,
   project identity is wrong, counts are inconsistent, or tools fail.
8. On rejection, stop and quarantine the restore volume and return to fresh
   reindex with project ID `smartspecpro`.

Before upload, verify the transferred archive and internal snapshot hashes:

```bash
mkdir -p "$WSL_STAGE/qdrant-snapshot-restore"
tar -xzf "$WSL_STAGE/qdrant-collection-snapshots.tar.gz" \
  -C "$WSL_STAGE/qdrant-snapshot-restore"
(
  cd "$WSL_STAGE/qdrant-snapshot-restore"
  sha256sum -c snapshots.sha256
)
```

After starting the separate empty target Qdrant 1.17.x evaluation volume,
upload only the binary snapshot files:

```bash
for snapshot_file in "$WSL_STAGE/qdrant-snapshot-restore"/snapshots/*; do
  case "$snapshot_file" in
    *.create.json) continue ;;
  esac
  base="$(basename "$snapshot_file")"
  collection="${base%%--*}"
  curl -fsS -X POST \
    "http://127.0.0.1:16333/collections/${collection}/snapshots/upload?priority=snapshot" \
    -F "snapshot=@${snapshot_file}"
done
curl -fsS http://127.0.0.1:16333/collections
```

Raw-volume restore is an emergency-only task requiring another explicit
approval and is not part of this runbook.

## Phase 9 — Functional validation

From the local Windows/WSL Codex task:

1. `codebase_status` returns the WSL repository and completed index.
2. `codebase_search` for a known SmartSpecPro domain concept returns relevant
   files.
3. `codebase_symbols` or `codebase_symbol` locates a known symbol.
4. `codebase_impact` returns plausible dependents for that symbol.
5. `codebase_graph_stats` returns non-empty graph metadata.
6. `codebase_watch` reports active after indexing.

### Incremental-update test

Use a temporary, harmless file under a dedicated test path in the WSL clone.
Record the baseline Git state, create/change the test file, wait for watcher
processing, verify an incremental update, then remove only that test file.
Confirm Git state returns exactly to the recorded baseline.

Do not edit a production source file merely to test the watcher.

### Fan-out test

Repeat three times:

1. open one Codex task using SocratiCode;
2. run `codebase_status`;
3. record processes, containers, and memory;
4. close the task cleanly;
5. verify the MCP process exits and Qdrant/Ollama remain stable.

Acceptance:

- no full MCP Docker container;
- no orphan MCP processes;
- Qdrant/Ollama remain singletons;
- no increasing memory baseline across cycles.

### Gate G8

All functional, incremental, and fan-out checks must pass.

## Phase 10 — Revalidate the server

Repeat the Phase 3 disabled-state checks. Also record current:

- public SmartSpecPro health;
- local web/backend health;
- PostgreSQL health;
- memory PSI;
- OOM events since the migration run began;
- application and container restart counts.

### Gate G9

Pass only when:

- server launcher remains mode `000`;
- watch/index/timer remain disabled/inactive and the cleanup service remains
  static-or-disabled/inactive;
- no managed MCP container runs;
- Qdrant is stopped and restart policy remains `no`;
- SmartSpecPro/PostgreSQL is healthy;
- no migration-related server memory regression appears.

## Phase 11 — Cutover and observation

Cutover means the user's Windows Codex uses only the local WSL SocratiCode
entry. It does not mean enabling any repository-wide MCP entry or deleting
server data.

Record metrics:

| Time | Required evidence |
|---|---|
| Immediate | function smoke, process/container counts, idle/peak memory |
| 1 hour | memory plateau, swap, restart counts, MCP errors |
| 24 hours | daily workload result and peak resource use |
| 72 hours | leak/fan-out assessment and final stability |

If memory grows continuously, disable the local MCP entry and stop local data
services gracefully. Preserve logs and the manifest.

### Gate G10

Pass only after both 24-hour and 72-hour checks are stable.

## Phase 12 — Retention, rollback, and closeout

Retain for 7-14 days:

- server Qdrant volume unchanged;
- any approved server snapshot/safety archive;
- Windows staging hashes and manifests;
- quarantined target volume, if any;
- local config backups and sanitized logs.

Cleanup after retention is a separate destructive task. It is not authorized by
this plan.

### Local rollback

1. Disable/remove only the local Codex SocratiCode MCP entry.
2. Gracefully stop local SocratiCode indexing/watch.
3. Stop local Qdrant/Ollama.
4. Preserve logs, manifest, hashes, and failed target volumes.
5. Restore the prior local Codex config or `.wslconfig` from its local backup if
   needed.
6. Confirm server SocratiCode remains disabled.

### Final acceptance

The user accepts migration only when:

- all mandatory gates G0-G11 pass;
- the manifest is complete and contains no secrets;
- hashes reconcile;
- local functionality and bounded memory are proven;
- server SocratiCode remains disabled;
- SmartSpecPro remains healthy.

# Handoff record

At completion, the Windows Codex executor must report:

- final architecture and selected routes;
- exact target versions/digests;
- target project ID and paths;
- source commit and approved dirty-state summary;
- collection/file/chunk counts;
- peak/idle memory, swap, and restart counts;
- 24-hour and 72-hour results;
- server disabled-state proof;
- SmartSpecPro health proof;
- retained artifacts and deletion dates;
- deviations and unresolved risks.

# Official references

- [SocratiCode official repository](https://github.com/giancarloerra/socraticode)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp/)
- [Codex on Windows with WSL](https://learn.chatgpt.com/docs/windows/wsl)
- [Docker Desktop WSL backend](https://docs.docker.com/desktop/features/wsl/)
- [Docker WSL best practices](https://docs.docker.com/desktop/features/wsl/best-practices/)
- [Microsoft WSL configuration](https://learn.microsoft.com/windows/wsl/wsl-config)
- [Microsoft OpenSSH key management](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement)
- [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
- [Docker image save](https://docs.docker.com/reference/cli/docker/image/save/)
- [Docker image load](https://docs.docker.com/reference/cli/docker/image/load/)
- [Qdrant snapshots](https://qdrant.tech/documentation/snapshots/)
- [Qdrant migration options](https://qdrant.tech/documentation/migration-recovery-options/)
