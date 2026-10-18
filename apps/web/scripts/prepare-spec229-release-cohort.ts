import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  buildNonProductionReleaseCohort,
  countGoldDataset,
  goldDatasetCandidateSchema,
  isReleaseCohortReady,
  validateGoldDataset,
} from "../server/services/libraryRetrievalGoldDataset";

const repoRoot = resolve(process.cwd(), "../..");
const sourceRoot = resolve(process.argv[2] ?? process.env.SPEC229_CORPUS_ROOT ?? repoRoot);
const expectedSourceSha = process.argv[3] ?? process.env.SOURCE_SHA;
const outputPath = resolve(
  repoRoot,
  process.argv[4] ?? "apps/web/server/services/libraryRetrievalGoldCandidates.release.dev.v1.json",
);
const approvalTimestamp = process.argv[5] ?? process.env.SPEC229_NONPRODUCTION_APPROVED_AT;
const inputPath = resolve(
  repoRoot,
  "apps/web/server/services/libraryRetrievalGoldCandidates.dev.v1.json",
);

function assertOutputPathIsRepositoryLocal(): void {
  const repository = realpathSync(repoRoot);
  const outputParent = realpathSync(dirname(outputPath));
  const outputRelative = relative(repository, outputPath);
  const parentRelative = relative(repository, outputParent);
  if (
    isAbsolute(outputRelative) ||
    outputRelative === ".." ||
    outputRelative.startsWith(`..${sep}`) ||
    isAbsolute(parentRelative) ||
    parentRelative === ".." ||
    parentRelative.startsWith(`..${sep}`) ||
    outputPath === inputPath
  ) {
    throw new Error("Cohort output must be a new file inside this repository");
  }
}

function assertPinnedCorpus(): string {
  if (!expectedSourceSha) {
    throw new Error("Provide the immutable repository corpus SHA");
  }
  const actualSha = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["-C", sourceRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim();
  if (actualSha !== expectedSourceSha || status) {
    throw new Error("Cohort source must be a clean worktree pinned to the requested SHA");
  }
  return actualSha;
}

const sourceSha = assertPinnedCorpus();
assertOutputPathIsRepositoryLocal();
if (!approvalTimestamp || !Number.isFinite(new Date(approvalTimestamp).getTime())) {
  throw new Error(
    "Provide the owner authorization timestamp via argument 5 or SPEC229_NONPRODUCTION_APPROVED_AT"
  );
}
const input = goldDatasetCandidateSchema.array().parse(
  JSON.parse(readFileSync(inputPath, "utf8")),
);
validateGoldDataset(input, sourceRoot);

const cohort = buildNonProductionReleaseCohort(input, approvalTimestamp);
validateGoldDataset(cohort, sourceRoot);
const counts = countGoldDataset(cohort);
if (!isReleaseCohortReady(counts)) {
  throw new Error("Derived cohort did not satisfy the existing SPEC-229 size gates");
}

const content = `${JSON.stringify(cohort, null, 2)}\n`;
writeFileSync(outputPath, content, { flag: "wx", mode: 0o644 });
process.stdout.write(`${JSON.stringify({
  status: "NON_PRODUCTION_COHORT_PREPARED_NOT_CERTIFIED",
  policyId: "SPEC229_NONPRODUCTION_REPO_SOURCE",
  sourceSha,
  outputPath,
  datasetSha256: createHash("sha256").update(content).digest("hex"),
  counts,
  certification: "NOT_CERTIFIED_UNTIL_PROFILE_OBSERVATIONS_AND_ALL_EXISTING_RELEASE_GATES_PASS",
}, null, 2)}\n`);
