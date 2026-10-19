import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const preparedRuntimes = new Map<string, Promise<void>>();

/** Keep dependency installation outside immutable release artifacts. */
export async function prepareEnhancedBridgeRuntime(skillRoot: string): Promise<{
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}> {
  const home = process.env.HOME?.trim() || homedir();
  const dependencyHash = createHash("sha256")
    .update(readFileSync(resolve(skillRoot, "pyproject.toml")))
    .update(readFileSync(resolve(skillRoot, "uv.lock")))
    .digest("hex");
  const environmentRoot = resolve(
    home,
    ".cache/smartaihub/enhanced-video-director",
    dependencyHash
  );
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: home,
    PYTHONUNBUFFERED: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    // Import repository-owned code in place so __file__ still locates schemas
    // and prompts. Installing the project would write build/egg-info in it.
    PYTHONPATH: resolve(skillRoot, "src"),
    UV_PROJECT_ENVIRONMENT: environmentRoot,
  };
  const command = resolve(
    environmentRoot,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python"
  );
  let preparation = preparedRuntimes.get(environmentRoot);
  if (!preparation) {
    const uv =
      [
        "/usr/local/bin/uv",
        "/usr/bin/uv",
        resolve(home, ".local/bin/uv"),
        resolve(home, ".cargo/bin/uv"),
      ].find(candidate => existsSync(candidate)) ?? "uv";
    preparation = execFileAsync(
      uv,
      ["sync", "--frozen", "--no-install-project", "--project", skillRoot],
      {
        cwd: skillRoot,
        env,
        timeout: 60_000,
        killSignal: "SIGKILL",
        maxBuffer: 64 * 1024,
      }
    )
      .then(() => undefined)
      .catch(() => {
        preparedRuntimes.delete(environmentRoot);
        // Never expose subprocess stderr: it may contain package-index credentials.
        throw new Error("Enhanced bridge dependency preparation failed");
      });
    preparedRuntimes.set(environmentRoot, preparation);
  }
  await preparation;
  return {
    command,
    args: ["-m", "smartaihub_video_director.enhanced_bridge"],
    env,
  };
}
