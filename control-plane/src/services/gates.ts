import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config";

export async function evaluateGates(prisma: PrismaClient, env: Env, sessionId: string) {
  const [taskCounts, latestTest, latestCoverage, latestSecurity] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where: { sessionId }, _count: { _all: true } }),
    prisma.testRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
    prisma.coverageRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
    prisma.securityCheck.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
  ]);

  const counts: Record<string, number> = { planned: 0, doing: 0, done: 0, blocked: 0 };
  for (const row of taskCounts) counts[row.status] = row._count._all;

  const tasksOk = counts.planned === 0 && counts.doing === 0 && counts.blocked === 0;
  const testsOk = latestTest ? latestTest.passed : false;

  const min = env.COVERAGE_MIN_PERCENT;
  const covOk = latestCoverage ? latestCoverage.percent >= min : false;

  const secOk = latestSecurity ? latestSecurity.status === "pass" : true;

  const checks = [
    { name: "tasks", ok: tasksOk, details: { counts } },
    { name: "tests", ok: testsOk, details: latestTest ? { id: latestTest.id, passed: latestTest.passed, artifactKey: latestTest.artifactKey } : { reason: "no_test_run" } },
    { name: "coverage", ok: covOk, details: latestCoverage ? { id: latestCoverage.id, percent: latestCoverage.percent, min, artifactKey: latestCoverage.artifactKey } : { reason: "no_coverage", min } },
    { name: "security", ok: secOk, details: latestSecurity ? { id: latestSecurity.id, status: latestSecurity.status, artifactKey: latestSecurity.artifactKey } : { note: "no_security_default_pass" } },
  ];

  return { sessionId, ok: checks.every((c) => c.ok), checks, evaluatedAt: new Date().toISOString() };
}
