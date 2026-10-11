import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const OWNER_MARKER = ".spec224-disposable-owner.json";
const MAX_REPAIR_ATTEMPTS = 2;

export type FixtureScope = { runId: string; tenantId: string; actorId: number; workUnitId: string };
type Artifact = { ref: string; sha256: string; path: string };
type WriteStage = "implementation" | "repair";
type AssertJobActive = (input: { stage: WriteStage; repoPath: string }) => Promise<void>;

export type CandidateResult = {
  baseSha: string;
  failedCandidateSha: string;
};

export type CandidateTestResult = {
  exitCode: number;
  stdoutDigest: string;
  stderrDigest: string;
  artifactRef: string;
};

export type RepairResult = {
  candidateSha: string;
  retryCandidateSha: string;
  attempts: number;
};

export type Spec224DisposableGitAcceptance = {
  mode: "SYNTHETIC";
  scope: FixtureScope;
  baseSha: string;
  failedCandidateSha: string;
  candidateSha: string;
  repairAttempts: number;
  retryCandidateSha: string;
  initialTestExitCode: number;
  repairedTestExitCode: number;
  initialTestStdoutDigest: string;
  initialTestStderrDigest: string;
  repairedTestStdoutDigest: string;
  repairedTestStderrDigest: string;
  diffDigest: string;
  evidenceDigest: string;
  artifactRefs: string[];
  artifactDigests: Array<{ ref: string; sha256: string }>;
  evidenceArtifacts: Array<{ ref: string; sha256: string; contentBase64: string }>;
  verifierPid: number;
  verifierProfile: string;
  verifierSourceSha: string;
};

export type Spec224DisposableGitSession = {
  repoPath: string;
  implementCandidate(): Promise<CandidateResult>;
  runCandidateTest(): Promise<CandidateTestResult>;
  repairCandidate(): Promise<RepairResult>;
  runRepairedTest(): Promise<CandidateTestResult>;
  independentlyVerify(): Promise<Spec224DisposableGitAcceptance>;
  close(): Promise<void>;
};

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function git(repo: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repo,
    timeout: 10_000,
    maxBuffer: 128 * 1024,
  });
  return stdout.trim();
}

