import { chmod, readdir, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

async function makeDirectoriesRemovable(directory: string): Promise<void> {
  await chmod(directory, 0o700);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await makeDirectoriesRemovable(path.join(directory, entry.name));
    }
  }
}

export default async function globalTeardown(
  config: FullConfig
): Promise<void> {
  const outputRunId = path.basename(config.outputDir ?? "");
  const runId = (process.env.SMARTSPEC_UAT_RUN_ID || outputRunId)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  if (!runId) return;
  const prefix = `smarthub-moli-uat-${runId}-`;
  let units: string[] = [];
  try {
    const output = execFileSync(
      "sudo",
      [
        "-n",
        "systemctl",
        "list-units",
        "--all",
        "--plain",
        "--no-legend",
        "--no-pager",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 10_000,
      }
    );
    units = output
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/)[0] || "")
      .filter(unit => unit.startsWith(prefix) && unit.endsWith(".service"));
  } catch {
    throw new Error("MOLI_UAT_UNIT_DISCOVERY_FAILED");
  }
  for (const unit of units) {
    try {
      execFileSync("sudo", ["-n", "systemctl", "stop", unit], {
        stdio: "ignore",
        timeout: 10_000,
      });
    } catch {
      throw new Error("MOLI_UAT_UNIT_CLEANUP_FAILED");
    }
  }
  const rootfsPrefix = `/tmp/smarthub-moli-uat-rootfs-${runId}`;
  const tempEntries = await readdir("/tmp", { withFileTypes: true });
  const runRootfsPaths = tempEntries
    .filter(
      entry =>
        entry.isDirectory() &&
        path.join("/tmp", entry.name).startsWith(rootfsPrefix)
    )
    .map(entry => path.join("/tmp", entry.name));
  for (const rootfs of runRootfsPaths) {
    await makeDirectoriesRemovable(rootfs);
    await rm(rootfs, { recursive: true, force: false });
    await rm(`${rootfs}.provenance.json`, { force: true });
  }
}
