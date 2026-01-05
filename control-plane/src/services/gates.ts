import type { PrismaClient } from "@prisma/client";
import type { Env } from "../config";
import type { GateEvaluation, GateCheckResult } from "../types";

export async function evaluateGates(args: {
  prisma: PrismaClient;
  env: Env;
  sessionId: string;
}): Promise<GateEvaluation> {
  const { prisma, env, sessionId } = args;

  const [taskCounts, latestTest, latestCoverage, latestSecurity] = await Promise.all([
    prisma.task.groupBy({
      by: ["status"],
      where: { sessionId },
      _count: { _all: true },
    }),
    prisma.testRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
    prisma.coverageRun.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
    prisma.securityCheck.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } }),
  ]);

  const counts: Record<string, number> = { planned: 0, doing: 0, done: 0, blocked: 0 };
  for (const row of taskCounts) counts[row.status] = row._count._all;

  const checks: GateCheckResult[] = [];

  // Tasks gate
  const tasksOk = (counts.planned ?? 0) === 0 && (counts.doing ?? 0) === 0 && (counts.blocked ?? 0) === 0;
  checks.push({ name: "tasks", ok: tasksOk, details: { counts } });

  // Tests gate
  const testsOk = latestTest ? latestTest.passed : false;
  checks.push({
    name: "tests",
    ok: testsOk,
    details: latestTest
      ? { testRunId: latestTest.id, passed: latestTest.passed, artifactKey: latestTest.artifactKey }
      : { reason: "no_test_run_recorded" },
  });

  // Coverage gate
  const min = env.COVERAGE_MIN_PERCENT;
  const covOk = latestCoverage ? latestCoverage.percent >= min : false;
  checks.push({
    name: "coverage",
    ok: covOk,
    details: latestCoverage
      ? { coverageRunId: latestCoverage.id, percent: latestCoverage.percent, min, artifactKey: latestCoverage.artifactKey }
      : { reason: "no_coverage_recorded", min },
  });

  // Security gate (default pass if none recorded)
  const secOk = latestSecurity ? latestSecurity.status === "pass" : true;
  checks.push({
    name: "security",
    ok: secOk,
    details: latestSecurity
      ? { securityCheckId: latestSecurity.id, status: latestSecurity.status, artifactKey: latestSecurity.artifactKey }
      : { note: "no_security_check_recorded_default_pass" },
  });

  return {
    sessionId,
    ok: checks.every((c) => c.ok),
    checks,
    evaluatedAt: new Date().toISOString(),
  };
}
