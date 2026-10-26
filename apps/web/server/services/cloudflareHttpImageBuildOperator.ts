import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm, chmod } from "node:fs/promises";
import { join, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { HttpImageError, assertHttpImageBuild, httpImageLocalTag, type HttpImageBuild, type RegistryCredential } from "./cloudflareHttpImagePublication";
import type { HttpImageProvisionGrant } from "./cloudflareHttpImageProvisionContract";

const SAFE_ENV = ["PATH", "HOME", "TMPDIR", "XDG_CACHE_HOME", "DOCKER_HOST", "DOCKER_CONTEXT"];
function operatorEnvironment() {
  // Image construction/publication is an operator action, never work in an API VM.
  if (process.env.SMARTAIHUB_APPLICATION_RUNTIME === "cloudflare-http") throw new HttpImageError("HTTP_IMAGE_OPERATOR_RUNTIME_REQUIRED");
  return Object.fromEntries(SAFE_ENV.flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]));
}

/** No shell or arbitrary job command. Abort the complete owned process group
 * when current grant/lease/fence checks fail, not only when the CLI completes. */
export async function runHttpImageOperatorCommand(input: {
  command: string; args: string[]; cwd?: string; env: Record<string, string>; stdin?: string;
  timeoutMs: number; assertAuthorized(): Promise<void>;
  /** Trusted operator-only parser. Raw stderr never leaves this process. */
  classifyFailure?: (stdout: string, stderr: string) => string | undefined;
}): Promise<string> {
  await input.assertAuthorized();
  return new Promise((accept, reject) => {
    const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env,
      detached: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "", diagnosticOutput = "", failure: unknown, verifying = false, finished = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal: NodeJS.Signals) => { if (child.pid) { try { process.kill(-child.pid, signal); } catch { /* already exited */ } } };
    const abort = (error: unknown) => {
      if (failure || finished) return;
      failure = error; kill("SIGTERM");
      killTimer = setTimeout(() => kill("SIGKILL"), 2000); killTimer.unref();
    };
    const deadline = setTimeout(() => abort(new HttpImageError("HTTP_IMAGE_OPERATOR_DEADLINE_EXCEEDED")), input.timeoutMs);
    const guard = setInterval(() => {
      if (verifying || failure || finished) return;
      verifying = true;
      input.assertAuthorized().catch(abort).finally(() => { verifying = false; });
    }, 1000);
    guard.unref();
    child.stdout.on("data", data => {
      if (failure) return;
      output += data.toString();
      if (Buffer.byteLength(output) > 1_048_576) abort(new HttpImageError("HTTP_IMAGE_OPERATOR_OUTPUT_TOO_LARGE"));
    });
    // Provider and tool diagnostics may contain credentials. Never return them
    // through canonical error/status output. The fixed builder owns its log.
    if (input.classifyFailure) child.stderr.on("data", data => {
      diagnosticOutput += data.toString();
      if (Buffer.byteLength(diagnosticOutput) > 65_536) diagnosticOutput = diagnosticOutput.slice(-32_768);
    });
    else child.stderr.resume();
    child.stdin.on("error", () => undefined);
    child.stdin.end(input.stdin);
    const finish = (error?: unknown) => {
      finished = true; clearTimeout(deadline); clearInterval(guard);
      if (killTimer) clearTimeout(killTimer);
      if (failure || error) reject(failure ?? error); else accept(output);
    };
    child.once("error", () => finish(new HttpImageError("HTTP_IMAGE_OPERATOR_UNAVAILABLE")));
    child.once("close", code => {
      let diagnostic = "HTTP_IMAGE_OPERATOR_FAILED";
      if (input.classifyFailure) {
        const safe = input.classifyFailure(output, diagnosticOutput);
        if (safe && /^[A-Z][A-Z0-9_]{4,120}$/.test(safe)) diagnostic = safe;
      }
      if (input.command === "python3") {
        try {
          const value = JSON.parse(output);
          if (value.schemaVersion === "cloudflare-http-image-build-error-v1" &&
              /^HTTP_IMAGE_[A-Z_]{4,100}$/.test(value.diagnosticCode)) diagnostic = value.diagnosticCode;
        } catch { /* Never expose tool stderr or arbitrary stdout as a diagnostic. */ }
      }
      const error = new HttpImageError(diagnostic);
      if (input.classifyFailure) Object.assign(error, { diagnosticCode: diagnostic });
      finish(code === 0 ? undefined : error);
    });
  });
}

