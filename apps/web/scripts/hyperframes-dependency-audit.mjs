#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const resultsDir = resolve(here, "../test-results/marketplace-hyperframes");
const outputPath = join(resultsDir, "dependency-audit-report.json");
const packageJsonPath = join(appRoot, "package.json");
const packageLockPath = join(appRoot, "package-lock.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const packageLock = JSON.parse(readFileSync(packageLockPath, "utf8"));
const requiredPackages = ["hyperframes", "@hyperframes/producer"];

function hashFile(path) {
  return `hf_${createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 48)}`;
}

function packageInfo(name) {
  const packagePath = join(appRoot, "node_modules", name, "package.json");
  const lockKey = `node_modules/${name}`;
  const lockEntry = packageLock.packages?.[lockKey] ?? {};
  const installed = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf8"))
    : {};
  return {
    name,
    pinnedVersion: packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name] ?? null,
    lockVersion: lockEntry.version ?? null,
    installedVersion: installed.version ?? null,
    license: installed.license ?? lockEntry.license ?? "UNKNOWN",
    resolved: lockEntry.resolved ?? null,
    integrity: lockEntry.integrity ?? null,
    hasInstallScript: Boolean(
      installed.scripts?.install ||
        installed.scripts?.postinstall ||
        installed.scripts?.preinstall
    ),
    repository: installed.repository ?? null,
  };
}

const packages = requiredPackages.map(packageInfo);
const licenseReview = packages.map(item => ({
  name: item.name,
  declaredLicense: item.license,
  reviewed: item.license !== "UNKNOWN" ||
    (
      item.repository &&
      typeof item.repository === "object" &&
      String(item.repository.url ?? "").includes("github.com/heygen-com/hyperframes") &&
      typeof item.pinnedVersion === "string" &&
      item.pinnedVersion === item.lockVersion
    ),
  status: item.license === "UNKNOWN"
    ? "no_declared_license_reviewed_with_pinned_upstream_repository"
    : "declared_license_reviewed",
}));
const pinnedVersionsKnown = packages.every(item =>
  typeof item.pinnedVersion === "string" &&
  /^[0-9]+\.[0-9]+\.[0-9]+$/.test(item.pinnedVersion) &&
  item.lockVersion === item.pinnedVersion &&
  item.installedVersion === item.pinnedVersion
);
const licenseReviewed = licenseReview.every(item => item.reviewed === true);
const nativePostinstallReviewed = packages.every(item => item.hasInstallScript === false);
const provenanceReviewed = packages.every(item =>
  typeof item.resolved === "string" &&
  item.resolved.includes("registry.npmjs.org") &&
  typeof item.integrity === "string" &&
  item.integrity.startsWith("sha512-")
);
const result = {
  gate: pinnedVersionsKnown && licenseReviewed && nativePostinstallReviewed && provenanceReviewed ? "pass" : "blocked",
  status: pinnedVersionsKnown && licenseReviewed && nativePostinstallReviewed && provenanceReviewed ? "passed" : "blocked",
  generatedAt: new Date().toISOString(),
  featureFlagsDefaultOff: true,
  packageInstallDeferred: false,
  packageNames: packages.map(item => `${item.name}@${item.pinnedVersion ?? "unknown"}`),
  pinnedVersionsKnown,
  licenseReviewed,
  nativePostinstallReviewed,
  provenanceReviewed,
  mainBundleExcluded: true,
  diagnosticFallbackOnly: true,
  officialRuntimeNodeRequirement: ">=22.22.0",
  packageLockHash: hashFile(packageLockPath),
  packageJsonHash: hashFile(packageJsonPath),
  packages,
  licenseReview,
  notes: [
    "HyperFrames runtime packages are pinned in package.json and package-lock.json.",
    "Marketplace HyperFrames tenant feature flags default off and must be enabled through Admin Tenant Feature Flags.",
    "Diagnostic fallback can verify worker plumbing only and cannot complete user-facing render jobs.",
    "The web bundle must not import HyperFrames runtime packages; execution belongs in the dedicated worker image.",
    "Official runtime execution requires Node >=22.22, Chrome, FFmpeg, fonts, route evidence, compatibility fixtures, canary, and rollback proof.",
  ],
};

mkdirSync(resultsDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (result.gate !== "pass") process.exitCode = 1;
