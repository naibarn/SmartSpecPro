import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const targetConfigPath = resolve(repositoryRoot, "apps/web/scripts/deployment-targets.json");

export function loadDeploymentTargets(configPath = targetConfigPath) {
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config.schemaVersion !== 1 || !config.targets || typeof config.targets !== "object") {
    throw new Error("INVALID_DEPLOYMENT_TARGET_CONFIG");
  }
  return config.targets;
}

export function resolveDeploymentTarget(targetId, targets = loadDeploymentTargets()) {
  if (typeof targetId !== "string" || !targetId.trim()) {
    throw new Error("DEPLOYMENT_TARGET_REQUIRED");
  }
  const target = targets[targetId];
  if (!target) throw new Error("UNKNOWN_DEPLOYMENT_TARGET");
  return { id: targetId, ...target };
}

export function assertLegacyLinuxReleaseTarget(targetId, targets = loadDeploymentTargets()) {
  const target = resolveDeploymentTarget(targetId, targets);
  if (target.id !== "legacy-debian-dev"
      || target.environment !== "development"
      || target.domain !== "smartaihub.app"
      || target.runtime !== "debian-systemd"
      || target.service !== "smartspec-web.service"
      || target.port !== 3000
      || target.controller !== "linux-fullstack-immutable"
      || target.deployable !== true) {
    throw new Error("TARGET_NOT_SUPPORTED_BY_LEGACY_LINUX_RELEASE");
  }
  return target;
}
