#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" || -n "${MINI_APP_BASELINE_DATABASE_URL:-}" ]]; then
  echo "PACKAGE_CONTEXT_REFUSES_INHERITED_DATABASE_URL" >&2
  exit 2
fi
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
OUTPUT_DIR="$APP_DIR/.artifacts/research-notes-package-context"
TMP_ROOT="${TMPDIR:-/home/dev/.cache/codex/miniapp-runtime-tmp}"
mkdir -p "$OUTPUT_DIR" "$TMP_ROOT"
PACKAGE_REPORT="$OUTPUT_DIR/package-report.json"
RUNTIME_LOG="$OUTPUT_DIR/full-runtime.log"
MIGRATION_LOG="$OUTPUT_DIR/migration-rollback.log"
CONTEXT_REPORT="$OUTPUT_DIR/package-validation-context.json"
EVIDENCE_FILE="$OUTPUT_DIR/package-validation-context.evidence.json"
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"

cd "$APP_DIR"
pnpm exec tsx scripts/build-mini-app-package.ts --output-dir "$OUTPUT_DIR"
SKIP_BROWSER_UAT=1 TMPDIR="$TMP_ROOT" pnpm run test:mini-app-full-runtime >"$RUNTIME_LOG" 2>&1
TMPDIR="$TMP_ROOT" bash scripts/test-mini-app-migration-rollback.sh >"$MIGRATION_LOG" 2>&1
pnpm exec tsx scripts/write-mini-app-validation-evidence.ts \
  "$PACKAGE_REPORT" "$RUNTIME_LOG" "$MIGRATION_LOG" "$CONTEXT_REPORT" "$SOURCE_SHA"
pnpm exec tsx scripts/build-mini-app-package.ts \
  --output-dir "$OUTPUT_DIR" --evidence-file "$EVIDENCE_FILE"
node --input-type=module - "$PACKAGE_REPORT" "$CONTEXT_REPORT" <<'JS'
import { readFileSync } from "node:fs";
const report = JSON.parse(readFileSync(process.argv[2], "utf8"));
const context = JSON.parse(readFileSync(process.argv[3], "utf8"));
if (report.validation.status !== "valid" || report.digest.value !== context.packageDigest) {
  throw new Error("PACKAGE_CONTEXT_VALIDATION_NOT_PASS");
}
for (const stage of ["V5", "V6"]) {
  if (report.validation.stages.find(item => item.stage === stage)?.status !== "passed") {
    throw new Error(`PACKAGE_CONTEXT_STAGE_${stage}_NOT_PASS`);
  }
}
console.log(JSON.stringify({
  result: "PACKAGE_CONTEXT_VALIDATION_PASS",
  appId: report.appId,
  digest: report.digest.value,
  runtimeId: context.runtimeId,
  migrationId: context.migrationId,
  validation: report.validation.status,
  evidenceIds: context.evidence.map(item => item.evidenceId),
  deployment: "NOT_CLAIMED",
}));
JS