export function createHttpImageBuildOperator(assertAuthorized: () => Promise<void>) {
  const env = operatorEnvironment();
  const command = (name: string, args: string[], options: { cwd?: string; stdin?: string; timeoutMs?: number; env?: Record<string, string> } = {}) =>
    runHttpImageOperatorCommand({ command: name, args, env: options.env ?? env, assertAuthorized,
      timeoutMs: options.timeoutMs ?? 15_000, cwd: options.cwd, stdin: options.stdin });
  return {
    async build(g: HttpImageProvisionGrant) {
      // Paths come from server configuration and its trusted canonical ledger;
      // callers supply only a validated SHA/build ID, never filesystem paths.
      const configured = process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT?.trim();
      if (!configured || !isAbsolute(configured)) throw new HttpImageError("HTTP_IMAGE_CANONICAL_STORE_REQUIRED");
      const root = await realpath(configured), path = join(root, `${g.plan.buildId}.json`);
      if (await realpath(path) !== path) throw new HttpImageError("HTTP_IMAGE_CANONICAL_RECEIPT_DENIED");
      const record = JSON.parse(await readFile(path, "utf8"));
      if (record.status !== "BUILD_PASSED" || record.canonical_ref !== "refs/heads/main" || record.source_verified !== true ||
          record.source_revision !== g.plan.sourceSha || record.canonical_tip_after_build !== g.plan.sourceSha ||
          typeof record.isolated_workspace !== "string" || !isAbsolute(record.isolated_workspace) || record.result_file !== path)
        throw new HttpImageError("HTTP_IMAGE_CANONICAL_RECEIPT_DENIED");
      const workspace = await realpath(record.isolated_workspace);
      // The receipt store and build workspace share the same configured source
      // root, and the Python packager rechecks policy roots + all artifact hashes.
      const sourceRoot = resolve(root, "../..");
      if (!relative(sourceRoot, workspace) || relative(sourceRoot, workspace).startsWith("..") || workspace === sourceRoot)
        throw new HttpImageError("HTTP_IMAGE_CANONICAL_SOURCE_DENIED");
      if ((await command("git", ["-C", workspace, "rev-parse", "HEAD"])).trim() !== g.plan.sourceSha)
        throw new HttpImageError("HTTP_IMAGE_CANONICAL_SOURCE_DENIED");
      const dirty = await command("git", ["-C", workspace, "status", "--porcelain=v1", "--untracked-files=all", "--",
        ".", ":(exclude)apps/web/dist", ":(exclude)apps/web/dist/**", ":(exclude)apps/cloudflare/.staging-artifact", ":(exclude)apps/cloudflare/.staging-artifact/**"]);
      if (dirty.trim()) throw new HttpImageError("HTTP_IMAGE_CANONICAL_SOURCE_DIRTY");
      const output = await mkdtemp(join(tmpdir(), "smartspec-http-image-"));
      await chmod(output, 0o700);
      try {
        const result = await command("python3", [join(workspace, "apps/web/scripts/build_cloudflare_http_image.py"),
          "--build-result", path, "--output", join(output, "build"), "--runtime", g.plan.runtime,
          "--tag", httpImageLocalTag(g), "--source-sha", g.plan.sourceSha, "--job-id", g.jobId, "--plan-digest", g.planDigest,
          "--build-budget-seconds", String(g.plan.buildBudgetSeconds)],
          { cwd: workspace, timeoutMs: g.plan.buildBudgetSeconds * 1000 });
        return assertHttpImageBuild(g, JSON.parse(result));
      } finally {
        // The fixed builder has exited (or its group was cancelled). Retain
        // logs/digest receipts, but not a second multi-GB copy of runtime files.
        await rm(join(output, "build/context"), { recursive: true, force: true });
      }
    },
    async push(g: HttpImageProvisionGrant, build: HttpImageBuild, credential: RegistryCredential) {
      assertHttpImageBuild(g, build);
      const dockerConfig = await mkdtemp(join(tmpdir(), "smartspec-http-registry-"));
      await chmod(dockerConfig, 0o700);
      const publishEnv = { ...env, DOCKER_CONFIG: dockerConfig };
      const remote = `registry.cloudflare.com/${g.accountRef}/${httpImageLocalTag(g)}`;
      try {
        // Use content ID rather than a mutable local tag; scope/entrypoint was
        // verified by the fixed builder and bound into the durable checkpoint.
        await command("docker", ["image", "tag", build.imageId, remote], { env: publishEnv });
        await command("docker", ["login", "--password-stdin", "--username", credential.username, "registry.cloudflare.com"],
          { env: publishEnv, stdin: credential.password });
        await command("docker", ["image", "push", remote], { env: publishEnv, timeoutMs: 240_000 });
      } finally {
        // Only this owned temporary credential directory; never developer login.
        await rm(dockerConfig, { recursive: true, force: true });
      }
    },
  };
}

