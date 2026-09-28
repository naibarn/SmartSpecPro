# Section 03 — Safe Source Transfer

> Status: **PLAN ONLY — DO NOT EXECUTE WITHOUT USER APPROVAL**
>
> Executor: Codex on the user's Windows machine, operating from the selected
> WSL 2 distribution.
>
> Depends on: Section 01 and Section 02, including passed Gates G0-G4.
>
> Produces: a verified SmartSpecPro source tree in the WSL Linux filesystem and
> the evidence required to pass Gate G5.

## 1. Outcome and boundary

Create a new local SmartSpecPro checkout at the exact server baseline commit.
The required/default route is a clean clone from the authoritative Git remote.
Current server working-tree changes are separate, optional transfer lanes:

- tracked changes are transferred only as reviewed binary patches;
- untracked files are transferred only from an exact, reviewed file allowlist;
- every artifact and accepted file is checksummed;
- the complete server worktree, server `.git` directory, and production data
  are never copied.

This section does not transfer Qdrant, Ollama data, Docker images, application
databases, uploads, production volumes, credentials, or server runtime
configuration. It does not start or change any server service.

## 2. Entry criteria

Do not begin until the evidence manifest records all of the following:

- G0-G3 are `pass`;
- server host identity and account have been verified;
- the source repository commit and branch were re-recorded read-only;
- SocratiCode remains disabled/stopped on the server;
- SmartSpecPro and PostgreSQL health checks are green;
- server memory pressure is acceptable;
- G4 records the selected source route;
- G4 records explicit `true` or `false` values for tracked and untracked dirty
  work;
- `TARGET_COMMIT` is a full 40-character commit ID, not a branch name;
- `WSL_REPO` is a new path below `/home/<WSL_USER>/`, not `/mnt/c`;
- enough local disk remains for the checkout, transfer staging, index, and
  rollback/quarantine reserve.

Required variables:

```bash
export RUN_ID="<RECORDED_RUN_ID>"
export SERVER="dev@<VERIFIED_SERVER_SSH_ALIAS>"
export SERVER_REPO="/home/dev/projects/SmartSpecPro"
export WSL_STAGE="/home/<WSL_USER>/socraticode-migration/$RUN_ID"
export WSL_REPO="/home/<WSL_USER>/projects/SmartSpecPro"
export TARGET_COMMIT="<40_CHARACTER_COMMIT_FROM_GATE_G3>"
export SOURCE_REMOTE="git@github.com:naibarn/SmartSpecPro.git"
```

Before using any command, Codex must replace every placeholder and print only
non-secret variable values into the evidence log. Never print private keys,
tokens, credential-bearing remote URLs, or SSH configuration contents.

## 3. Non-negotiable exclusions

Reject a tracked or untracked transfer candidate if it is, contains, or lives
under any of the following:

- `.env`, `.env.*`, or an `.env*` file in any subdirectory;
- `.git/**`, `.claude/**`, `~/.codex/**`, or
  `.claude/settings.local.json`;
- SSH private keys, private certificates, tokens, cookies, credentials, or
  Docker authentication/configuration;
- `node_modules/**`, `dist/**`, `build/**`, `target/**`, package caches, Python
  virtual environments, or other reproducible generated output;
- uploads, media libraries, databases, logs, backups, crash/core dumps, or
  production application data;
- `orchestra/backups/**`;
- migration staging/evidence files containing machine-specific or confidential
  execution information;
- a symlink, device, socket, named pipe, directory entry, absolute path, parent
  traversal, Git pathspec magic, or any path that resolves outside
  `SERVER_REPO`.

Do not use `scp -r`, worktree-wide `rsync`, a full server `.git` clone, `tar` of
the repository root, `git reset --hard`, `git clean`, or a destructive
checkout.

## 4. Verification-first test matrix

Run the test in each row before the associated mutation. Record the command,
sanitized result, timestamp, and `pass`/`fail` status.

