import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { getDb, closeDb } from "../server/db";
import {
  libraryChunks,
  libraryItems,
  libraryPermissions,
  systemSettings,
  userGroups,
  groupMembers,
} from "../drizzle/schema";
import { searchLibraryItems, type LibraryActor } from "../server/services/libraryService";
import {
  countGoldDataset,
  evaluateGoldDataset,
  goldDatasetCandidateSchema,
  isHeldOutReleaseEvaluationEligible,
  isReleaseCohortReady,
  validateGoldDataset,
  type GoldDatasetCandidate,
} from "../server/services/libraryRetrievalGoldDataset";

type Candidate = GoldDatasetCandidate;

const PROFILE = "legacy_baseline" as const;
const LATENCY_PROFILE = "simple_exact_keyword" as const;
const EVAL_TENANT = "repo-development";
const EVAL_USER = 923229;
const RUN_ID = randomUUID();
const repoRoot = resolve(process.cwd(), "../..");
const corpusRoot = resolve(process.env.SPEC229_CORPUS_ROOT ?? repoRoot);
const configuredCandidatePath = process.env.SPEC229_GOLD_CANDIDATE_PATH;
const candidatePath = configuredCandidatePath
  ? resolve(repoRoot, configuredCandidatePath)
  : resolve(corpusRoot, "apps/web/server/services/libraryRetrievalGoldCandidates.dev.v1.json");
if (configuredCandidatePath) {
  const candidateRelative = relative(realpathSync(repoRoot), realpathSync(candidatePath));
  if (
    isAbsolute(candidateRelative) ||
    candidateRelative === ".." ||
    candidateRelative.startsWith(`..${sep}`)
  ) {
    throw new Error("SPEC229_GOLD_CANDIDATE_PATH must stay within the system repository");
  }
}
const outputPath = process.argv[2] ? resolve(process.argv[2]) : undefined;

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function collectorPatchSha256(): string {
  const changed = new Set([
    ...execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).split("\n"),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: repoRoot, encoding: "utf8" }).split("\n"),
  ].filter(Boolean));
  const hash = createHash("sha256");
  for (const path of [...changed].sort()) {
    hash.update(path).update("\0").update(readFileSync(resolve(repoRoot, path))).update("\0");
  }
  return hash.digest("hex");
}

