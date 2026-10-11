import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

import { createSpec224DisposableGitSession } from "./support/spec224DisposableGitAcceptance";

const execFileAsync = promisify(execFile);

describe("Spec 224 disposable synthetic implementation adapter", () => {
  it("does not write a repair after the active-job cancellation gate closes", async () => {
    let observedBeforeRepair: { head: string; commitCount: string; source: string } | null = null;
    const session = await createSpec224DisposableGitSession({
      runId: "run-spec224-cancel-before-repair",
      tenantId: "tenant-spec224-cancel",
      actorId: 22402,
      workUnitId: "work-spec224-cancel-before-repair",
    }, async input => {
      if (input.stage !== "repair") return;
      const [{ stdout: head }, { stdout: commitCount }] = await Promise.all([
        execFileAsync("git", ["rev-parse", "HEAD"], { cwd: input.repoPath }),
        execFileAsync("git", ["rev-list", "--count", "HEAD"], { cwd: input.repoPath }),
      ]);
      observedBeforeRepair = {
        head: head.trim(),
        commitCount: commitCount.trim(),
        source: await readFile(`${input.repoPath}/app.py`, "utf8"),
      };
      throw new Error("SPEC224_TEST_WORKER_CANCELLED");
    });

    try {
      await session.implementCandidate();
      await session.runCandidateTest();
      await expect(session.repairCandidate()).rejects.toThrow("SPEC224_TEST_WORKER_CANCELLED");

      expect(observedBeforeRepair).not.toBeNull();
      expect(observedBeforeRepair?.commitCount).toBe("2");
      expect(observedBeforeRepair?.source).toContain("return raw.strip()");
    } finally {
      await session.close();
    }
  });
});
