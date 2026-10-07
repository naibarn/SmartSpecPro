import dotenv from "dotenv";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Compatibility entry point for the former one-off memory schema patch. The
// columns and enum values are part of the Drizzle history; never mutate them
// through an untracked SQL path.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(appRoot, ".env") });

const child = spawn("pnpm", ["run", "db:migrate"], { cwd: appRoot, env: process.env, stdio: "inherit" });
child.once("error", error => {
  console.error("Unable to start the canonical migration runner:", error.name);
  process.exitCode = 127;
});
child.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