function assertDisposableDatabase(): void {
  if (process.env.SPEC229_EVAL_DISPOSABLE !== "1") {
    throw new Error("Set SPEC229_EVAL_DISPOSABLE=1 only for a disposable local evaluation database");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL must point to an isolated local test database");
  const url = new URL(raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
  if (!localHost || !url.port || !database.startsWith("spec229_eval_")) {
    throw new Error("Refusing non-local or non-spec229_eval database target");
  }
}

async function main() {
  assertDisposableDatabase();
  const collectorSourceDigest = collectorPatchSha256();
  const corpusSha = execFileSync("git", ["-C", corpusRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const systemSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const expectedCorpusSha = process.env.SOURCE_SHA;
  if (!expectedCorpusSha || corpusSha !== expectedCorpusSha) {
    throw new Error("Corpus worktree SHA must exactly match SOURCE_SHA");
  }
  const corpusWorktreeStatus = execFileSync(
    "git",
    ["-C", corpusRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim();
  if (corpusWorktreeStatus) throw new Error("Corpus worktree must be clean and pinned to SOURCE_SHA");

  const candidates = goldDatasetCandidateSchema.array().parse(
    JSON.parse(readFileSync(candidatePath, "utf8")) as unknown,
  );
  validateGoldDataset(candidates, corpusRoot);
  if (!candidates.length || candidates.some(item => item.benchmarkGold.tenantId !== EVAL_TENANT)) {
    throw new Error("Expected the existing single-tenant repository development cohort");
  }
  const candidateSha = sha256(readFileSync(candidatePath));
  const candidateCounts = countGoldDataset(candidates);
  const heldOutCohortReady = isReleaseCohortReady(candidateCounts);
  const requestedQuerySplit = process.env.SPEC229_EVAL_QUERY_SPLIT;
  if (
    requestedQuerySplit !== undefined &&
    requestedQuerySplit !== "development"
  ) {
    throw new Error("SPEC229_EVAL_QUERY_SPLIT only supports the non-certifying development split");
  }
  const queryCandidates = requestedQuerySplit === "development"
    ? candidates.filter(item => item.split === requestedQuerySplit)
    : candidates;
  if (queryCandidates.length === 0) {
    throw new Error(`No candidates found for ${requestedQuerySplit ?? "the full"} evaluation cohort`);
  }

  const sourcePaths = [...new Set(candidates.map(item => item.source.path))].sort();
  const sources = sourcePaths.map(sourcePath => {
    if (isAbsolute(sourcePath) || sourcePath.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe source path: ${sourcePath}`);
    }
    const sourceCandidates = candidates.filter(item => item.source.path === sourcePath);
    const metadata = sourceCandidates[0].source;
    if (
      !metadata.license.startsWith("MIT (repository LICENSE") ||
      !/owner[\s-]+authorized/i.test(metadata.allowedUseEvidence) ||
      !/no tenant production/i.test(metadata.allowedUseEvidence)
    ) {
      throw new Error(`Source is not explicitly authorized for development evaluation: ${sourcePath}`);
    }
    if (sourceCandidates.some(item => item.source.sha256 !== metadata.sha256)) {
      throw new Error(`Candidate source revisions disagree: ${sourcePath}`);
    }
    const absolute = resolve(corpusRoot, sourcePath);
    if (!absolute.startsWith(`${corpusRoot}${sep}`)) throw new Error(`Source escaped repository: ${sourcePath}`);
    const content = readFileSync(absolute);
    if (sha256(content) !== metadata.sha256) throw new Error(`Stale candidate source: ${sourcePath}`);
    return { path: sourcePath, digest: metadata.sha256, content: content.toString("utf8") };
  });

  process.env.VECTORDB_PROVIDER = "chromadb";
  const db = getDb();
  await db.select({ id: libraryItems.id }).from(libraryItems).limit(0);
  await db.delete(groupMembers);
  await db.delete(userGroups);
  await db.delete(libraryPermissions);
  await db.delete(libraryChunks);
  await db.delete(libraryItems);

  const insertedItems = await db.insert(libraryItems).values(sources.map(source => ({
    tenantId: EVAL_TENANT,
    ownerUserId: EVAL_USER,
    itemType: "document",
    source: "spec229_local_development_corpus",
    title: source.path.split("/").at(-1) ?? source.path,
    description: source.content,
    status: "ready" as const,
    visibility: "private" as const,
    metadata: { canonicalPath: source.path, revision: `sha256:${source.digest}`, digest: source.digest },
    sourceUrl: source.path,
  }))).returning({ id: libraryItems.id, metadata: libraryItems.metadata });
  const itemIdByPath = new Map<string, number>();
  for (const item of insertedItems) {
    const path = (item.metadata as Record<string, unknown>).canonicalPath;
    if (typeof path === "string") itemIdByPath.set(path, item.id);
  }
  await db.insert(libraryChunks).values(sources.map(source => ({
    tenantId: EVAL_TENANT,
    libraryItemId: itemIdByPath.get(source.path)!,
    chunkIndex: 0,
    content: source.content,
    tokenCount: source.content.split(/\s+/).length,
    metadata: { canonicalPath: source.path, revision: `sha256:${source.digest}` },
  })));

  const sourceByPath = new Map(sources.map(source => [source.path, source]));
  const actor: LibraryActor = { userId: EVAL_USER, tenantId: EVAL_TENANT, role: "user" };
  const observations: Array<Record<string, unknown>> = [];
  const traces: Array<Record<string, unknown>> = [];
  for (const [index, candidate] of queryCandidates.entries()) {
    const started = performance.now();
    const response = await searchLibraryItems({
      query: candidate.query,
      limit: 50,
      offset: 0,
      scope: "all",
      includeRetrievalDiagnostics: true,
    }, actor);
    const latencyMs = Number((performance.now() - started).toFixed(3));
    const ranked = response.results.flatMap(result => {
      const path = typeof result.metadata.canonicalPath === "string" ? result.metadata.canonicalPath : "";
      const source = sourceByPath.get(path);
      if (!source) return [];
      return [{
        evidenceId: path,
        tenantId: EVAL_TENANT,
        revision: `sha256:${source.digest}`,
        digest: source.digest,
        authorityRank: 1,
        authorized: true,
        revoked: false,
        deleted: false,
        title: result.title,
        combinedScore: result.combined_score,
        keywordScore: result.keyword_score,
        vectorScore: result.vector_score,
      }];
    });
    const relevantIds = new Set(candidate.benchmarkGold.requiredEvidenceIds);
    const relevantHit = ranked.some(item => relevantIds.has(item.evidenceId));
    observations.push({
      caseId: candidate.caseId,
      comparisonProfile: PROFILE,
      latencyProfile: LATENCY_PROFILE,
      // This profile records evidence support, not an LLM answer. A no-answer
      // label is unsupported unless the retrieval evidence matches gold.
      answerSupported: candidate.benchmarkGold.supportsAnswer && relevantHit,
      coveredClaims: relevantHit ? candidate.benchmarkGold.requiredClaims : [],
      evidence: ranked.map(({ title: _title, combinedScore: _combined, keywordScore: _keyword, vectorScore: _vector, ...evidence }) => evidence),
      citations: [],
      providerState: "complete",
      latencyMs,
      costMicros: 0,
    });
    traces.push({
      caseId: candidate.caseId,
      profile: PROFILE,
      query: candidate.query,
      provider: response.retrievalDiagnostics?.provider ?? "keyword_fallback",
      resultCount: ranked.length,
      results: ranked,
    });
    if ((index + 1) % 50 === 0) process.stderr.write(`SPEC-229 ${PROFILE}: ${index + 1}/${queryCandidates.length} queries\n`);
  }

  const corpusDigest = sha256(sources.map(source => `${source.path}\0${source.digest}\n`).join(""));
  const heldOutCaseIds = new Set(
    queryCandidates.filter(isHeldOutReleaseEvaluationEligible).map(item => item.caseId),
  );
  const releaseObservations = requestedQuerySplit === "development"
    ? observations
    : heldOutCohortReady
    ? observations.filter(item => heldOutCaseIds.has(String(item.caseId)))
    : observations;
  const run = {
    schemaVersion: "spec229-local-observation-run-v1",
    runId: RUN_ID,
    systemSha,
    collectorGitSha: systemSha,
    collectorPatchSha256: collectorSourceDigest,
    profile: PROFILE,
    runtime: "isolated local PostgreSQL + existing libraryService.searchLibraryItems keyword fallback",
    providerConfiguration: { vectorProvider: "chromadb", externalProviderCalls: false },
    candidateDataset: {
      path: relative(repoRoot, candidatePath),
      sha256: candidateSha,
      counts: candidateCounts,
      executedQueries: queryCandidates.length,
      executedSplit: requestedQuerySplit ?? "all",
      executedSplitCounts: countGoldDataset(queryCandidates),
      cohort: requestedQuerySplit === "development"
        ? "development-only; not eligible for release evaluation"
        : heldOutCohortReady
        ? "owner-authorized non-production held-out evaluation cohort"
        : "development-only; not eligible for release evaluation",
      certification: "P229.8 requires every §27 comparison and latency/cost profile to pass",
    },
    corpus: { tenantId: EVAL_TENANT, sourceSha: corpusSha, sourceCount: sources.length, revision: `sha256:${corpusDigest}` },
    evaluationMethod: {
      answerSupport: "expected evidence identity intersection; no answer generation",
      citations: "not emitted by the legacy Library search path",
      cohort: requestedQuerySplit === "development"
        ? "only the development split was executed against the full pinned source corpus; non-certifying"
        : heldOutCohortReady
        ? "metrics are calculated only over eligible held-out candidates; human review count remains explicit"
        : "metrics are development-only because no eligible held-out cohort is supplied",
    },
    usage: { costMicros: 0, provenance: "measured local-only execution; no external provider or model calls" },
    observationBundle: {
      schemaVersion: "spec229-observation-bundle-v1",
      releaseComparisonProfile: PROFILE,
      comparisonRuns: { [PROFILE]: releaseObservations },
      latencyRuns: { [LATENCY_PROFILE]: releaseObservations },
    },
    releaseEvaluation: evaluateGoldDataset(
      requestedQuerySplit === "development" ? queryCandidates : candidates,
      releaseObservations,
    ),
    traces,
  };
  const serialized = `${JSON.stringify(run, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, serialized, { flag: "wx", mode: 0o600 });
  else process.stdout.write(serialized);
  await closeDb();
}

main().catch(async error => {
  process.stderr.write(`${error instanceof Error ? error.message : "SPEC-229 local evaluation failed"}\n`);
  await closeDb().catch(() => undefined);
  process.exitCode = 1;
});
