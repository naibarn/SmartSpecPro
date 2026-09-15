import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

type CheckResult = { name: string; ok: boolean; output: string };

const root = join(import.meta.dirname, "..", "..", "..");
const checks: CheckResult[] = [];

function run(name: string, command: string, args: string[], cwd = root, env: NodeJS.ProcessEnv = process.env): void {
  try {
    const output = execFileSync(command, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    checks.push({ name, ok: true, output: output.trim().slice(-2_000) });
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string; message?: string };
    checks.push({
      name,
      ok: false,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.message ?? ""}`.trim().slice(-2_000),
    });
  }
}

run("cloudflare_contracts", "npm", ["--workspace", "@smartspec/cloudflare-runtime", "test", "--", "--run", "src/contracts.test.ts"]);
run("web_feature_192_contracts", "npm", ["--workspace", "@smartspec/web", "exec", "vitest", "run", "scripts/__tests__/verify-feature-192-inventory.test.ts", "scripts/__tests__/verify-feature-192-migrations.test.ts", "server/jobs/__tests__/feature192TimerPolicy.test.ts"]);
run("web_local_verifier", "npm", ["--workspace", "@smartspec/web", "run", "verify:feature-192"]);

const python = join(root, "python-backend");
if (!existsSync(join(python, "pyproject.toml"))) {
  checks.push({ name: "python_pytest", ok: false, output: "PYTHON_PROJECT_MISSING" });
} else {
  run(
    "python_pytest",
    "uv",
    ["run", "pytest", "-o", "addopts=", "tests/services/test_postgres_job_worker.py", "tests/services/test_job_control_plane.py"],
    python,
    { ...process.env, DEBUG: "false" },
  );
}

const result = {
  feature: 192,
  state: checks.every(check => check.ok) ? "FOCUSED_LOCAL_VERIFICATION_PASSED" : "FOCUSED_LOCAL_VERIFICATION_BLOCKED",
  checks,
  missingPrerequisites: checks.filter(check => /No module named pytest|PYTHON_PROJECT_MISSING/.test(check.output)).map(check => check.name),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!checks.every(check => check.ok)) process.exitCode = 1;
