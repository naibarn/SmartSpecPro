import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { evaluateSourceClosureProfile, parseSourceClosureProfile } from "../server/services/spec224SourceClosureProfile";

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main(): Promise<void> {
  const repoRoot = resolve(option("--repo-root", process.cwd()));
  const profilePath = resolve(repoRoot, option("--profile", "apps/web/scripts/spec224-source-closure-web.profile.json"));
  const profileJson = JSON.parse(await readFile(profilePath, "utf8")) as unknown;
  const profile = parseSourceClosureProfile(profileJson);
  let sourceRevision: string | null = null;
  let workingTreeClean: boolean | null = null;
  let changedPathCount: number | null = null;
  try {
    sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const changes = status.split("\n").filter(Boolean);
    workingTreeClean = changes.length === 0;
    changedPathCount = changes.length;
  } catch {
    // A source closure report remains useful in an exported source tree; it is not a repository attestation.
  }
  const report = await evaluateSourceClosureProfile({ sourceRoot: repoRoot, profile, sourceRevision, workingTreeClean, changedPathCount });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status === "BLOCKED") process.exitCode = 2;
}

main().catch(error => {
  const code = error instanceof Error && /^SPEC224_[A-Z0-9_]+$/.test(error.message) ? error.message : "SPEC224_SOURCE_PROFILE_REPORT_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
});