| Test | Expected result | Mutation blocked on failure |
|---|---|---|
| Source gate test | G3 and G4 are `pass` | All transfer |
| Local path test | `WSL_REPO` is below `/home` and does not exist | Clone |
| Capacity test | Planned disk reserve remains available | Clone |
| Server commit test | Server `HEAD` equals `TARGET_COMMIT` | Clone/patch |
| Remote reachability test | Exact commit is obtainable from selected source | Checkout |
| Clean baseline test | Target `HEAD` matches and status is empty | Dirty transfer |
| Tracked allowlist test | Every changed path is approved and not excluded | Patch creation |
| Patch safety test | Hash recorded, paths reviewed, `git apply --check` passes | Patch apply |
| Untracked allowlist test | Exact regular files only; no excluded path/symlink | Archive creation |
| Archive safety test | Listing equals allowlist; hash and type checks pass | Extraction |
| Secret scan test | No unresolved secret/private material finding | Acceptance |
| Reconciliation test | Commit, status, patch hashes, and file hashes match | G5 |

A failed test is a stop condition, not a prompt to weaken the check.

## 5. Establish a clean local baseline

### 5.1 Pre-mutation assertions

Run inside the selected WSL distribution:

```bash
set -euo pipefail

: "${RUN_ID:?}"
: "${SERVER:?}"
: "${SERVER_REPO:?}"
: "${WSL_STAGE:?}"
: "${WSL_REPO:?}"
: "${TARGET_COMMIT:?}"
: "${SOURCE_REMOTE:?}"

case "$WSL_REPO" in
  /home/*) ;;
  *) echo "STOP: WSL_REPO must be in the WSL Linux filesystem" >&2; exit 1 ;;
esac

test "${#TARGET_COMMIT}" -eq 40
printf '%s' "$TARGET_COMMIT" | grep -Eq '^[0-9a-fA-F]{40}$'
test -d "$WSL_STAGE"
test ! -e "$WSL_REPO"
df -hT "$(dirname "$WSL_REPO")"
git --version
```

Reconfirm the remote commit without modifying the server:

```bash
SERVER_HEAD="$(
  ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
    "git -C '$SERVER_REPO' rev-parse HEAD"
)"
test "$SERVER_HEAD" = "$TARGET_COMMIT"
printf 'server_head=%s\n' "$SERVER_HEAD"
```

Stop if the commit changed. Return to Section 02 and reconcile the new source
state; do not silently update `TARGET_COMMIT`.

### 5.2 Required/default route: clone from the authoritative Git remote

Use the authoritative Git remote rather than the 181-189 GiB server worktree:

```bash
mkdir -p "$(dirname "$WSL_REPO")"
git clone --no-checkout "$SOURCE_REMOTE" "$WSL_REPO"
git -C "$WSL_REPO" cat-file -e "$TARGET_COMMIT^{commit}"
git -C "$WSL_REPO" checkout --detach "$TARGET_COMMIT"
```

If the exact commit is not present, stop. Do not substitute the tip of `main`.
Record the remote URL only after confirming it contains no embedded credential:

```bash
git -C "$WSL_REPO" remote get-url origin
git -C "$WSL_REPO" rev-parse HEAD
git -C "$WSL_REPO" status --porcelain=v1
```

Required assertions:

```bash
test "$(git -C "$WSL_REPO" rev-parse HEAD)" = "$TARGET_COMMIT"
test -z "$(git -C "$WSL_REPO" status --porcelain=v1)"
```

Record the commit, object format, clean status, filesystem path, and checkout
size. Do not run package installation or build steps in this section.

### 5.3 Fallback route: shallow clone through verified SSH

Use this only when G4 explicitly selects `server_shallow_clone` because the
authoritative Git remote is unavailable:

```bash
git clone --depth 1 --no-checkout \
  "$SERVER:$SERVER_REPO" "$WSL_REPO"
git -C "$WSL_REPO" cat-file -e "$TARGET_COMMIT^{commit}"
git -C "$WSL_REPO" checkout --detach "$TARGET_COMMIT"
test "$(git -C "$WSL_REPO" rev-parse HEAD)" = "$TARGET_COMMIT"
test -z "$(git -C "$WSL_REPO" status --porcelain=v1)"
```

Stop if the shallow clone does not contain `TARGET_COMMIT`. Do not remove
`--depth 1` or copy the server's roughly 20 GiB `.git` history without a new
explicit approval and capacity review.

## 6. Optional tracked-work transfer

Skip this entire section when `include_dirty_tracked: false`.

### 6.1 Approval artifact

