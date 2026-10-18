#!/usr/bin/env bash
set -euo pipefail

WEB_ROOT="$(cd "${1:?usage: materialize-public-releases.sh <web-root>}" && pwd -P)"
PUBLIC_ROOT="$WEB_ROOT/dist/public"
RELEASES_PATH="$PUBLIC_ROOT/releases"
RELEASES_SOURCE="$WEB_ROOT/client/public/releases"

if [[ ! -L "$RELEASES_PATH" ]]; then
  exit 0
fi

RESOLVED_SOURCE="$(realpath -e "$RELEASES_PATH")"
EXPECTED_SOURCE="$(realpath -e "$RELEASES_SOURCE")"
if [[ "$RESOLVED_SOURCE" != "$EXPECTED_SOURCE" ]]; then
  echo "Unexpected public releases symlink target" >&2
  exit 2
fi

STAGING_PATH="$PUBLIC_ROOT/.releases-materialize-$$"
cleanup() { rm -rf -- "$STAGING_PATH"; }
trap cleanup EXIT
mkdir "$STAGING_PATH"
cp -a "$RESOLVED_SOURCE/." "$STAGING_PATH/"
rm -- "$RELEASES_PATH"
mv "$STAGING_PATH" "$RELEASES_PATH"