/** Read-only publication preflight. Select a real canonical receipt, never an
 * engineering image tag or a request-supplied filesystem path. The executor
 * independently rechecks the receipt, workspace and all packaged artifacts. */
export async function resolveHttpImageCanonicalSource(accept: (source: { sourceSha: string; buildId: string }) => boolean = () => true) {
  const configured = process.env.SMARTSPEC_CANONICAL_BUILD_RESULTS_ROOT?.trim();
  if (!configured || !isAbsolute(configured)) throw new HttpImageError("HTTP_IMAGE_CANONICAL_STORE_REQUIRED");
  const root = await realpath(configured);
  const candidates: Array<{ sourceSha: string; buildId: string; completedAt: number }> = [];
  for (const name of await readdir(root)) {
    if (!/^[a-f0-9]{40}-[a-f0-9-]{36}\.json$/.test(name)) continue;
    const path = join(root, name);
    try {
      if (await realpath(path) !== path) continue;
      const record = JSON.parse(await readFile(path, "utf8"));
      if (record.status !== "BUILD_PASSED" || record.canonical_ref !== "refs/heads/main" || record.source_verified !== true ||
          record.canonical_tip_after_build !== record.source_revision || record.result_file !== path ||
          !name.startsWith(record.source_revision + "-") || !isAbsolute(record.isolated_workspace)) continue;
      const workspace = await realpath(record.isolated_workspace), sourceRoot = resolve(root, "../..");
      const relation = relative(sourceRoot, workspace);
      if (!relation || relation.startsWith("..")) continue;
      const revision = (await runHttpImageOperatorCommand({ command: "git", args: ["-C", workspace, "rev-parse", "HEAD"],
        env: operatorEnvironment(), assertAuthorized: async () => undefined, timeoutMs: 5000 })).trim();
      if (revision !== record.source_revision) continue;
      const dirty = await runHttpImageOperatorCommand({ command: "git", args: ["-C", workspace, "status", "--porcelain=v1", "--untracked-files=all", "--",
        ".", ":(exclude)apps/web/dist", ":(exclude)apps/web/dist/**", ":(exclude)apps/cloudflare/.staging-artifact", ":(exclude)apps/cloudflare/.staging-artifact/**"],
        env: operatorEnvironment(), assertAuthorized: async () => undefined, timeoutMs: 5000 });
      if (dirty.trim()) continue;
      candidates.push({ sourceSha: revision, buildId: name.slice(0, -5), completedAt: Number(record.completed_at) || 0 });
    } catch { /* An incomplete/unavailable receipt cannot authorize publication. */ }
  }
  candidates.sort((a, b) => b.completedAt - a.completedAt || a.buildId.localeCompare(b.buildId));
  const selected = candidates.find(source => accept({ sourceSha: source.sourceSha, buildId: source.buildId }));
  if (!selected) throw new HttpImageError("HTTP_IMAGE_CANONICAL_RECEIPT_UNAVAILABLE");
  return { sourceSha: selected.sourceSha, buildId: selected.buildId };
}
