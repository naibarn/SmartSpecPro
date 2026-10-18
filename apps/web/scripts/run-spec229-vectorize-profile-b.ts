import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  deterministicVectorId,
  vectorizeNamespaceForTenant,
} from "../server/services/vectorizeContract";
import {
  createVectorProviderAdapter,
  VectorProviderError,
  type VectorEntry,
} from "../server/services/vectorProvider";
import {
  chunkDocument,
  generateSpec229DenseEvaluationEmbedding,
  generateSpec229DenseEvaluationEmbeddings,
} from "../server/services/vectorize";
import { retrievalBenchmarkRunBundleSchema } from "../server/services/libraryRetrievalBenchmarkRunBundle";
import {
  goldDatasetCandidateSchema,
  validateGoldDataset,
  type GoldDatasetCandidate,
} from "../server/services/libraryRetrievalGoldDataset";

type Candidate = Pick<GoldDatasetCandidate, "caseId" | "query" | "language" | "source" | "benchmarkGold">;

const PROFILE = "vectorize_dense" as const;
const EVAL_TENANT = "repo-development";
const EVAL_RUN_ID = randomUUID();
const EVAL_VECTOR_TYPE = `document:spec229-eval:${EVAL_RUN_ID}`;
const EVAL_NAMESPACE = vectorizeNamespaceForTenant(EVAL_TENANT);
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
const INDEX_NAME = process.env.SPEC229_EVAL_VECTORIZE_INDEX ?? "";

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function collectorPatchSha256(): string {
  const changed = new Set(
    [
      ...execFileSync("git", ["diff", "--name-only", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).split("\n"),
      ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).split("\n"),
    ].filter(Boolean)
  );
  const hash = createHash("sha256");
  for (const path of [...changed].sort()) {
    hash
      .update(path)
      .update("\0")
      .update(readFileSync(resolve(repoRoot, path)))
      .update("\0");
  }
  return hash.digest("hex");
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for an actual profile B run`);
  return value;
}

function assertRuntimeAndSource(): {
  sourceSha: string;
  accountId: string;
  aiApiKey: string;
  vectorizeApiToken: string;
} {
  if (process.env.SPEC229_EVAL_DISPOSABLE !== "1") {
    throw new Error(
      "Set SPEC229_EVAL_DISPOSABLE=1 only for an isolated non-production run"
    );
  }
  if (!INDEX_NAME.startsWith("spec229-eval-") || INDEX_NAME.length > 64) {
    throw new Error(
      "SPEC229_EVAL_VECTORIZE_INDEX must name a dedicated spec229-eval-* index"
    );
  }
  const configuredIndexes = [
    process.env.VECTORIZE_INDEX_NAME,
    process.env.VECTORIZE_LIBRARY_INDEX,
    process.env.VECTORIZE_KNOWLEDGE_INDEX,
    process.env.VECTORIZE_MEDIA_INDEX,
    process.env.VECTORIZE_AGENT_MEMORY_INDEX,
  ].filter((value): value is string => Boolean(value));
  if (configuredIndexes.includes(INDEX_NAME)) {
    throw new Error(
      "Refusing to use an index configured for an application workload"
    );
  }
  const sourceSha = required("SOURCE_SHA");
  const actualSha = execFileSync(
    "git",
    ["-C", corpusRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" }
  ).trim();
  const status = execFileSync(
    "git",
    ["-C", corpusRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" }
  ).trim();
  if (actualSha !== sourceSha || status) {
    throw new Error(
      "Evaluation corpus must be a clean worktree pinned to SOURCE_SHA"
    );
  }
  return {
    sourceSha,
    accountId: required("SPEC229_EVAL_ACCOUNT_ID"),
    aiApiKey: required("SPEC229_EVAL_WORKERS_AI_API_KEY"),
    vectorizeApiToken: required("SPEC229_EVAL_VECTORIZE_API_TOKEN"),
  };
}

function loadAuthorizedSources(): {
  candidates: Candidate[];
  sources: Array<{ path: string; digest: string; content: string }>;
} {
  const candidates = (
    JSON.parse(readFileSync(candidatePath, "utf8")) as unknown[]
  ).map(item => goldDatasetCandidateSchema.parse(item)) as Candidate[];
  validateGoldDataset(candidates, corpusRoot);
  if (
    !candidates.length ||
    candidates.some(item => item.benchmarkGold.tenantId !== EVAL_TENANT)
  ) {
    throw new Error(
      "Expected the existing single-tenant repository development cohort"
    );
  }
  const paths = [...new Set(candidates.map(item => item.source.path))].sort();
  const sources = paths.map(sourcePath => {
    if (isAbsolute(sourcePath) || sourcePath.split(/[\\/]/).includes("..")) {
      throw new Error(`Unsafe source path: ${sourcePath}`);
    }
    const sourceCandidates = candidates.filter(
      item => item.source.path === sourcePath
    );
    const declared = sourceCandidates[0].source;
    if (
      !declared.license.startsWith("MIT (repository LICENSE") ||
      !/owner[\s-]+authorized/i.test(declared.allowedUseEvidence) ||
      !/no tenant production/i.test(declared.allowedUseEvidence) ||
      sourceCandidates.some(item => item.source.sha256 !== declared.sha256)
    ) {
      throw new Error(`Source-use evidence is invalid for ${sourcePath}`);
    }
    const absolute = resolve(corpusRoot, sourcePath);
    if (!absolute.startsWith(`${corpusRoot}${sep}`))
      throw new Error("Source path escaped corpus root");
    const content = readFileSync(absolute, "utf8");
    if (sha256(content) !== declared.sha256)
      throw new Error(`Stale candidate source: ${sourcePath}`);
    return { path: sourcePath, digest: declared.sha256, content };
  });
  return { candidates, sources };
}

async function main() {
  const runtime = assertRuntimeAndSource();
  const collectorDigest = collectorPatchSha256();
  const { candidates, sources } = loadAuthorizedSources();
  const adapter = createVectorProviderAdapter("cloudflare_vectorize", {
    vectorizeAccountId: runtime.accountId,
    vectorizeApiToken: runtime.vectorizeApiToken,
    spec229EvaluationVectorizeDimensions: 1024,
  });
  const chunks = sources.flatMap(source =>
    chunkDocument(source.content).map((content, chunkIndex) => ({
      source,
      content,
      chunkIndex,
    }))
  );
  const vectors: VectorEntry[] = [];
  const sourceByVectorId = new Map<string, { path: string; digest: string }>();
  const indexedIds: string[] = [];
  const securityControlResults: Array<Record<string, unknown>> = [];
  let cleanupStatus: "complete" | "failed" = "complete";
  let outputRun: Record<string, unknown> | undefined;

  try {
    for (let offset = 0; offset < chunks.length; offset += 16) {
      const batch = chunks.slice(offset, offset + 16);
      const embeddings = await generateSpec229DenseEvaluationEmbeddings(
        batch.map(chunk => chunk.content),
        { accountId: runtime.accountId, apiKey: runtime.aiApiKey }
      );
      batch.forEach((chunk, index) => {
        const id = deterministicVectorId({
          vectorIndex: INDEX_NAME,
          namespace: EVAL_NAMESPACE,
          sourceFamily: "spec229-eval-library",
          sourceId: chunk.source.path,
          chunkOrSegmentId: String(chunk.chunkIndex),
          sourceRevision: `sha256:${chunk.source.digest}`,
          embeddingVersion: "bge-m3-1024-spec229-v1",
        });
        vectors.push({
          id,
          values: embeddings[index],
          namespace: EVAL_NAMESPACE,
        metadata: {
          tenantId: EVAL_TENANT,
          type: EVAL_VECTOR_TYPE,
          createdAt: Date.now(),
          title: chunk.source.path.split("/").at(-1) ?? chunk.source.path,
          sourceUrl: chunk.source.path,
          sourceRevision: `sha256:${chunk.source.digest}`,
          sourceDigest: chunk.source.digest,
          },
        });
        sourceByVectorId.set(id, chunk.source);
      });
      if (
        (offset + batch.length) % 128 === 0 ||
        offset + batch.length === chunks.length
      ) {
        process.stderr.write(
          `SPEC-229 ${PROFILE} embeddings: ${Math.min(offset + batch.length, chunks.length)}/${chunks.length}\n`
        );
      }
    }

    for (let offset = 0; offset < vectors.length; offset += 100) {
      const batch = vectors.slice(offset, offset + 100);
      indexedIds.push(...batch.map(vector => vector.id));
      await adapter.index({ indexName: INDEX_NAME, vectors: batch });
    }

    const canaryNonce = randomUUID();
    const canaryTexts = [
      `SPEC229 ${canaryNonce} same-tenant positive ACL control`,
      `SPEC229 ${canaryNonce} foreign-tenant denied ACL control`,
    ];
    const canaryEmbeddings = await generateSpec229DenseEvaluationEmbeddings(
      canaryTexts,
      { accountId: runtime.accountId, apiKey: runtime.aiApiKey },
    );
    const canaryVectors: VectorEntry[] = canaryTexts.map((text, index) => {
      const tenantId = index === 0 ? EVAL_TENANT : "repo-foreign-control";
      const namespace = vectorizeNamespaceForTenant(tenantId);
      const id = deterministicVectorId({
        vectorIndex: INDEX_NAME,
        namespace,
        sourceFamily: "spec229-eval-acl-canary",
        sourceId: `${tenantId}:${canaryNonce}`,
        chunkOrSegmentId: String(index),
        sourceRevision: `sha256:${sha256(text)}`,
        embeddingVersion: "bge-m3-1024-spec229-v1",
      });
      indexedIds.push(id);
      return {
        id,
        values: canaryEmbeddings[index],
        namespace,
        metadata: {
          tenantId,
          type: EVAL_VECTOR_TYPE,
          createdAt: Date.now(),
          sourceUrl: `synthetic:spec229-acl-canary:${tenantId}`,
        },
      };
    });
    await adapter.index({ indexName: INDEX_NAME, vectors: canaryVectors });
    let positiveControlMatches: Awaited<ReturnType<typeof adapter.search>>["matches"] = [];
    let foreignControlMatches: Awaited<ReturnType<typeof adapter.search>>["matches"] = [];
    const canaryDeadline = Date.now() + 30_000;
    do {
      [positiveControlMatches, foreignControlMatches] = await Promise.all([
        adapter.search({
          indexName: INDEX_NAME,
          vector: canaryEmbeddings[0],
          topK: 20,
          filter: { tenantId: EVAL_TENANT, type: EVAL_VECTOR_TYPE },
          namespace: EVAL_NAMESPACE,
        }).then(result => result.matches),
        adapter.search({
          indexName: INDEX_NAME,
          vector: canaryEmbeddings[1],
          topK: 20,
          filter: { tenantId: EVAL_TENANT, type: EVAL_VECTOR_TYPE },
          namespace: EVAL_NAMESPACE,
        }).then(result => result.matches),
      ]);
      if (positiveControlMatches.some(match => match.id === canaryVectors[0].id)) break;
      await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
    } while (Date.now() < canaryDeadline);
    const positiveControlPassed = positiveControlMatches.some(match => match.id === canaryVectors[0].id);
    const crossTenantLeakage = foreignControlMatches.some(match => match.id === canaryVectors[1].id);
    const responseDigest = sha256(JSON.stringify({
      positive: positiveControlMatches.map(match => match.id),
      foreign: foreignControlMatches.map(match => match.id),
    }));
    securityControlResults.push({
      controlId: `vectorize-acl-${EVAL_RUN_ID}`,
      canaryQueryLabels: ["same_tenant_positive", "cross_tenant_denied"],
      positiveControl: positiveControlPassed ? "PASS" : "FAIL",
      negativeControl: crossTenantLeakage ? "FAIL" : "PASS",
      crossTenantLeakage,
      responseDigest,
      corpusRevision: `sha256:${sha256(canaryTexts.join("\n"))}`,
      observedAt: new Date().toISOString(),
    });
    if (!positiveControlPassed || crossTenantLeakage) {
      throw new Error("SPEC229_PROFILE_B_ACL_CANARY_FAILED");
    }
    await adapter.delete({ indexName: INDEX_NAME, ids: canaryVectors.map(vector => vector.id) });
    const canaryIds = new Set(canaryVectors.map(vector => vector.id));
    for (let index = indexedIds.length - 1; index >= 0; index -= 1) {
      if (canaryIds.has(indexedIds[index])) indexedIds.splice(index, 1);
    }

    const observations = [];
    const traces = [];
    for (const [index, candidate] of candidates.entries()) {
      const started = performance.now();
      let providerState: "complete" | "outage" = "complete";
      let failureCode: string | null = null;
      let embeddingLatencyMs: number | null = null;
      let vectorSearchLatencyMs: number | null = null;
      let rawMatches: Array<{
        id: string;
        score: number;
        metadata: unknown;
      }> = [];
      try {
        const queryEmbedding = await generateSpec229DenseEvaluationEmbedding(
          candidate.query,
          { accountId: runtime.accountId, apiKey: runtime.aiApiKey }
        );
        const embeddingReady = performance.now();
        const result = await adapter.search({
          indexName: INDEX_NAME,
          vector: queryEmbedding,
          topK: 50,
          filter: { tenantId: EVAL_TENANT, type: EVAL_VECTOR_TYPE },
          namespace: EVAL_NAMESPACE,
        });
        const completed = performance.now();
        embeddingLatencyMs = Number((embeddingReady - started).toFixed(3));
        vectorSearchLatencyMs = Number((completed - embeddingReady).toFixed(3));
        rawMatches = result.matches;
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";
        const providerCode =
          error && typeof error === "object" && "code" in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (
          message.includes("cross-tenant") ||
          message.includes("ownership mismatch") ||
          message.includes("invalid 1024-dimensional") ||
          providerCode === "evaluation_index_not_isolated"
        ) {
          throw error;
        }
        const transientProviderFailure =
          (error instanceof VectorProviderError &&
            error.classification === "transient") ||
          /\b(408|425|429|5\d\d)\b/.test(message) ||
          /timeout|timed out|econnreset|econnrefused|fetch failed/.test(
            message
          );
        if (!transientProviderFailure) throw error;
        providerState = "outage";
        failureCode =
          typeof providerCode === "string"
            ? providerCode
            : "provider_request_failed";
      }
      const latencyMs = Number((performance.now() - started).toFixed(3));
      const deduplicated = new Map<
        string,
        {
          evidenceId: string;
          tenantId: string;
          revision: string;
          digest?: string;
          authorityRank: number;
          authorized: boolean;
          score: number;
        }
      >();
      for (const match of [...rawMatches].sort(
        (left, right) => right.score - left.score
      )) {
        const metadata = match.metadata as Record<string, unknown>;
        const source = sourceByVectorId.get(match.id);
        if (!source) {
          throw new Error("SPEC229_PROFILE_B_EVIDENCE_OWNERSHIP_MISMATCH");
        }
        if (!deduplicated.has(source.path)) {
          const actualDigest = typeof metadata.sourceDigest === "string" &&
            /^[a-f0-9]{64}$/.test(metadata.sourceDigest)
            ? metadata.sourceDigest
            : undefined;
          const actualRevision = typeof metadata.sourceRevision === "string"
            ? metadata.sourceRevision
            : "unknown";
          deduplicated.set(source.path, {
            evidenceId: source.path,
            tenantId: String(metadata.tenantId ?? ""),
            revision: actualRevision,
            ...(actualDigest ? { digest: actualDigest } : {}),
            authorityRank: 1,
            authorized: metadata.tenantId === EVAL_TENANT &&
              metadata.type === EVAL_VECTOR_TYPE &&
              actualRevision === `sha256:${source.digest}` &&
              actualDigest === source.digest,
            score: match.score,
          });
        }
      }
      const ranked = [...deduplicated.values()];
      const relevant = new Set(candidate.benchmarkGold.requiredEvidenceIds);
      const relevantHit = ranked.some(item => relevant.has(item.evidenceId));
      observations.push({
        caseId: candidate.caseId,
        comparisonProfile: PROFILE,
        answerSupported: candidate.benchmarkGold.supportsAnswer && relevantHit,
        coveredClaims: relevantHit
          ? candidate.benchmarkGold.requiredClaims
          : [],
        evidence: ranked.map(({ score: _score, ...evidence }) => evidence),
        citations: [],
        providerState,
        latencyMs,
      });
      traces.push({
        caseId: candidate.caseId,
        profile: PROFILE,
        query: candidate.query,
        resultCount: ranked.length,
        embeddingLatencyMs,
        vectorSearchLatencyMs,
        failureCode,
        results: ranked,
      });
      if ((index + 1) % 50 === 0)
        process.stderr.write(
          `SPEC-229 ${PROFILE}: ${index + 1}/${candidates.length} queries\n`
        );
    }

    const corpusDigest = sha256(
      sources.map(source => `${source.path}\0${source.digest}\n`).join("")
    );
    const systemSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const run = {
      schemaVersion: "spec229-local-observation-run-v1",
      runId: EVAL_RUN_ID,
      systemSha,
      collectorGitSha: systemSha,
      collectorPatchSha256: collectorDigest,
      profile: PROFILE,
      runtime:
        "non-production Cloudflare Workers AI + isolated Cloudflare Vectorize evaluation index",
      providerConfiguration: {
        provider: "cloudflare_vectorize",
        embeddingModel: "@cf/baai/bge-m3",
        dimensions: 1024,
        metric: "cosine",
        indexName: INDEX_NAME,
        namespace: EVAL_NAMESPACE,
        evalRunFilter: { field: "type", value: EVAL_VECTOR_TYPE },
      },
      corpus: {
        tenantId: EVAL_TENANT,
        sourceSha: runtime.sourceSha,
        sourceCount: sources.length,
        chunkCount: chunks.length,
        revision: `sha256:${corpusDigest}`,
      },
      securityControls: securityControlResults,
      usage: {
        costMicros: null,
        provenance:
          "provider billing/token usage was not returned by the embedding call; cost is intentionally unevaluated",
      },
      observationBundle: retrievalBenchmarkRunBundleSchema.parse({
        schemaVersion: "spec229-observation-bundle-v1",
        releaseComparisonProfile: PROFILE,
        comparisonRuns: { [PROFILE]: observations },
        latencyRuns: {},
      }),
      traces,
    };
    outputRun = run;
  } finally {
    for (let offset = 0; offset < indexedIds.length; offset += 500) {
      try {
        await adapter.delete({
          indexName: INDEX_NAME,
          ids: indexedIds.slice(offset, offset + 500),
        });
      } catch {
        cleanupStatus = "failed";
      }
    }
    if (cleanupStatus === "failed") {
      process.stderr.write(
        `SPEC-229 ${PROFILE} cleanup failed for run ${EVAL_RUN_ID}; delete only the recorded run vector IDs from ${INDEX_NAME}\n`
      );
      process.exitCode = 2;
    }
  }

  if (outputRun) {
    outputRun.cleanup = {
      status: cleanupStatus,
      attemptedVectorIds: indexedIds.length,
    };
    const serialized = `${JSON.stringify(outputRun, null, 2)}\n`;
    if (outputPath)
      writeFileSync(outputPath, serialized, { flag: "wx", mode: 0o600 });
    else process.stdout.write(serialized);
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "SPEC-229 profile B evaluation failed"}\n`
  );
  process.exitCode = 1;
});
