# Section 02 — Read-Only Server Inventory and Data Boundary

> Execution status: **PLAN ONLY — do not run until the user explicitly
> authorizes migration execution.**
>
> Executor: Codex on the current Windows client, issuing read-only checks from
> the selected WSL 2 distribution through verified SSH.
>
> This section owns gates G3 and G4. It must not start, stop, restart, enable,
> disable, edit, archive, or delete anything on the server.

## Objective

Revalidate the live server state immediately before transfer planning, prove
that SocratiCode remains disabled and SmartSpecPro remains healthy, record the
exact Git/source/data inventory, classify what is and is not allowed to cross
the SSH boundary, and obtain explicit route decisions without transferring
source, dirty work, Qdrant data, secrets, or production data.

Successful completion means:

- the current server state is reconciled with the planning baseline;
- launcher mode, systemd units, processes, containers, restart policies,
  images, volumes, and collection names are evidenced;
- no SocratiCode runtime is active;
- SmartSpecPro public, local web, local backend, and PostgreSQL health pass;
- memory pressure and recent OOM evidence are acceptable;
- the exact source commit and dirty-state manifests are captured;
- a source route, dirty-work policy, Qdrant route, and Ollama route are
  explicitly recorded;
- all excluded data classes remain excluded; and
- no server mutation or data transfer occurred.

## Dependencies and entry criteria

Before running any command in this section:

1. G0, G1, and G2 are `pass`.
2. `evidence-manifest.yaml` exists in the mode-`700` WSL staging directory and
   is itself mode `600`.
3. `SERVER`, `SERVER_REPO`, and `WSL_STAGE` contain real verified values.
4. The strict SSH options from Section 01 remain in force.
5. The user has not authorized destructive cleanup.
6. The default route remains clean Git clone plus fresh local reindex unless
   the user explicitly selects otherwise.

From WSL, validate variables before use:

```bash
set -euo pipefail

export SERVER="dev@REAL_VERIFIED_SSH_ALIAS"
export SERVER_REPO="/home/dev/projects/SmartSpecPro"
export WSL_STAGE="/home/REAL_WSL_USER/socraticode-migration/REAL_RUN_ID"

for value in "$SERVER" "$SERVER_REPO" "$WSL_STAGE"; do
  case "$value" in
    ""|*"<"*|*">"*|*REAL_*)
      printf 'Unresolved value: %s\n' "$value" >&2
      exit 2
      ;;
  esac
done

test "$SERVER_REPO" = "/home/dev/projects/SmartSpecPro"
test -d "$WSL_STAGE"
test "$(stat -c '%a' "$WSL_STAGE")" = "700"
test "$(stat -c '%a' "$WSL_STAGE/evidence-manifest.yaml")" = "600"
```

## Planning-time comparison baseline

Treat this table as an expectation to verify, not as current truth:

| Item | Planning baseline |
|---|---|
| Repository | `/home/dev/projects/SmartSpecPro` |
| Branch | `main` |
| Commit | `f6a6c62dc7ec630a90f60e59b79798e3795c1dc2` |
| Working tree | Dirty; unrelated tracked and untracked work exists |
| Active launcher | `/home/dev/tools/socraticode-docker/socraticode-mcp.sh` |
| Launcher mode | `000` |
| Watch/index/timer | disabled and inactive |
| Cleanup service | static or disabled, and inactive |
| Running managed MCP containers | `0` |
| Qdrant container | `socraticode-qdrant`, stopped, restart `no` |
| Qdrant image | `qdrant/qdrant:v1.17.0`, Linux amd64 |
| Qdrant volume | `socraticode_qdrant_data`, approximately 1.2 GiB |
| SocratiCode version | `1.8.11` |
| Main collection identity | `7651cae158e3` |
| Other observed collection family | `44e4cf618b3d`, excluded by default |

Any difference must be explained and approved before G3/G4 pass. A legitimate
new commit does not authorize copying it automatically.

## Safety boundary

Allowed server actions are limited to:

- `date`, `hostname`, `id`, `stat`, and `sha256sum`;
- Git read operations that do not fetch, checkout, reset, clean, or update the
  index;
- `systemctl show`, `is-active`, and `is-enabled`;
- `docker ps`, `docker inspect`, `docker image inspect`, and
  `docker volume inspect`;
- read-only `du`/`find` under the known stopped Qdrant volume when passwordless
  `sudo -n` is already available;