Create `approved-tracked-paths.txt` in `WSL_STAGE`, one repository-relative path
per line. It must be derived from the Section 02 candidate inventory and
approved by the user. Record approver, timestamp, reason, file count, and
SHA-256.

Codex must reject:

- blank or duplicate entries;
- paths beginning with `/` or `-`;
- `.` or `..` path segments;
- colon/pathspec magic;
- control characters or newline-bearing filenames;
- any excluded path;
- any path not reported as tracked and changed against `TARGET_COMMIT`.

For this migration, approved paths should use the conservative portable
character set `[A-Za-z0-9._@+/-]`. Stop for a path outside that set and design a
separately reviewed argument-safe transfer; do not interpolate it into a remote
shell command.

Validation template:

```bash
set -euo pipefail
APPROVED_TRACKED="$WSL_STAGE/approved-tracked-paths.txt"
test -s "$APPROVED_TRACKED"

LC_ALL=C sort "$APPROVED_TRACKED" | uniq -d |
  tee "$WSL_STAGE/duplicate-tracked-paths.txt"
test ! -s "$WSL_STAGE/duplicate-tracked-paths.txt"

while IFS= read -r path; do
  test -n "$path"
  [[ "$path" =~ ^[A-Za-z0-9._@+/-]+$ ]]
  [[ "$path" != /* && "$path" != -* && "$path" != *:* ]]
  [[ "/$path/" != *"/../"* && "/$path/" != *"/./"* ]]
  # Apply every exclusion in Section 3 here.
done < "$APPROVED_TRACKED"

sha256sum "$APPROVED_TRACKED"
```

### 6.2 Create separate staged and unstaged patches

Preserve the server's staged/unstaged distinction. Construct the remote path
argument list from the validated file, shell-quoting each path with Bash
`printf '%q'`. Never paste an unvalidated path into the SSH command.

```bash
set -euo pipefail
REMOTE_REPO_Q="$(printf '%q' "$SERVER_REPO")"
REMOTE_PATH_ARGS=""

while IFS= read -r path; do
  printf -v PATH_Q '%q' "$path"
  REMOTE_PATH_ARGS+=" $PATH_Q"
done < "$APPROVED_TRACKED"

test -n "$REMOTE_PATH_ARGS"

ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  "git -C $REMOTE_REPO_Q diff \
     --cached --binary --no-color --no-ext-diff HEAD --$REMOTE_PATH_ARGS" \
  > "$WSL_STAGE/tracked-staged.patch"

ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  "git -C $REMOTE_REPO_Q diff \
     --binary --no-color --no-ext-diff --$REMOTE_PATH_ARGS" \
  > "$WSL_STAGE/tracked-unstaged.patch"
```

These are read-only remote Git operations. The patch files are written only in
the local WSL staging directory.

Do not create temporary patch files in the server repository. Empty patches are
valid and must be recorded as empty rather than passed to `git apply`.

Immediately record:

```bash
sha256sum \
  "$WSL_STAGE/tracked-staged.patch" \
  "$WSL_STAGE/tracked-unstaged.patch"
wc -c \
  "$WSL_STAGE/tracked-staged.patch" \
  "$WSL_STAGE/tracked-unstaged.patch"
```

Review patch summaries and the complete patch locally. Confirm that every
affected old/new path is approved and no excluded file or secret/private
material appears. Evidence may record findings and hashes, but must not copy
secret-bearing patch content into the manifest.

```bash
for patch in \
  "$WSL_STAGE/tracked-staged.patch" \
  "$WSL_STAGE/tracked-unstaged.patch"
do
  if test -s "$patch"; then
    git apply --stat "$patch"
    git apply --summary "$patch"
  fi
done
```

### 6.3 Check before apply

The target clone must still be clean and pinned:

```bash
test "$(git -C "$WSL_REPO" rev-parse HEAD)" = "$TARGET_COMMIT"
test -z "$(git -C "$WSL_REPO" status --porcelain=v1)"
```

Apply only after checks pass:

```bash
if test -s "$WSL_STAGE/tracked-staged.patch"; then
  git -C "$WSL_REPO" apply --check --index \
    "$WSL_STAGE/tracked-staged.patch"
  git -C "$WSL_REPO" apply --index \
    "$WSL_STAGE/tracked-staged.patch"
fi

if test -s "$WSL_STAGE/tracked-unstaged.patch"; then
  git -C "$WSL_REPO" apply --check \
    "$WSL_STAGE/tracked-unstaged.patch"
  git -C "$WSL_REPO" apply \
    "$WSL_STAGE/tracked-unstaged.patch"
fi
```

