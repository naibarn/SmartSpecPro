#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
WEB_ROOT="$REPO_ROOT/apps/web"
cd "$REPO_ROOT"

SOURCE_SHA="$(git rev-parse HEAD)"
if [[ ! "$SOURCE_SHA" =~ ^[0-9a-f]{40,64}$ ]]; then
  echo "Invalid canonical backend source revision" >&2
  exit 2
fi

DIRTY="$(git status --porcelain=v1 --untracked-files=all -- . \
  ':(exclude)apps/web/dist' ':(exclude)apps/web/dist/**' \
  ':(exclude)apps/cloudflare/.staging-artifact' ':(exclude)apps/cloudflare/.staging-artifact/**')"
if [[ -n "$DIRTY" ]]; then
  echo "Backend packaging requires a clean pinned source checkout" >&2
  exit 2
fi

if [[ ! -f "$WEB_ROOT/dist/public/index.html" ]]; then
  echo "Canonical frontend build is missing dist/public/index.html" >&2
  exit 2
fi

if [[ -e "$WEB_ROOT/dist/backend-runtime" ]]; then
  echo "Backend runtime artifact already exists in this build output" >&2
  exit 2
fi

STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smartspec-backend-package.XXXXXX")"
PUBLISH_STAGE="$WEB_ROOT/dist/.backend-runtime-stage-$$"
cleanup() {
  rm -rf -- "$STAGING_ROOT"
  if [[ -d "$PUBLISH_STAGE" ]]; then
    chmod -R u+rwX "$PUBLISH_STAGE" 2>/dev/null || true
    rm -rf -- "$PUBLISH_STAGE"
  fi
}
trap cleanup EXIT
PACKAGE_ROOT="$STAGING_ROOT/runtime"

pnpm --filter @smartspec/web --prod deploy --legacy "$PACKAGE_ROOT"
# pnpm deploy creates a self-reference to the workspace package in the
# virtual-store links. That points back into this temporary build checkout and
# would make the supposedly immutable runtime depend on its source workspace.
SELF_LINK="$PACKAGE_ROOT/node_modules/.pnpm/node_modules/@smartspec/web"
if [[ -L "$SELF_LINK" ]]; then
  rm -- "$SELF_LINK"
fi
mkdir -p "$PACKAGE_ROOT/dist/public"
cp -a "$WEB_ROOT/dist/public/." "$PACKAGE_ROOT/dist/public/"

node --input-type=module - "$PACKAGE_ROOT/release-build.json" "$SOURCE_SHA" <<'JS'
import { writeFileSync } from "node:fs";
const [path, sourceSha] = process.argv.slice(2);
const metadata = {
  schemaVersion: 1,
  sourceSha,
  frontendSourceSha: sourceSha,
  backendSourceSha: sourceSha,
  package: "@smartspec/web",
  packageManager: "pnpm@10.4.1",
  runtime: "node --import tsx server/_core/index.ts",
};
writeFileSync(path, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o444 });
JS

mkdir "$PUBLISH_STAGE"
cp -a "$PACKAGE_ROOT/." "$PUBLISH_STAGE/"
mv "$PUBLISH_STAGE" "$WEB_ROOT/dist/backend-runtime"
echo "PACKAGED_BACKEND_SOURCE_SHA=$SOURCE_SHA"