- `df`, `free`, PSI reads, `vmstat`, and journal reads;
- HTTP GET health probes; and
- writing command output only to the local WSL evidence directory.

Forbidden in this section:

- `systemctl start|stop|restart|enable|disable|mask|unmask`;
- `docker start|stop|restart|run|compose up|rm|rmi|volume rm`;
- `chmod`, `chown`, file editing, package installation, or service reload;
- `git fetch|pull|checkout|switch|reset|clean|stash|gc`;
- `tar`, `rsync`, `scp` of repository/data content, snapshot creation, or
  Qdrant API calls;
- reading `.env`, Codex configuration, SSH keys, Docker auth, database content,
  tokens, cookies, or credentials; and
- starting server Qdrant even if snapshot migration appears desirable.

## Verification-first tests

### Test 1 — Reconfirm strict SSH identity

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  'date -u +%FT%TZ; hostname; id -un; id -u' \
  | tee "$WSL_STAGE/server-identity-phase02.txt"
```

Compare hostname, user, UID, and host-key evidence with G0. Stop on any drift.

### Test 2 — Prove launcher and unit disabled state

Capture evidence:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    stat -c "mode=%a owner=%U group=%G size=%s path=%n" \
      /home/dev/tools/socraticode-docker/socraticode-mcp.sh
    sudo -n sha256sum \
      /home/dev/tools/socraticode-docker/socraticode-mcp.sh
    sha256sum \
      /home/dev/projects/SmartSpecPro/ops/socraticode-runtime/socraticode-mcp.sh
    systemctl show \
      socraticode-smartspecpro-watch.service \
      socraticode-smartspecpro-index.service \
      socraticode-smartspecpro-cleanup.service \
      socraticode-smartspecpro-cleanup.timer \
      --property=Id,LoadState,ActiveState,SubState,UnitFileState \
      --no-pager
  ' | tee "$WSL_STAGE/server-socraticode-units.txt"
```

Run assertions without changing state:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    mode="$(stat -c "%a" /home/dev/tools/socraticode-docker/socraticode-mcp.sh)"
    case "$mode" in 0|000) ;; *) exit 31 ;; esac

    for unit in \
      socraticode-smartspecpro-watch.service \
      socraticode-smartspecpro-index.service \
      socraticode-smartspecpro-cleanup.timer
    do
      active="$(systemctl is-active "$unit" 2>/dev/null || true)"
      enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
      test "$active" = "inactive"
      test "$enabled" = "disabled"
    done

    cleanup_active="$(
      systemctl is-active socraticode-smartspecpro-cleanup.service 2>/dev/null ||
      true
    )"
    cleanup_enabled="$(
      systemctl is-enabled socraticode-smartspecpro-cleanup.service 2>/dev/null ||
      true
    )"
    test "$cleanup_active" = "inactive"
    case "$cleanup_enabled" in
      static|disabled) ;;
      *) exit 32 ;;
    esac
  '
```

The test must return zero. `failed`, `active`, `activating`, `enabled`,
`masked`, or `not-found` is drift that requires reconciliation. `static` is
accepted only for `socraticode-smartspecpro-cleanup.service`; do not normalize
any state inside this migration. Because the active launcher is mode `000`, its
hash must be read with the already-authorized non-interactive `sudo -n`; if
that fails, stop rather than changing permissions or requesting a password.

### Test 3 — Prove no SocratiCode/Qdrant process or managed container is active

Process evidence:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  "ps -eo pid,ppid,rss,etime,args | grep -E '[s]ocraticode|[q]drant' || true" \
  | tee "$WSL_STAGE/server-socraticode-processes.txt"
```

Expected output is empty. Any real SocratiCode or Qdrant process is a stop
condition.

Container evidence and assertions:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    docker ps -a \
      --filter name=socraticode \
      --format "{{.Names}}\t{{.Image}}\t{{.Status}}"
    docker ps \
      --filter label=com.smartspec.socraticode.managed=true \
      --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}"
    docker inspect socraticode-qdrant \
      --format "name={{.Name}} state={{.State.Status}} running={{.State.Running}} restart={{.HostConfig.RestartPolicy.Name}} image={{.Config.Image}}"

    test -z "$(docker ps -q --filter label=com.smartspec.socraticode.managed=true)"
    test -z "$(docker ps -q --filter name=^/socraticode-qdrant$)"
    test "$(docker inspect socraticode-qdrant --format "{{.State.Status}}")" = "exited"
    test "$(docker inspect socraticode-qdrant --format "{{.HostConfig.RestartPolicy.Name}}")" = "no"
  ' | tee "$WSL_STAGE/server-socraticode-containers.txt"
