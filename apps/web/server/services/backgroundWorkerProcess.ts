import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { dirname, join } from "node:path";

export type DetachedWorkerStart = {
  pid: number | null;
  scriptPath: string;
};

function resolveWebRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "server"))) return cwd;
  const workspaceWebRoot = join(cwd, "apps/web");
  if (existsSync(join(workspaceWebRoot, "server"))) return workspaceWebRoot;
  return cwd;
}

function resolveWorkerLogPath(webRoot: string): string {
  return process.env.SMARTSPEC_WORKER_LOG_PATH || join(webRoot, "server-worker-runtime.log");
}

export function startDetachedTsxWorker(
  scriptFromWebRoot: string,
  args: readonly string[],
): DetachedWorkerStart {
  const webRoot = resolveWebRoot();
  const scriptPath = join(webRoot, scriptFromWebRoot);
  if (!existsSync(scriptPath)) {
    throw new Error(`Background worker entrypoint not found: ${scriptPath}`);
  }

  const logPath = resolveWorkerLogPath(webRoot);
  mkdirSync(dirname(logPath), { recursive: true });
  const outFd = openSync(logPath, "a");
  const errFd = openSync(logPath, "a");
  const child = spawn(process.execPath, ["--import", "tsx", scriptPath, ...args], {
    cwd: webRoot,
    detached: true,
    env: {
      ...process.env,
      SMARTSPEC_BACKGROUND_WORKER: "true",
    },
    stdio: ["ignore", outFd, errFd],
  });
  closeSync(outFd);
  closeSync(errFd);
  child.unref();
  return {
    pid: child.pid ?? null,
    scriptPath,
  };
}

export function startDetachedHyperframesRenderWorker(input: {
  renderJobId?: string;
  limit?: number;
}): DetachedWorkerStart {
  const args: string[] = [];
  if (input.renderJobId) args.push("--render-job-id", input.renderJobId);
  if (input.limit) args.push("--limit", String(input.limit));
  return startDetachedTsxWorker("server/workers/hyperframesRenderWorkerCli.ts", args);
}

export function startDetachedStoryboardReviewTranscribeWorker(input: {
  jobId: string;
}): DetachedWorkerStart {
  return startDetachedTsxWorker("server/workers/storyboardReviewTranscribeWorkerCli.ts", [
    "--job-id",
    input.jobId,
  ]);
}

export function startDetachedStoryboardPreviewMatchCaptureWorker(input: {
  captureJobId: string;
}): DetachedWorkerStart {
  return startDetachedTsxWorker("server/workers/storyboardPreviewMatchCaptureWorkerCli.ts", [
    "--capture-job-id",
    input.captureJobId,
  ]);
}
