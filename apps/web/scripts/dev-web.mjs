#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { parse } from "dotenv";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(
  process.env.SMARTSPEC_DEV_ENV_FILE ||
    `${homedir()}/.config/smartspec-dev/web.env`
);
let config;
try {
  config = parse(readFileSync(envFile));
  if (config.SMARTSPEC_ENVIRONMENT !== "development")
    throw new Error("Dev environment marker is missing");
  const database = new URL(config.DATABASE_URL);
  if (!database.pathname.endsWith("_dev_web"))
    throw new Error("Use a dedicated database ending in _dev_web");
  if (!config.JWT_SECRET || !config.LLM_ENCRYPTION_KEY)
    throw new Error("Dev authentication/encryption keys are missing");
  if (!config.PORT || config.PORT === "3000")
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
console.log(
  `[dev:web] revision=${revision} port=${config.PORT} configuration=${envFile}`
);
const child = spawn(
  process.execPath,
  ["--import", "tsx", "server/_core/index.ts"],
  {
    cwd: appRoot,
    stdio: "inherit",
    env: {
      ...Object.fromEntries(
        [
          "PATH",
          "HOME",
          "USER",
          "LOGNAME",
          "LANG",
          "LC_ALL",
          "TMPDIR",
          "XDG_RUNTIME_DIR",
        ]
          .filter(key => process.env[key] !== undefined)
          .map(key => [key, process.env[key]])
      ),
      ...config,
      NODE_ENV: "development",
      NODE_OPTIONS: "--max-old-space-size=4096",
      DOTENV_CONFIG_PATH: envFile,
      SMARTSPEC_DEV_ENV_FILE: envFile,
      COMMIT_SHA: revision,
      RELEASE: revision,
      VITE_RELEASE: revision,
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
