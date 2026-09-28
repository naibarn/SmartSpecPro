# Section 01 — Secure Bootstrap and Windows/WSL/Docker Preflight

> Execution status: **PLAN ONLY — do not run until the user explicitly
> authorizes migration execution.**
>
> Executor: Codex on the current Windows client.
>
> This section owns gates G0, G1, and G2. It performs only read-only SSH checks
> and local Windows/WSL preparation. It does not start or change anything on the
> server.

## Objective

Establish a verified SSH trust path to the correct server, copy the three
canonical handoff files with matching SHA-256 hashes, create a protected WSL
evidence area, and prove that the selected Windows/WSL 2/Docker Desktop target
has the correct architecture, tools, resource ceilings, path placement, and
free disk before any source or data transfer.

Successful completion means:

- the server identity is independently verified;
- the copied plan is byte-for-byte identical to the server copy;
- the selected distribution is WSL 2;
- Docker Desktop is serving Linux containers inside that distribution;
- the future repository path is under WSL `/home`, not `/mnt/c`;
- Node.js, npm, Git, SSH, Docker, and Compose are usable inside WSL;
- WSL has explicit RAM/CPU/swap ceilings that leave sufficient Windows
  headroom;
- the calculated disk requirement passes; and
- `evidence-manifest.yaml` records G0, G1, and G2.

## Safety boundary

This section permits:

- reading the local SSH known-host entry;
- one strict, non-interactive read-only SSH connection;
- copying only the planning handoff files;
- creating a new local Windows and WSL staging directory;
- reading Windows, WSL, Docker, and filesystem state;
- backing up and, only when required, editing the local `.wslconfig`; and
- restarting WSL with `wsl --shutdown` after the local configuration backup is
  recorded.

This section forbids:

- accepting an unknown host key interactively;
- using `ssh-keyscan` as proof of server identity;
- password fallback when SSH-key authentication was expected;
- enabling agent forwarding;
- copying SSH private keys or server/client configuration;
- running the SocratiCode launcher through SSH;
- starting server Qdrant, Ollama, watchers, indexers, timers, or containers;
- copying the source repository or any Docker volume;
- changing SmartSpecPro or PostgreSQL; and
- running a command that still contains a literal `<PLACEHOLDER>`.

## Entry criteria

All of the following must be true before execution:

1. The user has explicitly authorized migration execution; possession of this
   file alone is not authorization.
2. The user has supplied the intended SSH alias or hostname.
3. The user has verified the server SSH host-key fingerprint through a trusted
   channel independent of this SSH session.
4. Windows Codex is running in the intended user account.
5. The canonical remote directory is expected to be:
   `/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration`.
6. No destructive cleanup is authorized.

Record these initial values in a temporary local note before interpolating any
command:

```text
SERVER_SSH_ALIAS=
SERVER_USER=dev
EXPECTED_SERVER_HOSTNAME=
VERIFIED_HOST_KEY_ALGORITHM=
VERIFIED_HOST_KEY_FINGERPRINT=
WSL_DISTRO=
WSL_USER=
```

If any value needed by the next command is empty or still contains angle
brackets, stop and obtain or discover the real value.

## Verification-first tests

Run the tests in this order. A failed test is a stop condition, not a prompt to
weaken the check.

### Test 1 — Required Windows commands exist

Run in a normal, non-elevated PowerShell:

```powershell
$ErrorActionPreference = "Stop"
Get-Command ssh, scp, ssh-keygen, wsl, docker, git |
  Select-Object Name, Source, Version
ssh -V
```

Expected:

- every command resolves;
- OpenSSH client is present;
- no command resolves to an unexpected wrapper or unknown network location.

### Test 2 — Known-host identity matches the trusted fingerprint

Assign only verified real values:

```powershell
$ServerAlias = "REAL_VERIFIED_SSH_ALIAS"
$ServerUser = "dev"
$Server = "$ServerUser@$ServerAlias"
$ExpectedServerHostname = "REAL_EXPECTED_SERVER_HOSTNAME"
$VerifiedHostKeyAlgorithm = "REAL_VERIFIED_KEY_ALGORITHM"
$VerifiedHostKeyFingerprint = "REAL_VERIFIED_SHA256_FINGERPRINT"

if ($ServerAlias -match '[<>]' -or
    $ExpectedServerHostname -match '[<>]' -or
    $VerifiedHostKeyFingerprint -match '[<>]' -or
    [string]::IsNullOrWhiteSpace($ServerAlias) -or
    [string]::IsNullOrWhiteSpace($VerifiedHostKeyFingerprint)) {
  throw "A required verified SSH value is missing or still a placeholder."
}

ssh-keygen -F $ServerAlias
ssh-keygen -F $ServerAlias |
  Where-Object { $_ -notmatch '^#' } |
  ssh-keygen -lf -
```