```

### Test 4 — Prove production health before deeper inventory

These are GET/status checks only:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu

    check_http() {
      label="$1"
      url="$2"
      code="$(curl --max-time 10 -sS -o /dev/null -w "%{http_code}" "$url" || true)"
      printf "%s\t%s\t%s\n" "$label" "$code" "$url"
      test "$code" = "200"
    }

    check_http public https://smartaihub.app/healthz
    check_http web_local http://127.0.0.1:3000/healthz
    check_http node_backend_local http://127.0.0.1:3001/healthz
    check_http python_backend_local http://127.0.0.1:8000/health

    systemctl show \
      smartspec-web.service \
      smartspec-backend.service \
      --property=Id,LoadState,ActiveState,SubState,NRestarts \
      --no-pager

    docker inspect smartspec-postgres \
      --format "name={{.Name}} state={{.State.Status}} running={{.State.Running}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}} restart={{.RestartCount}}"

    test "$(docker inspect smartspec-postgres --format "{{.State.Running}}")" = "true"
    test "$(docker inspect smartspec-postgres --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}")" = "healthy"
  ' | tee "$WSL_STAGE/server-application-health.txt"
```

Stop if any HTTP code is not `200`, either application service is not active,
PostgreSQL is not running/healthy, or a restart count is unexplained.

### Test 5 — Prove current memory state is suitable for read-only migration work

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    date -u +%FT%TZ
    free -b
    df -B1 /
    cat /proc/pressure/memory
    vmstat 1 5
    printf "%s\n" "=== kernel memory events: last 24 hours ==="
    journalctl -k --since "-24 hours" --no-pager 2>/dev/null |
      grep -Ei "oom|out of memory|memory cgroup" |
      tail -n 100 || true
    printf "%s\n" "=== kernel memory events: last hour ==="
    journalctl -k --since "-1 hour" --no-pager 2>/dev/null |
      grep -Ei "oom|out of memory|memory cgroup" || true
  ' | tee "$WSL_STAGE/server-memory-health.txt"
```

Stop if:

- a new OOM/memory-cgroup event occurred in the last hour;
- an OOM event is newer than the known SocratiCode stop baseline and remains
  unexplained;
- `full` memory PSI is currently non-zero and persists across samples;
- swap-in/swap-out is sustained across the `vmstat` samples;
- available memory is critically low; or
- application health changed during these checks.

Older recorded OOM events may be retained as incident evidence, but they do not
become a pass merely because the services currently answer.

## Read-only inventory procedure

Run this procedure only after Tests 1–5 pass.

### Step 1 — Record exact repository state without reading file contents

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    cd /home/dev/projects/SmartSpecPro
    printf "%s\n" "=== repository identity ==="
    git rev-parse --show-toplevel
    git rev-parse HEAD
    git branch --show-current
    git status --short --branch
    printf "%s\n" "=== sanitized origin ==="
    git remote get-url origin |
      sed -E "s#(https?://)[^/@]+@#\1REDACTED@#"
    printf "%s\n" "=== object database ==="
    git count-objects -vH
    printf "%s\n" "=== tracked working-file bytes ==="
    git ls-files -z |
      while IFS= read -r -d "" path; do
        if test -f "$path" || test -L "$path"; then
          stat -c "%s" -- "$path"
        fi
      done |
      awk "{sum += \$1; count += 1} END {printf \"files=%d bytes=%.0f\\n\", count, sum}"
  ' | tee "$WSL_STAGE/server-source-summary.txt"
```

Do not use `du` on the entire server worktree and do not copy its `.git`
directory. The planning baseline observed an apparent worktree footprint near
181–189 GiB and a large object database; neither belongs in the default
transfer route.

Capture machine-readable local-only path manifests:

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  'git -C /home/dev/projects/SmartSpecPro diff --name-only -z HEAD' \
  > "$WSL_STAGE/server-dirty-tracked-paths.nul"

ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  'git -C /home/dev/projects/SmartSpecPro diff --cached --name-only -z' \
  > "$WSL_STAGE/server-dirty-staged-paths.nul"

ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  'git -C /home/dev/projects/SmartSpecPro ls-files -z --others --exclude-standard' \
  > "$WSL_STAGE/server-untracked-candidates.nul"

