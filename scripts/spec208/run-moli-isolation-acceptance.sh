#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <immutable-rootfs-dir> <sha256-digest> [unit-name]" >&2
  exit 64
fi

rootfs=$(realpath "$1")
digest=$2
unit_name=${3:-spec208-moli-acceptance-$(date -u +%Y%m%d%H%M%S)}
if [[ ! -d "$rootfs" || ! -x "$rootfs/usr/bin/node" || ! -x "$rootfs/usr/bin/moli" ]]; then
  echo "ROOTFS_INCOMPLETE" >&2
  exit 1
fi
if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "RUNTIME_DIGEST_INVALID" >&2
  exit 1
fi
if [[ "$(find "$rootfs" -type f -perm /222 -print -quit)" ]]; then
  echo "ROOTFS_HAS_WRITABLE_FILES" >&2
  exit 1
fi
if [[ "$(find "$rootfs" -type d ! -perm -0555 -print -quit)" ]]; then
  echo "ROOTFS_HAS_WRITABLE_OR_INACCESSIBLE_DIRECTORIES" >&2
  exit 1
fi
actual_digest=$(tar --sort=name --mtime='UTC 1970-01-01' --numeric-owner --format=gnu -cf - -C "$rootfs" . | sha256sum | awk '{print $1}')
if [[ "$digest" != "sha256:$actual_digest" ]]; then
  echo "ROOTFS_DIGEST_MISMATCH: expected $digest, got sha256:$actual_digest" >&2
  exit 1
fi

systemd-run --user --wait --pipe --unit="$unit_name" --setenv="SPEC208_RUNTIME_IMAGE_DIGEST=$digest" \
  --property="RootDirectory=$rootfs" \
  --property=PrivateNetwork=yes \
  --property=ProtectSystem=strict \
  --property=ProtectHome=yes \
  --property=PrivateTmp=yes \
  --property=NoNewPrivileges=yes \
  --property=CapabilityBoundingSet= \
  --property=MemoryMax=1G \
  --property=CPUQuota=100% \
  --property=TasksMax=64 \
  --property=RuntimeMaxSec=90s \
  --property=TimeoutStopSec=5s \
  '--property=RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX' \
  --property=ProtectProc=invisible \
  --property=ProtectKernelTunables=yes \
  --property=ProtectKernelModules=yes \
  --property=ProtectControlGroups=yes \
  --property=PrivateDevices=yes \
  '--property=TemporaryFileSystem=/profile:rw,nosuid,nodev,noexec,size=512m' \
  '--property=TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=64m' \
  --property=UMask=0077 \
  -- /usr/bin/env -i PATH=/usr/bin HOME=/profile TMPDIR=/tmp "SPEC208_RUNTIME_IMAGE_DIGEST=$digest" \
  /usr/bin/node /opt/spec208/acceptance.mjs