Compare the algorithm and SHA-256 fingerprint shown for the existing known-host
entry with the independently verified values. Do not add or replace a host key
inside this runbook. If there is no verified matching entry, stop for the user
to resolve SSH trust.

### Test 3 — Strict read-only server identity

```powershell
$RemotePlanDir = "/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration"

$IdentityOutput = ssh `
  -o BatchMode=yes `
  -o PasswordAuthentication=no `
  -o KbdInteractiveAuthentication=no `
  -o StrictHostKeyChecking=yes `
  -o ForwardAgent=no `
  $Server `
  "hostname; id -un; id -u; test -r '$RemotePlanDir/MIGRATION_PLAN.md'; sha256sum '$RemotePlanDir/MIGRATION_PLAN.md'"

$IdentityOutput
if ($LASTEXITCODE -ne 0) {
  throw "Strict read-only SSH identity check failed."
}
```

Expected:

- hostname equals `$ExpectedServerHostname`;
- account name is `dev`;
- the UID is recorded;
- the canonical plan exists and hashes successfully;
- authentication does not prompt for a password.

Record the timestamp, hostname, user, UID, key algorithm, independently verified
fingerprint, and remote plan hash. Mark G0 pass only after the human-readable
identity comparison is complete.

## Procedure

### Step 1 — Create an isolated Windows staging directory

This is the first local mutation:

```powershell
$RunId = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ") + "-socraticode"
$WindowsStage = Join-Path $env:USERPROFILE "socraticode-migration\$RunId"

if (Test-Path $WindowsStage) {
  throw "Run staging directory already exists; choose a new run ID."
}

New-Item -ItemType Directory -Path $WindowsStage | Out-Null
```

Record `RUN_ID` and `WINDOWS_STAGE`.

### Step 2 — Produce the remote hash ledger

```powershell
$HandoffFiles = @(
  "MIGRATION_PLAN.md",
  "WINDOWS_CODEX_HANDOFF.md",
  "evidence-manifest.template.yaml"
)

$RemoteHashFile = Join-Path $WindowsStage "remote-plan-sha256.txt"
$RemoteHashCommand =
  "cd '$RemotePlanDir' && sha256sum " +
  (($HandoffFiles | ForEach-Object { "'$_'" }) -join " ")

ssh `
  -o BatchMode=yes `
  -o PasswordAuthentication=no `
  -o KbdInteractiveAuthentication=no `
  -o StrictHostKeyChecking=yes `
  -o ForwardAgent=no `
  $Server `
  $RemoteHashCommand |
  Set-Content -Encoding ascii $RemoteHashFile

if ($LASTEXITCODE -ne 0) {
  throw "Remote hash ledger failed."
}
Get-Content $RemoteHashFile
```

The remote command reads only the planning directory.

### Step 3 — Copy only the handoff files

```powershell
foreach ($File in $HandoffFiles) {
  scp `
    -o BatchMode=yes `
    -o PasswordAuthentication=no `
    -o KbdInteractiveAuthentication=no `
    -o StrictHostKeyChecking=yes `
    -o ForwardAgent=no `
    "${Server}:${RemotePlanDir}/$File" `
    $WindowsStage

  if ($LASTEXITCODE -ne 0) {
    throw "Copy failed for $File."
  }
}

$LocalHashes = Get-FileHash -Algorithm SHA256 `
  ($HandoffFiles | ForEach-Object { Join-Path $WindowsStage $_ })
$LocalHashes | Format-Table Hash, Path -AutoSize
```

Compare every local hash against `remote-plan-sha256.txt`. Do not compare only
the main runbook.

Pass G1 only when all three hashes match. Then create a working manifest while
retaining the template unchanged:

```powershell
$ManifestTemplate = Join-Path $WindowsStage "evidence-manifest.template.yaml"
$ManifestWorking = Join-Path $WindowsStage "evidence-manifest.yaml"

if (Test-Path $ManifestWorking) {
  throw "Working manifest already exists; do not overwrite evidence."
}
Copy-Item -LiteralPath $ManifestTemplate -Destination $ManifestWorking
```