async function runAcceptanceTest(repo: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync("python3", ["-m", "unittest", "-v"], {
      cwd: repo,
      timeout: 15_000,
      maxBuffer: 128 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as Error & { code?: number; stdout?: string; stderr?: string };
    if (typeof result.code !== "number") throw error;
    return { exitCode: result.code, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }
}

function appSource(mode: "base" | "candidate" | "repaired"): string {
  if (mode === "repaired") {
    return [
      "def normalize_label(raw):",
      "    if not isinstance(raw, str):",
      "        raise TypeError('label must be a string')",
      "    normalized = raw.strip()",
      "    if not normalized:",
      "        raise ValueError('label must not be blank')",
      "    return normalized",
      "",
    ].join("\n");
  }
  if (mode === "candidate") return "def normalize_label(raw):\n    return raw.strip()\n";
  return "def normalize_label(raw):\n    return raw\n";
}

const testSource = [
  "import unittest",
  "from app import normalize_label",
  "",
  "class NormalizeLabelAcceptance(unittest.TestCase):",
  "    def test_trims_outer_whitespace(self):",
  "        self.assertEqual(normalize_label('  SmartAIHub  '), 'SmartAIHub')",
  "",
  "    def test_rejects_blank_label(self):",
  "        with self.assertRaises(ValueError):",
  "            normalize_label('   ')",
  "",
  "    def test_rejects_non_string_label(self):",
  "        with self.assertRaises(TypeError):",
  "            normalize_label(None)",
  "",
  "if __name__ == '__main__':",
  "    unittest.main()",
  "",
].join("\n");

export async function createSpec224DisposableGitSession(
  scope: FixtureScope,
  assertJobActive: AssertJobActive,
): Promise<Spec224DisposableGitSession> {
  const root = await mkdtemp(path.join(tmpdir(), "spec224-disposable-git-"));
  const repoPath = path.join(root, "repository");
  const evidenceDir = path.join(root, "evidence");
  const expectedOwner = JSON.stringify(scope);
  let ownerConfirmed = false;
  let candidate: CandidateResult | null = null;
  let candidateTest: CandidateTestResult | null = null;
  let repair: RepairResult | null = null;
  let repairedTest: CandidateTestResult | null = null;
  let closed = false;

  try {
    await mkdir(repoPath);
    await mkdir(evidenceDir);
    await writeFile(path.join(repoPath, OWNER_MARKER), expectedOwner, { flag: "wx" });
    ownerConfirmed = true;
    await git(repoPath, "init", "--quiet");
    await git(repoPath, "config", "user.name", "Spec 224 Synthetic Acceptance");
    await git(repoPath, "config", "user.email", "spec224-synthetic@example.invalid");
    await writeFile(path.join(repoPath, "app.py"), appSource("base"));
    await writeFile(path.join(repoPath, "test_app.py"), testSource);
    await writeFile(path.join(repoPath, "acceptance.json"), JSON.stringify({
      scope,
      objective: "Normalize nonblank text labels; reject blank and non-string inputs.",
      tests: ["trims outer whitespace", "rejects blank label", "rejects non-string label"],
    }, null, 2) + "\n");
    await git(repoPath, "add", "--", OWNER_MARKER, "app.py", "test_app.py", "acceptance.json");
    await git(repoPath, "commit", "--quiet", "-m", "Acceptance fixture baseline");
  } catch (error) {
    if (ownerConfirmed) {
      const owner = await readFile(path.join(repoPath, OWNER_MARKER), "utf8").catch(() => "");
      if (owner === expectedOwner) await rm(root, { recursive: true, force: false });
    }
    throw error;
  }

  async function requireOpen() {
    if (closed) throw new Error("DISPOSABLE_FIXTURE_ALREADY_CLOSED");
  }

  return {
    repoPath,
    async implementCandidate() {
      await requireOpen();
      if (candidate) return candidate;
      await assertJobActive({ stage: "implementation", repoPath });
      const baseSha = await git(repoPath, "rev-parse", "HEAD");
      await writeFile(path.join(repoPath, "app.py"), appSource("candidate"));
      await git(repoPath, "add", "--", "app.py");
      await git(repoPath, "commit", "--quiet", "-m", "Synthetic implementation candidate");
      candidate = { baseSha, failedCandidateSha: await git(repoPath, "rev-parse", "HEAD") };
      return candidate;
    },
    async runCandidateTest() {
      await requireOpen();
      if (!candidate) throw new Error("SPEC224_IMPLEMENTATION_CANDIDATE_REQUIRED");
      if (candidateTest) return candidateTest;
      const result = await runAcceptanceTest(repoPath);
      if (result.exitCode === 0 || !result.stderr.includes("FAILED")) throw new Error("INITIAL_FUNCTIONAL_FAILURE_NOT_REPRODUCED");
      const artifactRef = `evidence:spec224-disposable:${scope.runId}:failed-test.json`;
      await writeFile(path.join(evidenceDir, "failed-test.json"), JSON.stringify({
        command: "python3 -m unittest -v",
        exitCode: result.exitCode,
        stdoutDigest: sha256(result.stdout),
        stderrDigest: sha256(result.stderr),
        classification: "FUNCTIONAL_TEST_FAILURE",
      }, null, 2) + "\n");
      candidateTest = {
        exitCode: result.exitCode,
        stdoutDigest: sha256(result.stdout),
        stderrDigest: sha256(result.stderr),
        artifactRef,
      };
      return candidateTest;
    },
    async repairCandidate() {
      await requireOpen();
      if (!candidate || !candidateTest) throw new Error("SPEC224_FAILED_TEST_REQUIRED_BEFORE_REPAIR");
      if (repair) return repair;
      let attempts = 0;
      const applyBoundedRepair = async (): Promise<string> => {
        if (attempts >= MAX_REPAIR_ATTEMPTS) throw new Error("REPAIR_ATTEMPT_LIMIT_REACHED");
        await assertJobActive({ stage: "repair", repoPath });
        attempts += 1;
        await writeFile(path.join(repoPath, "app.py"), appSource("repaired"));
        await git(repoPath, "add", "--", "app.py");
        let changed: boolean;
        try {
          await git(repoPath, "diff", "--cached", "--quiet");
          changed = false;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 1) throw error;
          changed = true;
        }
        if (changed) await git(repoPath, "commit", "--quiet", "-m", "Synthetic bounded repair");
        return git(repoPath, "rev-parse", "HEAD");
      };
      const candidateSha = await applyBoundedRepair();
      const retryCandidateSha = await applyBoundedRepair();
      if (candidateSha !== retryCandidateSha) throw new Error("REPAIR_RETRY_DUPLICATED_EFFECT");
      const repairExhausted = await applyBoundedRepair().then(() => false).catch(error => error instanceof Error && error.message === "REPAIR_ATTEMPT_LIMIT_REACHED");
      if (!repairExhausted) throw new Error("REPAIR_ATTEMPT_BOUND_NOT_ENFORCED");
      repair = { candidateSha, retryCandidateSha, attempts };
      return repair;
    },
    async runRepairedTest() {
      await requireOpen();
      if (!repair) throw new Error("SPEC224_REPAIRED_CANDIDATE_REQUIRED");
      if (repairedTest) return repairedTest;
      const result = await runAcceptanceTest(repoPath);
      if (result.exitCode !== 0) throw new Error("BOUNDED_REPAIR_DID_NOT_PASS");
      const artifactRef = `evidence:spec224-disposable:${scope.runId}:repair-test.json`;
      await writeFile(path.join(evidenceDir, "repair-test.json"), JSON.stringify({
        command: "python3 -m unittest -v",
        exitCode: result.exitCode,
        stdoutDigest: sha256(result.stdout),
        stderrDigest: sha256(result.stderr),
        repairAttempts: repair.attempts,
        maxRepairAttempts: MAX_REPAIR_ATTEMPTS,
      }, null, 2) + "\n");
      repairedTest = {
        exitCode: result.exitCode,
        stdoutDigest: sha256(result.stdout),
        stderrDigest: sha256(result.stderr),
        artifactRef,
      };
      return repairedTest;
    },
    async independentlyVerify() {
      await requireOpen();
      if (!candidate || !candidateTest || !repair || !repairedTest) throw new Error("SPEC224_ACCEPTANCE_EVIDENCE_INCOMPLETE");
      const candidateSha = await git(repoPath, "rev-parse", "HEAD");
      if (candidateSha !== repair.candidateSha) throw new Error("CANDIDATE_SHA_STALE");
      await writeFile(path.join(evidenceDir, "acceptance.json"), await readFile(path.join(repoPath, "acceptance.json")));
      const diff = await git(repoPath, "diff", "--binary", `${candidate.baseSha}..${candidateSha}`);
      await writeFile(path.join(evidenceDir, "candidate.diff"), diff);
      const diffDigest = sha256(diff);

      const filenames = ["acceptance.json", "candidate.diff", "failed-test.json", "repair-test.json"];
      const artifacts: Artifact[] = await Promise.all(filenames.map(async filename => {
        const artifactPath = path.join(evidenceDir, filename);
        const content = await readFile(artifactPath);
        return { ref: `evidence:spec224-disposable:${scope.runId}:${filename}`, sha256: sha256(content), path: artifactPath };
      }));
      const artifactRefs = artifacts.map(artifact => artifact.ref);
      const evidenceDigest = sha256(JSON.stringify(artifacts.map(({ ref, sha256: digest }) => ({ ref, sha256: digest }))));

      const helperPath = fileURLToPath(import.meta.url);
      const childScript = `
        import { independentlyVerifySpec224DisposableGitAcceptance } from ${JSON.stringify(helperPath)};
        const input = JSON.parse(process.env.SPEC224_VERIFY_INPUT);
        const result = await independentlyVerifySpec224DisposableGitAcceptance(input);
        process.stdout.write("SPEC224_VERIFY:" + JSON.stringify(result) + "\\n");
      `;
      const expected = { scope, baseSha: candidate.baseSha, candidateSha, evidenceDigest, artifactRefs };
      const executeVerifier = async (verifierInput: typeof expected): Promise<string | null> =>
        execFileAsync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", childScript], {
          cwd: process.cwd(),
          env: { ...process.env, SPEC224_VERIFY_INPUT: JSON.stringify({ repoPath, evidenceDir, expected: verifierInput }) },
          timeout: 30_000,
          maxBuffer: 128 * 1024,
        }).then(result => result.stdout).catch(error => String((error as Error & { stderr?: string }).stderr ?? (error as Error).message));
      const verifierOutput = await executeVerifier(expected);
      if (!verifierOutput) throw new Error("INDEPENDENT_VERIFIER_RESULT_MISSING");
      const resultLine = verifierOutput.split(/\r?\n/).find(line => line.startsWith("SPEC224_VERIFY:"));
      if (!resultLine) throw new Error("INDEPENDENT_VERIFIER_RESULT_MISSING");
      const verification = JSON.parse(resultLine.slice("SPEC224_VERIFY:".length)) as { pid: number; sourceSha: string; profile: string };
      if (verification.pid === process.pid || verification.sourceSha !== candidateSha) throw new Error("INDEPENDENT_VERIFIER_BINDING_INVALID");

      const staleAttempt = await executeVerifier({ ...expected, candidateSha: candidate.baseSha });
      if (!staleAttempt?.includes("CANDIDATE_SHA_STALE")) throw new Error("STALE_CANDIDATE_NOT_REJECTED");
      const foreignAttempt = await executeVerifier({ ...expected, scope: { ...scope, tenantId: `${scope.tenantId}-foreign` } });
      if (!foreignAttempt?.includes("FOREIGN_RUN_EVIDENCE")) throw new Error("FOREIGN_TENANT_EVIDENCE_NOT_REJECTED");
      const conflictAttempt = await executeVerifier({ ...expected, evidenceDigest: "0".repeat(64) });
      if (!conflictAttempt?.includes("EVIDENCE_DIGEST_MISMATCH")) throw new Error("CONFLICTING_EVIDENCE_DIGEST_NOT_REJECTED");

      return {
        mode: "SYNTHETIC",
        scope,
        baseSha: candidate.baseSha,
        failedCandidateSha: candidate.failedCandidateSha,
        candidateSha,
        repairAttempts: repair.attempts,
        retryCandidateSha: repair.retryCandidateSha,
        initialTestExitCode: candidateTest.exitCode,
        repairedTestExitCode: repairedTest.exitCode,
        initialTestStdoutDigest: candidateTest.stdoutDigest,
        initialTestStderrDigest: candidateTest.stderrDigest,
        repairedTestStdoutDigest: repairedTest.stdoutDigest,
        repairedTestStderrDigest: repairedTest.stderrDigest,
        diffDigest,
        evidenceDigest,
        artifactRefs,
        artifactDigests: artifacts.map(({ ref, sha256: digest }) => ({ ref, sha256: digest })),
        evidenceArtifacts: await Promise.all(artifacts.map(async artifact => ({
          ref: artifact.ref,
          sha256: artifact.sha256,
          contentBase64: (await readFile(artifact.path)).toString("base64"),
        }))),
        verifierPid: verification.pid,
        verifierProfile: verification.profile,
        verifierSourceSha: verification.sourceSha,
      };
    },
    async close() {
      if (closed) return;
      if (!ownerConfirmed) throw new Error("DISPOSABLE_FIXTURE_OWNER_NOT_ESTABLISHED");
      const owner = await readFile(path.join(repoPath, OWNER_MARKER), "utf8").catch(() => "");
      if (owner !== expectedOwner) throw new Error("DISPOSABLE_FIXTURE_OWNER_MISMATCH");
      await rm(root, { recursive: true, force: false });
      closed = true;
    },
  };
}

