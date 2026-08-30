#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: orchestra-archive-safe.sh --source PATH --archive-root PATH [--timestamp YYYYMMDDTHHMMSSZ]

Archives one live Orchestra directory into the sibling .orchestra-archive root.
The operation is a guarded same-filesystem move; it never copies or packages the tree.
EOF
}

die() {
  printf 'orchestra-archive-safe: error: %s\n' "$*" >&2
  exit 1
}

source_path=""
archive_root_path=""
archive_timestamp=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source)
      [ "$#" -ge 2 ] || die "--source requires a path"
      source_path="$2"
      shift 2
      ;;
    --archive-root)
      [ "$#" -ge 2 ] || die "--archive-root requires a path"
      archive_root_path="$2"
      shift 2
      ;;
    --timestamp)
      [ "$#" -ge 2 ] || die "--timestamp requires a UTC timestamp"
      archive_timestamp="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage
      die "unknown argument: $1"
      ;;
  esac
done

[ -n "$source_path" ] || die "--source is required"
[ -n "$archive_root_path" ] || die "--archive-root is required"
command -v realpath >/dev/null 2>&1 || die "realpath is required"
command -v flock >/dev/null 2>&1 || die "flock is required"

[ -d "$source_path" ] || die "source is not a directory: $source_path"
[ ! -L "$source_path" ] || die "source symlink is not allowed: $source_path"
[ ! -L "$archive_root_path" ] || die "archive root symlink is not allowed: $archive_root_path"

source_real="$(realpath -e -- "$source_path")" || die "cannot resolve source: $source_path"
archive_root_real="$(realpath -m -- "$archive_root_path")" || die "cannot resolve archive root: $archive_root_path"
source_parent="$(dirname -- "$source_real")"
expected_archive_root="${source_parent}/.orchestra-archive"

case "${archive_root_real}/" in
  "${source_real}/"*)
    die "archive root must not be inside source: ${archive_root_real}"
    ;;
esac

[ "$archive_root_real" = "$expected_archive_root" ] || \
  die "archive root must be the source sibling ${expected_archive_root}"

if [ -z "$archive_timestamp" ]; then
  archive_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
fi
[[ "$archive_timestamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || \
  die "invalid timestamp: $archive_timestamp"

umask 077
mkdir -p -- "$archive_root_real"
lock_path="${archive_root_real}/.lock"
exec 9>"$lock_path"
flock -n 9 || die "another archive operation is already running"

destination="${archive_root_real}/${archive_timestamp}"
[ ! -e "$destination" ] && [ ! -L "$destination" ] || \
  die "archive destination already exists: $destination"

mv -- "$source_real" "$destination"
printf 'orchestra-archive-safe: archived source=%s destination=%s\n' \
  "$source_real" "$destination"