Update the working manifest with G0/G1 evidence. Never place private keys,
passwords, passphrases, tokens, cookies, `.env` content, or Docker credentials
in it.

### Step 4 — Inventory Windows, WSL, and Docker Desktop

Assign the selected real distribution name:

```powershell
$WslDistro = "REAL_SELECTED_WSL_DISTRO"
if ($WslDistro -match '[<>]' -or [string]::IsNullOrWhiteSpace($WslDistro)) {
  throw "WSL distribution is missing or still a placeholder."
}

Get-ComputerInfo |
  Select-Object WindowsProductName, WindowsVersion, OsBuildNumber,
    CsTotalPhysicalMemory, CsNumberOfLogicalProcessors
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

Expected:

- the selected distribution reports version `2`;
- Docker reports `linux`;
- Docker architecture is recorded;
- the Docker daemon responds without switching to Windows-container mode;
- Windows RAM, logical CPU count, and free disk are recorded.

Record the Docker Desktop application version when installed at the standard
path:

```powershell
$DockerDesktopExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
if (Test-Path $DockerDesktopExe) {
  (Get-Item $DockerDesktopExe).VersionInfo |
    Select-Object ProductVersion, FileVersion
}
```

### Step 5 — Create and protect the WSL evidence area

Run the following from the selected WSL distribution. Substitute real values
first:

```bash
set -euo pipefail

export RUN_ID="REAL_RUN_ID"
export SERVER="dev@REAL_VERIFIED_SSH_ALIAS"
export REMOTE_PLAN_DIR="/home/dev/projects/SmartSpecPro/planning/socraticode-windows-docker-migration"
export WSL_USER="REAL_WSL_USER"
export WSL_STAGE="/home/$WSL_USER/socraticode-migration/$RUN_ID"
export WSL_REPO="/home/$WSL_USER/projects/SmartSpecPro"

for value in "$RUN_ID" "$SERVER" "$WSL_USER" "$WSL_STAGE" "$WSL_REPO"; do
  case "$value" in
    ""|*"<"*|*">"*|*REAL_*)
      printf 'Unresolved value: %s\n' "$value" >&2
      exit 2
      ;;
  esac
done

