import { readFileSync, writeFileSync } from "node:fs";

const [packageReportPath, runtimeLogPath, migrationLogPath, outputPath, sourceSha] = process.argv.slice(2);
if (!packageReportPath || !runtimeLogPath || !migrationLogPath || !outputPath || !/^[a-f0-9]{40}$/i.test(sourceSha ?? "")) {
  throw new Error("VALIDATION_EVIDENCE_ARGUMENTS_INVALID");
}
const packageReport = JSON.parse(readFileSync(packageReportPath, "utf8")) as {
  appId: string;
  appVersion: string;
  digest: { value: string };
  archive: { sha256: string; format: string };
};
const runtimeLog = readFileSync(runtimeLogPath, "utf8");
const migrationLog = readFileSync(migrationLogPath, "utf8");
const runtime = /FULL_APP_RUNTIME_BOOT_PASS runtimeId=(\S+) healthz=200 readyz=200 research_notes_ui=200 authenticated_api=PASS unauthenticated_api=\d{3} host=127\.0\.0\.1/.exec(runtimeLog);
if (!runtime) throw new Error("PACKAGE_V5_RUNTIME_EVIDENCE_MISSING");
if (!migrationLog.includes("MINI_APP_MIGRATION_0393_ROLLBACK_PASS target=disposable-postgresql-17")) {
  throw new Error("PACKAGE_V6_MIGRATION_ROLLBACK_EVIDENCE_MISSING");
}
const observedAt = new Date();
const expiresAt = new Date(observedAt.getTime() + 60 * 60 * 1000);
const common = {
  schemaVersion: "spaas-evidence-v1" as const,
  digest: packageReport.digest.value,
  manifestIdentity: packageReport.appId,
  manifestVersion: packageReport.appVersion,
  profile: "offline-package" as const,
  outcome: "passed" as const,
  observedAt: observedAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
};
const evidence = [
  {
    ...common,
    stage: "V5" as const,
    checkId: "runtime-placement" as const,
    reasonCode: "LOOPBACK_RUNTIME_PASS",
    evidenceId: `runtime:${sourceSha.slice(0, 12)}:${observedAt.getTime()}`,
  },
  {
    ...common,
    stage: "V6" as const,
    checkId: "migration-rollback" as const,
    reasonCode: "MIGRATION_0393_ROLLBACK_PASS",
    evidenceId: `migration-0393:${sourceSha.slice(0, 12)}:${observedAt.getTime()}`,
  },
];
const envelope = {
  schemaVersion: "mini-app-package-validation-context.v1",
  programId: "AUTONOMOUS_MINI_APP_FACTORY_PROGRAM",
  appId: packageReport.appId,
  sourceSha: sourceSha.toLowerCase(),
  packageDigest: packageReport.digest.value,
  archiveSha256: packageReport.archive.sha256,
  archiveFormat: packageReport.archive.format,
  runtimeId: runtime[1],
  runtimeEvidence: "isolated normal server composition on loopback using disposable PostgreSQL 17 Mini App schema; not deployment/full application schema",
  migrationId: "0393_spec302_canonical_project_identity",
  migrationEvidence: "0393 applied, populated, and reversed on a disposable PostgreSQL 17 database; 0392-owned app identity and route alias schema/data remained intact",
  evidence,
};
writeFileSync(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);
writeFileSync(outputPath.replace(/\.json$/, ".evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ packageDigest: packageReport.digest.value, runtimeId: runtime[1], evidenceIds: evidence.map(item => item.evidenceId) }));
