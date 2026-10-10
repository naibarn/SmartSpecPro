#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <moli-v1.1.15-binary> <node-binary> <rootfs-dir>" >&2
  exit 64
fi

moli_binary=$(realpath "$1")
node_binary=$(realpath "$2")
rootfs=$(realpath -m "$3")
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
acceptance_script="$script_dir/moli-isolation-acceptance.mjs"
expected_moli_sha256=f927b72192905c092ec95c8f528e35087224f3fe8750f72fb2147efa676eab8d

actual_moli_sha256=$(sha256sum "$moli_binary" | awk '{print $1}')
if [[ "$actual_moli_sha256" != "$expected_moli_sha256" ]]; then
  echo "MOLI_BINARY_DIGEST_MISMATCH: expected $expected_moli_sha256, got $actual_moli_sha256" >&2
  exit 1
fi
if [[ "$("$moli_binary" --version)" != "moli 1.1.15" ]]; then
  echo "MOLI_VERSION_MISMATCH" >&2
  exit 1
fi
if [[ ! -x "$node_binary" || ! -f "$acceptance_script" ]]; then
  echo "NODE_OR_ACCEPTANCE_SCRIPT_INVALID" >&2
  exit 1
fi
if [[ -e "$rootfs" ]]; then
  echo "ROOTFS_ALREADY_EXISTS: refusing to overwrite $rootfs" >&2
  exit 1
fi

mkdir -p "$rootfs"/{etc,usr/bin,lib,lib64,dev,proc,run,sys,tmp,profile,root,var/tmp,opt/spec208}
chmod 0755 "$rootfs"
ln -s usr/bin "$rootfs/bin"
cp --parents "$(realpath /usr/bin/env)" "$rootfs"
install -m 0555 "$moli_binary" "$rootfs/usr/bin/moli"
install -m 0555 "$node_binary" "$rootfs/usr/bin/node"
install -m 0444 "$acceptance_script" "$rootfs/opt/spec208/acceptance.mjs"
printf 'moli:x:1000:1000:Moli:/profile:/usr/bin/env\n' > "$rootfs/etc/passwd"
printf 'moli:x:1000:\n' > "$rootfs/etc/group"
chmod 0444 "$rootfs/etc/passwd" "$rootfs/etc/group"

for binary in /usr/bin/env "$rootfs/usr/bin/moli" "$rootfs/usr/bin/node"; do
  if ldd "$binary" | grep -q 'not found'; then
    echo "RUNTIME_LIBRARY_MISSING: $binary" >&2
    exit 1
  fi
  while IFS= read -r library; do
    [[ -n "$library" && -f "$library" ]] || continue
    cp --parents "$library" "$rootfs"
  done < <(ldd "$binary" | awk '/=> \/[^ ]+/ {print $3} /^[[:space:]]*\// {print $1}' | sort -u)
done

find "$rootfs" -type d -exec chmod 0555 {} +
find "$rootfs" -type f -exec chmod a-w {} +
chmod 0555 "$rootfs/usr/bin/env" "$rootfs/usr/bin/moli" "$rootfs/usr/bin/node"

rootfs_digest=$(tar --sort=name --mtime='UTC 1970-01-01' --numeric-owner --format=gnu -cf - -C "$rootfs" . | sha256sum | awk '{print $1}')
node_digest=$(sha256sum "$node_binary" | awk '{print $1}')
cat > "${rootfs%/}.provenance.json" <<EOF
{
  "schema": "spec208.local-runtime-provenance.v1",
  "runtime": "rootless-systemd-acceptance-not-cloudflare-certified",
  "platform": "linux-x86_64",
  "rootfsDigest": "sha256:$rootfs_digest",
  "moli": {
    "version": "1.1.15",
    "source": "https://github.com/lexmount/moli/releases/tag/v1.1.15",
    "sourceCommit": "eaaf6f2",
    "binarySha256": "$actual_moli_sha256",
    "releaseAttestationVerified": false
  },
  "node": {
    "version": "$("$node_binary" --version)",
    "binarySha256": "$node_digest"
  },
  "limitations": [
    "Local deterministic rootfs digest; no registry signature or publisher build attestation was verified.",
    "This acceptance runtime is not Cloudflare certified and is not production compatible."
  ]
}
EOF
chmod 0444 "${rootfs%/}.provenance.json"
printf 'rootfs=%s\nrootfs_digest=sha256:%s\nprovenance=%s\n' "$rootfs" "$rootfs_digest" "${rootfs%/}.provenance.json"
