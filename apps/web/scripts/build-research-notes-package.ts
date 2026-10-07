import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSpaasPackage } from "../../../packages/spaas-standard/src/index.ts";
import type { ManifestSupportContext, PackageEntry } from "../../../packages/spaas-standard/src/model.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packageRoot = join(repositoryRoot, "apps/web/mini-apps/research-notes");
const outputPath = join(repositoryRoot, "apps/web/.artifacts/research-notes/package-report.json");

function packageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in a portable Mini App package: ${relative(packageRoot, path)}`);
      if (entry.isDirectory()) return packageFiles(path);
      if (!entry.isFile()) throw new Error(`Unsupported package entry: ${relative(packageRoot, path)}`);
      return [path];
    })
    .sort((left, right) => Buffer.compare(Buffer.from(relative(packageRoot, left)), Buffer.from(relative(packageRoot, right))));
}

const files = packageFiles(packageRoot);
const manifestPath = join(packageRoot, "app.manifest.yaml");
const manifest = readFileSync(manifestPath);
const entries: PackageEntry[] = files.map((path) => ({
  path: relative(packageRoot, path).split("\\").join("/"),
  kind: "file",
  bytes: readFileSync(path),
}));
const support: ManifestSupportContext = {
  supportedApiVersions: ["spaas.smartaihub.app/v1"],
  supportedSchemaVersions: ["1.0"],
  supportedRequiredFeatures: [],
  supportedOptionalFeatures: [],
  extensions: [],
};
const report = validateSpaasPackage({ manifest, support, entries, profile: "offline-package" });
if (report.status === "invalid" || !report.digest) {
  process.stderr.write(`${JSON.stringify({ status: report.status, stages: report.stages, diagnostics: report.diagnostics }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: "research-notes-package-build/v1",
    appId: report.manifestIdentity,
    appVersion: report.manifestVersion,
    digest: report.digest,
    validation: { profile: report.profile, status: report.status, stages: report.stages, diagnostics: report.diagnostics },
    files: entries.map(({ path, bytes }) => ({ path, sizeBytes: bytes.byteLength })),
  }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ packageBuild: "BUILT", validation: report.status, appId: report.manifestIdentity, digest: report.digest.value, outputPath })}\n`);
}