chmod 600 \
  "$WSL_STAGE/server-dirty-tracked-paths.nul" \
  "$WSL_STAGE/server-dirty-staged-paths.nul" \
  "$WSL_STAGE/server-untracked-candidates.nul"

sha256sum \
  "$WSL_STAGE/server-dirty-tracked-paths.nul" \
  "$WSL_STAGE/server-dirty-staged-paths.nul" \
  "$WSL_STAGE/server-untracked-candidates.nul" \
  | tee "$WSL_STAGE/server-source-manifest-sha256.txt"

for manifest in \
  server-dirty-tracked-paths.nul \
  server-dirty-staged-paths.nul \
  server-untracked-candidates.nul
do
  printf '%s\t' "$manifest"
  tr -cd '\0' < "$WSL_STAGE/$manifest" | wc -c
done
```

These commands transfer only path names and hashes, not file contents. Treat
path manifests as confidential because filenames can reveal project context.

### Step 2 — Record image, volume, and collection metadata

```bash
ssh \
  -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" '
    set -eu
    docker image inspect \
      socraticode-mcp:1.8.11 \
      qdrant/qdrant:v1.17.0 \
      --format "tags={{json .RepoTags}} id={{.Id}} platform={{.Os}}/{{.Architecture}} size={{.Size}}"
    docker volume inspect socraticode_qdrant_data \
      --format "name={{.Name}} mountpoint={{.Mountpoint}}"

    if sudo -n true 2>/dev/null; then
      sudo -n du -sb \
        /var/lib/docker/volumes/socraticode_qdrant_data/_data
      sudo -n find \
        /var/lib/docker/volumes/socraticode_qdrant_data/_data/collections \
        -mindepth 1 -maxdepth 1 -type d -printf "%f\n" |
        sort
    else
      printf "%s\n" "sudo-n-unavailable: raw Qdrant size/collection directory inventory not collected"
    fi
  ' | tee "$WSL_STAGE/server-socraticode-storage.txt"