export async function independentlyVerifySpec224DisposableGitAcceptance(input: {
  repoPath: string;
  evidenceDir: string;
  expected: Pick<Spec224DisposableGitAcceptance, "scope" | "baseSha" | "candidateSha" | "evidenceDigest" | "artifactRefs">;
}): Promise<{ pid: number; sourceSha: string; profile: string; testsPassed: boolean }> {
  const marker = JSON.parse(await readFile(path.join(input.repoPath, OWNER_MARKER), "utf8")) as FixtureScope;
  if (["runId", "tenantId", "actorId", "workUnitId"].some(key => marker[key as keyof FixtureScope] !== input.expected.scope[key as keyof FixtureScope])) {
    throw new Error("FOREIGN_RUN_EVIDENCE");
  }
  const sourceSha = await git(input.repoPath, "rev-parse", "HEAD");
  if (sourceSha !== input.expected.candidateSha) throw new Error("CANDIDATE_SHA_STALE");
  await git(input.repoPath, "merge-base", "--is-ancestor", input.expected.baseSha, sourceSha);
  const changedFiles = await git(input.repoPath, "diff", "--name-only", input.expected.baseSha, sourceSha);
  if (!changedFiles.split(/\r?\n/).includes("app.py")) throw new Error("IMPLEMENTATION_DIFF_MISSING");

  const filenames = ["acceptance.json", "candidate.diff", "failed-test.json", "repair-test.json"];
  const artifacts: Artifact[] = [];
  for (const filename of filenames) {
    const artifactPath = path.join(input.evidenceDir, filename);
    const content = await readFile(artifactPath);
    artifacts.push({ ref: `evidence:spec224-disposable:${input.expected.scope.runId}:${filename}`, sha256: sha256(content), path: artifactPath });
  }
  const evidenceDigest = sha256(JSON.stringify(artifacts.map(({ ref, sha256: digest }) => ({ ref, sha256: digest }))));
  if (evidenceDigest !== input.expected.evidenceDigest) throw new Error("EVIDENCE_DIGEST_MISMATCH");
  if (JSON.stringify(artifacts.map(item => item.ref)) !== JSON.stringify(input.expected.artifactRefs)) throw new Error("EVIDENCE_REFERENCE_MISMATCH");
  const testResult = await runAcceptanceTest(input.repoPath);
  if (testResult.exitCode !== 0) throw new Error(`INDEPENDENT_TEST_FAILED:${testResult.exitCode}`);
  return { pid: process.pid, sourceSha, profile: "synthetic-disposable-python-unittest-v1", testsPassed: true };
}