case "$WSL_STAGE" in
  /home/"$WSL_USER"/socraticode-migration/*) ;;
  *) printf 'Unsafe WSL staging path: %s\n' "$WSL_STAGE" >&2; exit 2 ;;
esac

case "$WSL_REPO" in
  /home/"$WSL_USER"/*) ;;
  *) printf 'Repository must be under WSL /home: %s\n' "$WSL_REPO" >&2; exit 2 ;;
esac

test ! -e "$WSL_STAGE"
umask 077
mkdir -p "$WSL_STAGE"
chmod 700 "$WSL_STAGE"

scp -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER:$REMOTE_PLAN_DIR/MIGRATION_PLAN.md" \
  "$SERVER:$REMOTE_PLAN_DIR/WINDOWS_CODEX_HANDOFF.md" \
  "$SERVER:$REMOTE_PLAN_DIR/evidence-manifest.template.yaml" \
  "$WSL_STAGE/"

(
  cd "$WSL_STAGE"
  sha256sum \
    MIGRATION_PLAN.md \
    WINDOWS_CODEX_HANDOFF.md \
    evidence-manifest.template.yaml
) > "$WSL_STAGE/wsl-plan-sha256.txt"

ssh -o BatchMode=yes \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o StrictHostKeyChecking=yes \
  -o ForwardAgent=no \
  "$SERVER" \
  "cd '$REMOTE_PLAN_DIR' &&
   sha256sum MIGRATION_PLAN.md WINDOWS_CODEX_HANDOFF.md evidence-manifest.template.yaml" \
  > "$WSL_STAGE/remote-plan-sha256-wsl.txt"

diff -u \
  "$WSL_STAGE/remote-plan-sha256-wsl.txt" \
  "$WSL_STAGE/wsl-plan-sha256.txt"

cp --no-clobber \
  "$WSL_STAGE/evidence-manifest.template.yaml" \
  "$WSL_STAGE/evidence-manifest.yaml"
chmod 600 "$WSL_STAGE/evidence-manifest.yaml"
```

Compare the WSL hashes with the remote hash ledger before continuing.

### Step 6 — Prove the WSL toolchain and path model

Run inside the selected WSL distribution:

```bash
set -euo pipefail
uname -a
uname -m
id
printf 'WSL_INTEROP=%s\n' "${WSL_INTEROP:-unset}"
free -b
df -BT1 /
df -BT1 "$HOME"
stat -f -c 'filesystem=%T path=%m' "$HOME"
docker version
docker info --format '{{.OSType}} {{.Architecture}} {{.DockerRootDir}}'
docker compose version
node --version
npm --version
git --version
ssh -V
sha256sum --version | head -n 1

test -n "${WSL_INTEROP:-}"
test "$(docker info --format '{{.OSType}}')" = "linux"
node -e 'const major=Number(process.versions.node.split(".")[0]); if (major < 18) process.exit(1)'
case "$WSL_REPO" in /home/*) ;; *) exit 1 ;; esac
case "$WSL_REPO" in /mnt/*) exit 1 ;; esac
```

Expected:

- kernel/interop evidence confirms WSL;
- distribution is version 2 from the PowerShell inventory;
- architecture is recorded;
- `$HOME` and `WSL_REPO` resolve to the WSL Linux filesystem;
- Docker and Compose work from WSL;
- Node.js is version 18 or newer.

Do not create the repository yet.

### Step 7 — Establish bounded WSL resources

Read the current configuration first:

```powershell
$WslConfig = Join-Path $env:USERPROFILE ".wslconfig"
if (Test-Path $WslConfig) {
  Get-Content -LiteralPath $WslConfig
} else {
  Write-Output ".wslconfig does not exist"
}
```

Choose a ceiling from measured host capacity, leaving at least 8 GiB and
preferably 12 GiB for Windows and other applications:

| Host RAM | Initial WSL memory cap | Initial swap cap |
|---:|---:|---:|
| 16 GiB | 8 GiB | 4 GiB |
| 32 GiB | 16 GiB | 8 GiB |
| 64 GiB | 24–32 GiB | 8 GiB |
| More than 64 GiB | 40–50% of host RAM | 8–16 GiB |

Record the chosen `memory`, `processors`, `swap`, and optional
`autoMemoryReclaim` value in the manifest before editing.

If a change is required, create a timestamped local backup first:

```powershell
$WslConfigBackup = "$WslConfig.$RunId.bak"
if (Test-Path $WslConfig) {
  Copy-Item -LiteralPath $WslConfig -Destination $WslConfigBackup
}
```

Edit only the local `%UserProfile%\.wslconfig` so its `[wsl2]` block contains
the approved numeric ceilings. Preserve unrelated existing keys. Example shape,
not a value-selection instruction:

```ini
[wsl2]
memory=16GB
processors=8
swap=8GB

[experimental]
autoMemoryReclaim=gradual
```

Applying the local change stops all WSL distributions, so record that this is
safe for current local work before running:

```powershell
wsl --shutdown
```

Restart the selected distribution and re-run:

```bash
free -b
nproc
cat /proc/meminfo | sed -n '1,5p'
docker info --format '{{.OSType}} {{.Architecture}} {{.DockerRootDir}}'
```

Stop if the observed RAM/CPU/swap values do not match the approved ceilings or
if Docker integration fails after restart.

### Step 8 — Calculate disk headroom before transfer

Use numeric values from the manifest; do not execute textual placeholders.
The required free space is:

```text
source checkout
+ required Docker images
+ 2 × expected peak Qdrant data
+ snapshot/cold-backup size when Route C is selected
+ 20% operational headroom
```

Until Section 02 measures the authoritative server/source data, use a
conservative non-zero default-route estimate. The planning baseline supports
the following minimum reserve: 25 GiB for clone/history and checkout, 10 GiB
for images/models, 8 GiB Qdrant peak counted twice, plus 20% headroom. This
requires approximately 62 GiB free; round the gate up to at least 64 GiB.
Section 02 must recalculate upward when live inventory or the snapshot route
requires more. Check three related capacities separately: the WSL filesystem
that holds the repository/staging area, Docker Desktop's configured disk-image
allocation and current use, and the Windows drive that backs their VHDX files:

```bash
df -B1 "$HOME"
docker system df -v
```

Record Docker Desktop's disk-image location and configured maximum from Docker
Desktop settings, then verify free space on the backing Windows drive. Do not
assume `df "$HOME"` represents Docker Desktop's virtual-disk capacity.

After assigning numeric byte values, calculate without shell `eval`:

```bash
SOURCE_BYTES=26843545600
IMAGE_BYTES=10737418240
QDRANT_PEAK_BYTES=8589934592
SNAPSHOT_BACKUP_BYTES=0
TARGET_FREE_BYTES="$(df -B1 --output=avail "$HOME" | tail -n 1 | tr -d ' ')"

BASE_BYTES=$((SOURCE_BYTES + IMAGE_BYTES + (2 * QDRANT_PEAK_BYTES) + SNAPSHOT_BACKUP_BYTES))
REQUIRED_BYTES=$((BASE_BYTES + (BASE_BYTES / 5)))

printf 'target_free_bytes=%s\nrequired_bytes=%s\n' \
  "$TARGET_FREE_BYTES" "$REQUIRED_BYTES"
test "$TARGET_FREE_BYTES" -ge "$REQUIRED_BYTES"
```

Increase these values when measured evidence is higher. Zero is never accepted
for source, images, or Qdrant.

## Expected evidence

Store the following in `evidence-manifest.yaml` and sanitized files under
`WSL_STAGE`:

- run ID and UTC timestamps;
- server alias, expected hostname, actual hostname, user, and UID;
- host-key algorithm and independently verified fingerprint;
- remote, Windows, and WSL SHA-256 for all three handoff files;
- Windows product/build, RAM, CPU count, and free disk;
- selected WSL distribution/user/version/kernel/architecture/filesystem;
- Docker Desktop, Engine, Compose, Node, npm, Git, and OpenSSH versions;
- Docker context, Linux-container status, architecture, and disk use;
- WSL memory/CPU/swap caps and evidence that the caps took effect;
- Windows/WSL staging paths and future repository path;
- disk requirement inputs, formula result, and actual free bytes;
- any preflight deviation and its approval; and
- gate status for G0, G1, and G2.

Evidence files must be mode `600` or live under a mode-`700` WSL directory.
Sanitize commands before saving them. Never store key material or secrets.

## Gate decisions

### G0 — SSH identity

Pass only when the known-host key matches the independently verified
fingerprint and the strict non-interactive session returns the expected
hostname/account.

### G1 — Plan copy

Pass only when the remote, Windows, and WSL SHA-256 hashes match for all three
handoff files and the working manifest was created without overwriting the
template.

### G2 — Windows preflight

Pass only when:

- WSL version 2 is proven;
- Docker reports Linux containers and works inside WSL;
- source and evidence paths are under WSL `/home`;
- Node.js is version 18 or newer;
- required tools work;
- WSL ceilings are explicit and effective;
- Windows retains sufficient RAM headroom;
- disk calculation passes with non-zero measured inputs; and
- no server mutation occurred.

## Stop conditions

Stop immediately if any of these occur:

- host key is missing, unknown, changed, or mismatched;
- hostname or remote user differs from the expected identity;
- SSH requests a password or enables agent forwarding;
- canonical plan is missing;
- any handoff hash differs;
- a copied file falls outside the three-file allowlist;
- the selected distribution is not WSL 2;
- Docker is in Windows-container mode or unavailable inside WSL;
- the repository path is on `/mnt/c` or another Windows-mounted filesystem;
- Node.js is older than 18;
- WSL ignores the approved resource ceiling;
- the ceiling leaves less than the approved Windows headroom;
- free disk is below the calculated requirement;
- a command contains an unresolved placeholder; or
- any action would start or change a server component.

On failure, mark the affected gate `fail`, record sanitized evidence and the
reason, and do not enter Section 02.

## Rollback

Rollback is local only:

1. Delete only an incomplete run-specific Windows/WSL staging directory after
   preserving the failure evidence the user wants to retain.
2. If `.wslconfig` was changed, restore the timestamped local backup (or remove
   the newly created file when no prior file existed), run `wsl --shutdown`,
   restart WSL, and re-check resources.
3. Do not alter the SSH known-host entry automatically; identity disputes are
   resolved by the user.
4. Do not delete Docker Desktop data, volumes, repositories, or unrelated local
   configuration.
5. Do not start, enable, or repair SocratiCode on the server.

Rollback success is proven when the prior local WSL configuration is restored
and the server has not been mutated.

## Exit criteria

Proceed to
`section-02-server-inventory-data-boundary.md` only when G0, G1, and G2 are
recorded as `pass`, the manifest contains no secrets, and the executor reports
the verified target, preflight summary, and any remaining approval gates to the
user.
