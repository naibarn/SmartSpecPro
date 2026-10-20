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

bash "$WEB_ROOT/scripts/materialize-public-releases.sh" "$WEB_ROOT"

if [[ -e "$WEB_ROOT/dist/backend-runtime" ]]; then
  echo "Backend runtime artifact already exists in this build output" >&2
  exit 2
fi

STAGING_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/smartspec-backend-package.XXXXXX")"
PUBLISH_STAGE="$WEB_ROOT/dist/.backend-runtime-stage-$$"
if [[ -e "$PUBLISH_STAGE" || -L "$PUBLISH_STAGE" ]]; then
  echo "Backend publish staging path already exists; preserving it: $PUBLISH_STAGE" >&2
  exit 2
fi
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
# Some npm packages ship their own test .env (for example Bottleneck's Redis
# fixture). Runtime environments are supplied outside the immutable artifact.
# find does not follow pnpm symlinks; deletion affects only this owned staging tree.
find "$PACKAGE_ROOT" -type f \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' -delete
# pnpm deploy creates a self-reference to the workspace package in the
# virtual-store links. That points back into this temporary build checkout and
# would make the supposedly immutable runtime depend on its source workspace.
SELF_LINK="$PACKAGE_ROOT/node_modules/.pnpm/node_modules/@smartspec/web"
if [[ -L "$SELF_LINK" ]]; then
  rm -- "$SELF_LINK"
fi
# The monorepo tsconfig extends ../../tsconfig.base.json. That file is not
# part of a standalone release package, so keep only the app-local aliases
# tsx needs at runtime and remove workspace-only aliases.
node --input-type=module - "$PACKAGE_ROOT/tsconfig.json" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [path] = process.argv.slice(2);
const source = JSON.parse(readFileSync(path, "utf8"));
const sourcePaths = source.compilerOptions?.paths ?? {};
const runtimeAliases = ["@/*", "@shared/*", "@db/*", "@server/*"];
const paths = Object.fromEntries(
  runtimeAliases
    .filter(alias => Array.isArray(sourcePaths[alias]))
    .map(alias => [alias, sourcePaths[alias]])
);
if (Object.keys(paths).length !== runtimeAliases.length) {
  throw new Error("App-local runtime aliases are missing from tsconfig.json");
}
writeFileSync(path, `${JSON.stringify({ compilerOptions: { baseUrl: ".", paths } }, null, 2)}\n`);
JS
node "$WEB_ROOT/scripts/verify-linux-runtime-dependencies.mjs" "$PACKAGE_ROOT"
# Import the protected-origin boundary from the detached artifact itself. Source
# checkout tests cannot detect monorepo-relative paths broken by pnpm deploy.
(
  cd "$PACKAGE_ROOT"
  NODE_ENV=production node --import tsx --input-type=module -e 'await import("./server/_core/cloudflareOriginMiddleware.ts"); await import("./server/services/cloudflareOriginVersionBindings.ts");'
)
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

# The verified package is private to this attempt and is no longer needed at
# its temporary path. Moving it avoids copying the entire dependency tree a
# second time. On different filesystems mv copies into the private publish
# stage first; the final rename below still publishes atomically.
echo "[backend-package] Moving verified runtime into the artifact staging path..."
mv "$PACKAGE_ROOT" "$PUBLISH_STAGE"
mv "$PUBLISH_STAGE" "$WEB_ROOT/dist/backend-runtime"
echo "PACKAGED_BACKEND_SOURCE_SHA=$SOURCE_SHA"