```

If `sudo -n` is unavailable, do not request or enter a password and do not
change permissions. Record the evidence gap. The gap must be resolved or
explicitly accepted before selecting the optional snapshot route; it does not
authorize starting Qdrant.

Expected collection families include `7651cae158e3` and `44e4cf618b3d`.
Only `7651cae158e3` is a candidate for this project, and fresh local reindex
remains the default.

### Step 3 — Reconcile inventory with the baseline

Compare and record:

- actual branch and commit versus the planning baseline;
- actual dirty tracked/staged/untracked counts;
- launcher mode and both launcher hashes;
- unit `ActiveState`/`UnitFileState`;
- running process and container counts;
- Qdrant state, restart policy, tag, image ID, platform, and volume size;
- collection directory names;
- SmartSpecPro service and PostgreSQL state/restart counts;
- HTTP health results;
- RAM, swap, PSI, disk, and OOM timestamps.

If the commit or dirty state changed, stop route selection until the user
confirms which commit and which exact dirty paths, if any, are intended. Do not
silently update `TARGET_COMMIT`.

## Data classification and transfer boundary

### Allowed by default

- a clean clone from the authoritative Git origin pinned to the reconciled
  commit;
- the three verified planning files;
- sanitized inventory text, null-delimited path manifests, and SHA-256 ledgers;
- new target-only Windows/WSL/Docker configuration created later; and
- a fresh local SocratiCode index.

### Allowed only after separate explicit approval

- a binary Git patch for exact approved tracked paths;
- exact approved untracked regular files, individually allowlisted;
- per-collection Qdrant snapshots created in a separate approved maintenance
  window; and
- emergency raw stopped-volume archive only under a new exceptional approval
  and documented reason snapshots are unavailable.

### Always excluded from this migration

- `.env`, `.env.*`, and any nested environment file;
- `.claude/**`, `~/.codex/**`, and machine-local MCP/Codex configuration;
- `.git/**` from the server worktree;
- SSH private keys, certificates containing private material, agent sockets;
- Docker `config.json`, registry credentials, auth tokens, cookies, passwords;
- `node_modules/**`, `dist/**`, `build/**`, `target/**`, and caches;
- uploads, media libraries, application databases, PostgreSQL/Redis volumes;
- logs, backups, crash/core dumps, and `orchestra/backups/**`;
- server Ollama data/model volume;
- the full server repository/worktree;
- server absolute runtime configuration and Linux launcher; and
- the stale/other Qdrant collection family unless separately investigated and
  approved as a different migration.

The tracked `.claude/settings.local.json` is explicitly excluded from any
dirty-work patch.

## Verification-first policy tests

Use this local WSL function to reject synthetic and real candidate paths before
creating any approval list:

```bash
is_forbidden_transfer_path() {
  path="$1"

  case "$path" in
    ""|/*|../*|*/../*|*/..|..)
      return 0
      ;;
    .env|.env.*|*/.env|*/.env.*)
      return 0
      ;;
    .git/*|.claude/*|.codex/*|*/.codex/*)
      return 0
      ;;
    node_modules/*|*/node_modules/*|dist/*|*/dist/*|build/*|*/build/*|target/*|*/target/*)
      return 0
      ;;
    uploads/*|*/uploads/*|logs/*|*/logs/*|backups/*|*/backups/*|orchestra/backups/*)
      return 0
      ;;
    *.key|*.pem|id_rsa|id_ed25519|core|core.*|*.core)
      return 0
      ;;
  esac

  return 1
}

for candidate in \
  ".env.production" \
  "apps/web/.env" \
  ".claude/settings.local.json" \
  "../outside" \
  "/absolute/path" \
  "apps/web/node_modules/package.json" \
  "orchestra/backups/state.tar" \
  "id_ed25519"
do
  if ! is_forbidden_transfer_path "$candidate"; then
    printf 'Policy test failed to reject: %s\n' "$candidate" >&2
    exit 41
  fi
done

if is_forbidden_transfer_path "apps/web/src/App.tsx"; then
  printf '%s\n' "Policy test rejected a normal source path." >&2
  exit 42
fi
```

Before accepting any future newline-delimited tracked allowlist:

```bash
while IFS= read -r path; do
  test -n "$path"
  if is_forbidden_transfer_path "$path"; then
    printf 'Forbidden approved path: %s\n' "$path" >&2
    exit 43
  fi
done < "$WSL_STAGE/approved-tracked-paths.txt"
```

Do not create `approved-tracked-paths.txt` merely to make this test pass. It is
created only after the user approves exact paths.

## Route decision and approvals

The executor presents the inventory summary to the user before recording these
values:

```yaml
source_route: github_clone
include_dirty_tracked: false
include_dirty_untracked: false
qdrant_route: fresh_reindex
ollama_route: native_when_gpu_available_otherwise_docker
destructive_cleanup: false
```

The default recommendation is:

- `github_clone`;
- no dirty tracked or untracked transfer;
- `fresh_reindex`;
- native local Ollama when a supported Windows GPU path is verified, otherwise
  a resource-limited local Docker Ollama; and
- no destructive cleanup.

Decision requirements:

1. `TARGET_COMMIT` is the exact reconciled commit, not automatically the older
   planning baseline.
2. `include_dirty_tracked: true` requires a separate approval containing exact
   repository-relative paths.
3. `include_dirty_untracked: true` requires a separate approval containing
   exact regular-file paths; directory-only approvals are invalid.
4. `qdrant_route: snapshots` requires a separate server Qdrant maintenance
   approval with start/end time. Approval is recorded here, but Qdrant is not
   started in this section.
5. Raw volume transfer is not a normal route and cannot be implied by snapshot
   approval.
6. `destructive_cleanup` remains `false`; cleanup is a future task.

## Optional Qdrant snapshot boundary

If the user selects snapshots, record but do not execute:

- source Qdrant exact version/tag/image ID/platform;
- stopped container state and restart policy;
- source volume name and measured bytes;
- approved collection list, normally the `7651cae158e3` family plus
  `socraticode_metadata` only when compatibility review proves it is required;
- embedding provider `ollama`, model `nomic-embed-text`, and dimension `768`;
- stable target project identity decision;
- approved maintenance window;
- requirement to bind temporary source Qdrant only to loopback;
- requirement to stop it immediately after snapshot creation;
- requirement for per-snapshot SHA-256;
- target Qdrant compatibility on the same `1.17.x` minor line; and
- automatic fallback to fresh reindex on version, embedding, project identity,
  collection, or indexed-path mismatch.

Any server Qdrant start belongs to a later, separately approved execution step.
Do not include a start command in G3/G4 evidence.

## Expected evidence

Store sanitized evidence in `evidence-manifest.yaml` and these local WSL files:

- `server-identity-phase02.txt`;
- `server-socraticode-units.txt`;
- `server-socraticode-processes.txt`;
- `server-socraticode-containers.txt`;
- `server-application-health.txt`;
- `server-memory-health.txt`;
- `server-source-summary.txt`;
- `server-dirty-tracked-paths.nul`;
- `server-dirty-staged-paths.nul`;
- `server-untracked-candidates.nul`;
- `server-source-manifest-sha256.txt`; and
- `server-socraticode-storage.txt`.

The working manifest must include:

- inventory UTC timestamp;
- server branch/commit and dirty counts;
- sanitized origin identity;
- launcher mode/hash;
- unit states;
- process and managed-container counts;
- Qdrant state/restart policy/image ID/platform/volume bytes/collections;
- application/PostgreSQL health and restart counts;
- memory/swap/PSI/disk/OOM assessment;
- selected source/Qdrant/Ollama routes;
- dirty-work approvals and exact approved paths, if any;
- Qdrant snapshot-window approval, if any;
- explicit `destructive_cleanup: false`;
- deviations and unresolved evidence gaps; and
- G3/G4 status.

Never save raw credential-bearing remote URLs, environment content, database
content, private keys, tokens, cookies, or Docker authentication.

## Gate decisions

### G3 — Server baseline

Pass only when:

- server identity still matches G0;
- launcher mode is `000`/`0`;
- watch/index/timer units are disabled/inactive and the cleanup service is
  static-or-disabled/inactive;
- no SocratiCode/Qdrant process is active;
- zero managed MCP containers are running;
- `socraticode-qdrant` is exited with restart policy `no`;
- public/local/backend/PostgreSQL health passes;
- memory pressure is not elevated and no new unresolved OOM exists;
- inventory differences are reconciled; and
- all commands were read-only.

### G4 — Data lane

Pass only when:

- exact `TARGET_COMMIT` is recorded;
- source route is explicit;
- dirty tracked/untracked choices are explicit;
- every approved dirty path, if any, passes the exclusion policy;
- Qdrant route is explicit;
- snapshot approval is separately recorded when selected;
- Ollama route is explicit;
- raw-volume migration remains unselected by default;
- destructive cleanup remains false; and
- no source or data content has yet been transferred.

## Stop conditions

Stop immediately if:

- SSH identity differs from G0;
- launcher mode is executable or either launcher hash changed unexpectedly;
- any SocratiCode unit is active/enabled or has an unexplained state;
- any SocratiCode/Qdrant process or managed MCP container is active;
- Qdrant is running, restart policy is not `no`, or image identity drift is
  unexplained;
- SmartSpecPro web/backend/public health or PostgreSQL is not green;
- a new OOM, sustained swap activity, elevated PSI, low available memory, or
  service restart appears;
- source commit/dirty state changed and has not been reconciled;
- a command would need to mutate the server;
- a transfer route includes a forbidden path/data class;
- the user has not explicitly approved dirty data or snapshot choices;
- a hash/evidence file is incomplete or cannot be protected; or
- any secret appears in captured output.

On failure, mark the gate `fail`, preserve sanitized local evidence, and do not
proceed to source transfer or local runtime creation.

## Rollback

This section is read-only on the server, so server rollback is neither required
nor permitted.

Local rollback:

1. Preserve the sanitized failure manifest and hashes.
2. Remove only incomplete local inventory outputs if they contain secrets;
   record why and regenerate them safely.
3. Do not delete approved evidence, source data, Docker volumes, or unrelated
   local files.
4. Do not start or re-enable server SocratiCode as a fallback.
5. If production health is degraded, stop the migration and hand the condition
   to the separate incident-recovery process; do not repair production under
   this migration plan.

Rollback success is proven when the server state is unchanged and the local
manifest accurately records the failed gate.

## Exit criteria

Proceed to `section-03-source-transfer.md` only when:

- G3 and G4 are `pass`;
- G0–G4 form an unbroken evidence chain;
- the user has seen the live inventory summary;
- the selected route and all required approvals are recorded;
- no excluded data or secret crossed the boundary; and
- SocratiCode remains fully stopped on the server.
