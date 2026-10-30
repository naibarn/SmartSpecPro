#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { parse } from "dotenv";
import { selectDevWebDatabase, shouldRunDevSchemaMigrations } from "./devWebDatabase.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(
  process.env.SMARTSPEC_DEV_ENV_FILE ||
    `${homedir()}/.config/smartspec-dev/web.env`
);
let config;
try {
  config = parse(readFileSync(envFile));
  config = selectDevWebDatabase(config);
  const requestedDevPort = process.env.SMARTSPEC_DEV_WEB_PORT;
  if (requestedDevPort) {
    const port = Number(requestedDevPort);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Invalid isolated dev web port");
    config.PORT = String(port);
  }
  if (!config.JWT_SECRET || !config.LLM_ENCRYPTION_KEY)
    throw new Error("Dev authentication/encryption keys are missing");
  if (!config.PORT || config.PORT === "3000" || config.PORT === "8000")
    throw new Error("Use a separate dev port");
  if (!config.CONTROL_PLANE_API_KEY || config.CONTROL_PLANE_API_KEY.length < 24)
    throw new Error("A separate development control-plane key is missing");
} catch (error) {
  console.error(
    `[dev:web] ${error.message}. Configure ${envFile}; see docs/WEB_RELEASE_WORKFLOW.md.`
  );
  process.exit(1);
}
const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: appRoot,
  encoding: "utf8",
}).trim();
const dirty = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=no"],
  { cwd: appRoot, encoding: "utf8" }
).trim();
const revision = `${sourceSha}${dirty ? "-dirty" : ""}`;
const builtPublicDir = process.env.SMARTSPEC_DEV_BUILT_PUBLIC_DIR?.trim();
if (builtPublicDir) {
  if (!builtPublicDir.startsWith("/")) throw new Error("Built development assets must use an absolute directory");
  const publicRoot = resolve(builtPublicDir);
  const buildResultFile = process.env.SMARTSPEC_DEV_BUILD_RESULT?.trim();
  if (!buildResultFile || !buildResultFile.startsWith("/")) throw new Error("Canonical development build receipt is required");
  const indexPath = resolve(builtPublicDir, "index.html");
  if (!existsSync(indexPath) || !existsSync(buildResultFile)) throw new Error("Built development assets are incomplete");
  const buildResult = JSON.parse(readFileSync(buildResultFile, "utf8"));
  if (buildResult.status !== "BUILD_PASSED" || buildResult.source_revision !== sourceSha ||
      resolve(buildResult.artifact?.artifact_path || "", "public") !== publicRoot) {
    throw new Error("Built development assets do not match the verified canonical build receipt");
  }
}
const hostRuntimeEnv = Object.fromEntries(
  ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR", "XDG_RUNTIME_DIR"]
    .filter(key => process.env[key] !== undefined)
    .map(key => [key, process.env[key]])
);
console.log(
  `[dev:web] revision=${revision} port=${config.PORT} databaseMode=${config.SMARTSPEC_DEV_DATABASE_MODE || "isolated"} configuration=${envFile}`
);
if (shouldRunDevSchemaMigrations(config)) {
  console.log("[dev:web] Checking and repairing the guarded development schema before startup...");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/db-migrate-with-receipt.ts", "migrate"], {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...hostRuntimeEnv,
      ...config,
      NODE_ENV: "development",
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
    },
  });
  console.log("[dev:web] Verifying the active development schema contract...");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/audit-drizzle-catalog.ts", "--strict"], {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...hostRuntimeEnv,
      ...config,
      NODE_ENV: "development",
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
    },
  });
}
const child = spawn(
  process.execPath,
  ["--import", "tsx", "server/_core/index.ts"],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...hostRuntimeEnv,
      ...config,
      NODE_ENV: "development",
      NODE_OPTIONS: "--max-old-space-size=4096",
      DOTENV_CONFIG_PATH: envFile,
      SMARTSPEC_DEV_ENV_FILE: envFile,
      COMMIT_SHA: revision,
      RELEASE: revision,
      VITE_RELEASE: revision,
      ...(builtPublicDir ? { SMARTSPEC_DEV_BUILT_PUBLIC_DIR: builtPublicDir } : {}),
    },
  }
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", error => {
  console.error(`[dev:web] ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", code => {
  process.exitCode = code ?? 1;
});
