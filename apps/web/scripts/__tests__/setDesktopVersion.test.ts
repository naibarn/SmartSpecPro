import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const versionScriptPath = fileURLToPath(new URL("../../../../scripts/set-desktop-version.mjs", import.meta.url));

describe("set-desktop-version", () => {
  it("does not fail when the requested version is already in a CRLF Cargo.toml", async () => {
    const fixtureRoot = await mkdtemp(`${tmpdir()}/smartaihub-desktop-version-`);
    const tauriRoot = `${fixtureRoot}/apps/tauri-shell/src-tauri`;

    try {
      await mkdir(tauriRoot, { recursive: true });
      await mkdir(`${fixtureRoot}/scripts`, { recursive: true });
      await cp(versionScriptPath, `${fixtureRoot}/scripts/set-desktop-version.mjs`);
      await writeFile(
        `${tauriRoot}/tauri.conf.json`,
        JSON.stringify({ version: "0.1.0" }, null, 2),
      );
      await writeFile(
        `${tauriRoot}/Cargo.toml`,
        '[package]\r\nname = "smartspec-tauri-shell"\r\nversion = "0.1.1"\r\ndescription = "SmartAIHub Desktop Shell"\r\n',
        "utf8",
      );

      await execFileAsync(process.execPath, [
        `${fixtureRoot}/scripts/set-desktop-version.mjs`,
        "--version",
        "v0.1.1",
      ]);

      const cargo = await readFile(`${tauriRoot}/Cargo.toml`, "utf8");
      const tauriConfig = JSON.parse(await readFile(`${tauriRoot}/tauri.conf.json`, "utf8")) as {
        version?: string;
      };
      expect(cargo).toContain('version = "0.1.1"\r\n');
      expect(tauriConfig.version).toBe("0.1.1");
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
