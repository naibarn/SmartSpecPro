import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function resolvedPath(candidate) {
  let resolved = path.resolve(candidate);
  const suffix = [];
  while (!existsSync(resolved)) {
    const parent = path.dirname(resolved);
    if (parent === resolved) return path.resolve(candidate);
    suffix.unshift(path.basename(resolved));
    resolved = parent;
  }
  return path.join(realpathSync(resolved), ...suffix);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function guardLiveBuildTarget(webRoot, outputDirectory) {
  let serviceRoot = "";
  try {
    serviceRoot = execFileSync(
      "systemctl",
      ["show", "smartspec-web.service", "--property=WorkingDirectory", "--value"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 },
    ).trim();
  } catch {
    return;
  }
  if (!serviceRoot) return;

  const liveDist = resolvedPath(path.join(serviceRoot, "dist"));
  const output = resolvedPath(path.resolve(webRoot, outputDirectory));
  if (isWithin(liveDist, output)) {
    throw new Error(
      "Production build target blocked: Vite output is served by smartspec-web.service; use the canonical serialized release pipeline.",
    );
  }
}

export function liveBuildTargetGuardPlugin(webRoot) {
  return {
    name: "smartspec-live-build-target-guard",
    apply: "build",
    configResolved(config) {
      guardLiveBuildTarget(webRoot, config.build.outDir);
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    guardLiveBuildTarget(path.resolve("."), process.argv[2] ?? "dist/public");
  } catch (error) {
    console.error(`[build-guard] ${error.message}`);
    process.exitCode = 2;
  }
}