Do not use `--unsafe-paths`, three-way fallback, conflict auto-resolution,
`git reset`, or checkout to force a patch through. A check failure requires
reconciliation with the server state and a newly reviewed artifact.

### 6.4 Reconcile tracked content

Record locally:

```bash
git -C "$WSL_REPO" status --porcelain=v1
git -C "$WSL_REPO" diff --cached --binary HEAD |
  sha256sum
git -C "$WSL_REPO" diff --binary |
  sha256sum
```

Compute the same two streamed diff hashes read-only on the server for the same
approved path set. Both local and server hashes must match. If staging state is
intentionally not being preserved, that deviation must be approved and the
combined `git diff --binary HEAD` hash must match instead.

## 7. Optional untracked-work transfer

Skip this entire section when `include_dirty_untracked: false`.

### 7.1 Exact allowlist

From the fresh Section 02 candidate inventory, create:

- `approved-untracked-files.txt` for human review, one path per line;
- `approved-untracked-files.nul` for the `tar` file list.

Directories are forbidden; expand them to individual regular files. Apply the
same path syntax and exclusion checks as tracked paths. In addition:

- confirm each candidate is currently untracked and not ignored;
- confirm it is a regular file;
- reject all symlinks, including symlinks that currently resolve inside the
  repository;
- confirm the destination path does not already exist in the clean clone;
- record the user approval, count, and allowlist hashes.

Re-run read-only server checks immediately before archive creation because the
working tree can change between inventory and transfer. Stop on any mismatch.

### 7.2 Create archive through SSH

After validation and approval, stream only the NUL-delimited allowlist:

```bash
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$SERVER" \
  "cd '$SERVER_REPO' &&
   tar --null --verbatim-files-from --files-from=- \
       --no-recursion -czf -" \
  < "$WSL_STAGE/approved-untracked-files.nul" \
  > "$WSL_STAGE/approved-untracked-files.tar.gz"
```

Record the archive hash and byte size:

```bash
sha256sum "$WSL_STAGE/approved-untracked-files.tar.gz"
wc -c "$WSL_STAGE/approved-untracked-files.tar.gz"
```

Create a per-file SHA-256 ledger by running `sha256sum -- <safely quoted path>`
read-only on the server for each approved path. The ledger contains paths,
sizes, and hashes only; it must not include file contents.

### 7.3 Validate in quarantine before acceptance

Do not extract directly into `WSL_REPO`. First inspect and quarantine:

```bash
export UNTRACKED_QUARANTINE="$WSL_STAGE/untracked-quarantine"
test ! -e "$UNTRACKED_QUARANTINE"
mkdir -m 700 "$UNTRACKED_QUARANTINE"

tar -tzf "$WSL_STAGE/approved-untracked-files.tar.gz" \
  > "$WSL_STAGE/archive-list.txt"
tar -tvzf "$WSL_STAGE/approved-untracked-files.tar.gz" \
  > "$WSL_STAGE/archive-types.txt"
```

The archive listing must equal the human-readable approved allowlist exactly.
Reject absolute paths, parent traversal, duplicates, directories, symlinks,
hard links, devices, sockets, and named pipes. After those tests pass:

```bash
tar --extract --gzip \
  --file "$WSL_STAGE/approved-untracked-files.tar.gz" \
  --directory "$UNTRACKED_QUARANTINE" \
  --no-same-owner --no-same-permissions
```

Re-run the exclusion rules and an approved local secret scanner against the
quarantine directory. Report finding paths and rule IDs only; do not print
secret values. Any unresolved finding blocks acceptance.

Compare every quarantined file's size and SHA-256 with the server ledger.
Only after an exact match may Codex copy each approved file, with its parent
directories, from quarantine into `WSL_REPO`. Do not copy the quarantine
directory wholesale. Recompute per-file hashes at the final destination.

## 8. Gate G5 reconciliation

Gate G5 passes only when all applicable evidence is complete:

