#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "usage: $0 <immutable-moli-rootfs> <runner-binary> <moli-acceptance-driver> <new-rootfs>" >&2
  exit 64
fi
source_root=$(realpath "$1")
runner=$(realpath "$2")
harness=$(realpath "$3")
destination=$4
if [[ -e "$destination" ]]; then
  echo "DESTINATION_ALREADY_EXISTS" >&2
  exit 1
fi
if [[ ! -x "$source_root/usr/bin/moli" || ! -x "$source_root/usr/bin/node" || ! -f "$runner" || ! -x "$runner" || ! -f "$harness" ]]; then
  echo "ROOTFS_OR_RUNNER_INCOMPLETE" >&2
  exit 1
fi
mkdir -p "$(dirname "$destination")"
cp -a "$source_root" "$destination"
chmod u+w "$destination/usr/bin"
install -m 0555 "$runner" "$destination/usr/bin/smartaihub-runner"
chmod a-w "$destination/usr/bin"
chmod u+w "$destination/opt/spec208"
install -m 0444 "$harness" "$destination/opt/spec208/acceptance.mjs"
chmod a-w "$destination/opt/spec208"
if ldd "$runner" | rg -q 'not found'; then
  echo "RUNNER_LIBRARY_MISSING_FROM_HOST" >&2
  rm -rf "$destination"
  exit 1
fi
if ldd "$runner" | rg -q '\(/lib64/ld-linux|\(/lib/x86_64-linux-gnu/'; then
  while read -r library; do
    [[ -e "$destination$library" ]] || { echo "RUNNER_LIBRARY_ABSENT_FROM_ROOTFS:$library" >&2; rm -rf "$destination"; exit 1; }
  done < <(ldd "$runner" | sed -nE 's/.*=> (\/[^ ]+).*/\1/p; s/^\s*(\/[^ ]+).*/\1/p' | sort -u)
fi
chmod -R a-w "$destination"
digest=$(tar --sort=name --mtime='UTC 1970-01-01' --numeric-owner --format=gnu -cf - -C "$destination" . | sha256sum | awk '{print $1}')
runner_digest=$(sha256sum "$destination/usr/bin/smartaihub-runner" | awk '{print $1}')
printf '{"runtimeDigest":"sha256:%s","runnerSha256":"%s","rootfs":"%s"}\n' "$digest" "$runner_digest" "$(realpath "$destination")"