- target path resolves inside WSL `/home`;
- target `HEAD` equals `TARGET_COMMIT`;
- clean clone route and authoritative origin are recorded;
- the target was clean before optional dirty transfer;
- dirty-work choices and approvals match Gate G4;
- tracked allowlist, staged patch, and unstaged patch hashes are recorded;
- every affected tracked path is approved and the resulting tracked diff hashes
  reconcile with the server;
- untracked allowlist and archive hashes are recorded;
- archive listing equals the exact allowlist;
- every accepted untracked file's source, quarantine, and destination
  size/SHA-256 values match;
- final `git status --porcelain=v1` equals the approved dirty-state manifest;
- secret scan has no unresolved finding;
- no excluded path or server production data crossed the boundary;
- the server disabled/healthy state remains unchanged.

Expected final evidence files:

```text
source-transfer-summary.yaml
clean-clone.txt
approved-tracked-paths.txt                 # only if approved
tracked-staged.patch                       # only if approved
tracked-unstaged.patch                     # only if approved
approved-untracked-files.txt               # only if approved
approved-untracked-files.nul               # only if approved
approved-untracked-files.tar.gz            # only if approved
untracked-sha256-ledger.txt                 # only if approved
final-git-status.txt
source-transfer-sha256.txt
```

Patch/archive files can contain confidential source. Store them under the
mode-`700` WSL staging directory, do not commit or upload them, and record their
retention/expiry date.

Minimum `source-transfer-summary.yaml` fields:

```yaml
gate: G5
status: not_run
source_route: github_clone
server_head: null
target_head: null
target_path: null
origin_sanitized: null
clean_before_dirty_transfer: null
include_dirty_tracked: false
include_dirty_untracked: false
approved_by: null
approved_at_utc: null
artifact_hashes: {}
tracked_reconciled: null
untracked_reconciled: null
secret_scan_status: null
excluded_path_count: 0
server_mutations: 0
stop_reason: null
rollback_or_quarantine: null
```

## 9. Stop conditions

Stop immediately and mark G5 `fail` when:

- any prerequisite gate is absent, failed, stale, or contradicted by live
  evidence;
- `WSL_REPO` exists before this run or resolves outside WSL `/home`;
- local capacity falls below the reserved threshold;
- the server `HEAD` differs from `TARGET_COMMIT`;
- the exact commit cannot be obtained;
- the clone is not clean before optional dirty transfer;
- an allowlist is missing approval, contains an unsafe/excluded path, or does
  not match current server state;
- patch path review or `git apply --check` fails;
- an archive contains anything other than the exact approved regular files;
- any source/quarantine/destination hash differs;
- a secret/private-material finding is unresolved;
- final Git status differs from the approved state;
- a command would write to the server or start a server service;
- SocratiCode becomes active, SmartSpecPro health degrades, or server memory
  pressure rises during the read-only transfer window.

Do not solve a stop condition by broadening an allowlist, disabling a scanner,
using an unsafe Git flag, copying the whole repository, or changing production.

## 10. Rollback and quarantine

No server rollback should be necessary because this section is read-only on the
server.

For a local failure:

1. Stop before Section 04; no local SocratiCode/Qdrant service should exist yet.
2. Preserve sanitized logs, manifests, hashes, and failed validation evidence.
3. Move the newly created checkout or transfer artifact into a run-specific,
   mode-`700` quarantine path inside `WSL_STAGE`; do not merge it with another
   checkout.
4. Record the original path, quarantine path, reason, timestamp, and expiry.
5. Start a new run only after the source state and approval have been
   reconciled.

Do not delete or overwrite a pre-existing local checkout. Destructive local
cleanup requires a separate explicit approval and must prove that the target
was created by this run. Never delete or change server files, Git state,
volumes, containers, units, or the disabled launcher as rollback.

## 11. Handoff to Section 04

Section 04 may begin only after G5 is `pass`. Handoff:

- exact local source path and commit;
- sanitized origin;
- final approved Git status;
- tracked/untracked transfer decisions;
- artifact and per-file hash ledger;
- secret-scan result;
- local capacity remaining;
- quarantine/rollback status;
- confirmation that server mutations remain zero.

The default expected handoff is a clean clone at `TARGET_COMMIT`, with no dirty
work transferred and a fresh local SocratiCode index selected.
