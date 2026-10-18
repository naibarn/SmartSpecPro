import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  CloudflareAiSearchEvaluationClient,
  SPEC229_AI_SEARCH_EVALUATION_SCOPE,
  type AiSearchEvaluationChunk,
  type AiSearchEvaluationDocument,
} from "../server/services/cloudflareAiSearchEvaluation";
import {
  calculateRetrievalBenchmarkMetrics,
  SPEC_229_RELEASE_CRITERIA,
  retrievalBenchmarkGoldCaseSchema,
} from "../server/services/libraryRetrievalBenchmark";
import {
  normalizeCanonicalMarkdown,
  sha256,
} from "../server/services/libraryCitationAnchor";
import { retrievalBenchmarkRunBundleSchema } from "../server/services/libraryRetrievalBenchmarkRunBundle";
import {
  goldDatasetCandidateSchema,
  validateGoldDataset,
  type GoldDatasetCandidate,
} from "../server/services/libraryRetrievalGoldDataset";

type Candidate = GoldDatasetCandidate;

type Source = { path: string; digest: string; content: string };

const PROFILE = "ai_search_bm25" as const;
const RUN_ID = randomUUID();
const INSTANCE_ID = `spec229-eval-profile-c-${RUN_ID.slice(0, 8)}`;
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

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function collectorProvenance(): { gitSha: string; patchSha256: string } {
  const gitSha = execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const changed = new Set(
    [
      ...execFileSync("git", ["-C", repoRoot, "diff", "--name-only", "HEAD"], {
        encoding: "utf8",
      }).split("\n"),
      ...execFileSync(
        "git",
        ["-C", repoRoot, "ls-files", "--others", "--exclude-standard"],
        { encoding: "utf8" },
      ).split("\n"),
    ].filter(Boolean),
  );
  const hash = createHash("sha256");
  for (const path of [...changed].sort()) {
    hash.update(path).update("\0").update(readFileSync(resolve(repoRoot, path))).update("\0");
  }
  return { gitSha, patchSha256: hash.digest("hex") };
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for an actual profile C run`);
  return value;
}

function assertRuntimeAndSource(): {
  sourceSha: string;
  accountId: string;
  apiToken: string;
} {
  if (process.env.SPEC229_EVAL_DISPOSABLE !== "1") {
    throw new Error(
      "Set SPEC229_EVAL_DISPOSABLE=1 only for an isolated non-production run",
    );
  }
  const sourceSha = required("SOURCE_SHA");
  const actualSha = execFileSync("git", ["-C", corpusRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const status = execFileSync(
    "git",
    ["-C", corpusRoot, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim();
  if (actualSha !== sourceSha || status) {
    throw new Error("Evaluation corpus must be a clean worktree pinned to SOURCE_SHA");
  }
  return {
    sourceSha,
    accountId: required("SPEC229_EVAL_ACCOUNT_ID"),
    apiToken: required("SPEC229_EVAL_AI_SEARCH_API_TOKEN"),
  };
}

function loadAuthorizedSources(): { candidates: Candidate[]; sources: Source[] } {
  const candidates = (
    JSON.parse(readFileSync(candidatePath, "utf8")) as unknown[]
  ).map(item => goldDatasetCandidateSchema.parse(item)) as Candidate[];
  validateGoldDataset(candidates, corpusRoot);
  if (
    candidates.length === 0 ||
    candidates.some(
      candidate =>
        candidate.benchmarkGold.tenantId !== SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId,
    )
  ) {
    throw new Error("Expected the existing repository-only development cohort");
  }

  const paths = [...new Set(candidates.map(candidate => candidate.source.path))].sort();
  const sources = paths.map(sourcePath => {
    if (isAbsolute(sourcePath) || sourcePath.split(/[\\/]/).includes("..")) {
      throw new Error("Unsafe candidate source path");
    }
    const sourceCandidates = candidates.filter(row => row.source.path === sourcePath);
    const declared = sourceCandidates[0].source;
    if (
      !declared.license.startsWith("MIT (repository LICENSE") ||
      !/owner[\s-]+authorized/i.test(declared.allowedUseEvidence) ||
      !/no tenant production/i.test(declared.allowedUseEvidence) ||
      sourceCandidates.some(row => row.source.sha256 !== declared.sha256)
    ) {
      throw new Error(`Source-use evidence is invalid for ${sourcePath}`);
    }
    const absolute = resolve(corpusRoot, sourcePath);
    if (!absolute.startsWith(`${corpusRoot}${sep}`)) {
      throw new Error("Candidate source path escaped the pinned corpus");
    }
    const content = normalizeCanonicalMarkdown(readFileSync(absolute, "utf8"));
    if (sha256Hex(content) !== declared.sha256) {
      throw new Error(`Stale candidate source: ${sourcePath}`);
    }
    if (Buffer.byteLength(content, "utf8") > 3_500_000) {
      throw new Error(`Source exceeds the SPEC-229 projection limit: ${sourcePath}`);
    }
    return { path: sourcePath, digest: declared.sha256, content };
  });
  return { candidates, sources };
}

function createItemKey(path: string): string {
  const safe = path.replaceAll("\\", "/");
  if (safe.startsWith("/") || safe.split("/").includes("..")) {
    throw new Error("Invalid AI Search disposable item key");
  }
  const basename = safe.split("/").at(-1) ?? "document.md";
  const safeBasename = basename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-72);
  const pathHash = sha256Hex(safe).slice(0, 16);
  const key = `spec229-eval-${pathHash}-${safeBasename}`;
  if (key.length > 128) throw new Error("AI Search item key exceeds 128 characters");
  return key;
}

function findCitation(
  source: Source,
  returnedText: string,
  revision: string,
): {
  revision: string;
  digest: string;
  lineStart: number;
  lineEnd: number;
  quoteHash: string;
  markdown: string;
} | null {
  const markdown = normalizeCanonicalMarkdown(source.content);
  const snippet = normalizeCanonicalMarkdown(returnedText).trim();
  if (!snippet || snippet.length < 16) return null;
  const offset = markdown.indexOf(snippet);
  if (offset < 0) return null;
  const lineStart = markdown.slice(0, offset).split("\n").length;
  const lineEnd = lineStart + snippet.split("\n").length - 1;
  const lines = markdown.split("\n");
  const quote = lines.slice(lineStart - 1, lineEnd).join("\n");
  return {
    revision,
    digest: source.digest,
    lineStart,
    lineEnd,
    quoteHash: sha256(quote),
    markdown,
  };
}

function isTransientProviderFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return /\b(408|425|429|5\d\d)\b/.test(message) ||
    /timeout|timed out|fetch failed|econnreset|econnrefused/i.test(message);
}

function validateResultOwnership(chunk: AiSearchEvaluationChunk, source: Source): void {
  const metadata = chunk.item.metadata;
  if (
    !metadata ||
    metadata.tenant_id !== SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId ||
    metadata.acl_scope !== SPEC229_AI_SEARCH_EVALUATION_SCOPE.aclScope ||
    metadata.source_id !== source.path ||
    metadata.source_revision !== `sha256:${source.digest}` ||
    metadata.source_digest !== source.digest
  ) {
    throw new Error("SPEC229_PROFILE_C_EVIDENCE_OWNERSHIP_OR_PROVENANCE_MISMATCH");
  }
}

async function main() {
  const runtime = assertRuntimeAndSource();
  const collector = collectorProvenance();
  const { candidates, sources } = loadAuthorizedSources();
  const api = new CloudflareAiSearchEvaluationClient({
    accountId: runtime.accountId,
    apiToken: runtime.apiToken,
    instanceId: INSTANCE_ID,
  });
  const sourceByKey = new Map<string, Source>();
  const documents: AiSearchEvaluationDocument[] = sources.map(source => {
    const key = createItemKey(source.path);
    return {
      key,
      content: source.content,
      metadata: {
        tenant_id: SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId,
        acl_scope: SPEC229_AI_SEARCH_EVALUATION_SCOPE.aclScope,
        source_id: source.path,
        source_revision: `sha256:${source.digest}`,
        source_digest: source.digest,
      },
    };
  });
  const createCanary = (kind: "foreign_tenant" | "same_tenant_private") => {
    const content = `SPEC229_PROFILE_C_${kind.toUpperCase()}_CANARY_${RUN_ID} unique retrieval guard fixture`;
    const digest = sha256Hex(content);
    const tenantId = kind === "foreign_tenant" ? "repo-foreign-control" : "repo-development";
    const aclScope = kind === "foreign_tenant"
      ? "tenant_shared:foreign-control"
      : "tenant_shared:spec229-private-control";
    return {
      query: `SPEC229_PROFILE_C_${kind.toUpperCase()}_CANARY_${RUN_ID}`,
      document: {
        key: createItemKey(`__synthetic__/${kind}-${RUN_ID}.md`),
        content,
        metadata: {
          tenant_id: tenantId,
          acl_scope: aclScope,
          source_id: `synthetic:${kind}:${RUN_ID}`,
          source_revision: `sha256:${digest}`,
          source_digest: digest,
        },
      } satisfies AiSearchEvaluationDocument,
      scope: { tenantId, aclScope },
    };
  };
  const securityCanaries = [
    createCanary("foreign_tenant"),
    createCanary("same_tenant_private"),
  ];
  const createdItemIds: string[] = [];
  let instanceCreated = false;
  let cleanupStatus: "complete" | "failed" = "complete";
  let run: Record<string, unknown> | undefined;

  try {
    await api.createKeywordOnlyInstance();
    instanceCreated = true;
    const indexDocument = async (document: AiSearchEvaluationDocument, expectedSource?: Source) => {
      const receipt = await api.uploadDocument(document);
      createdItemIds.push(receipt.id);
      if (expectedSource) sourceByKey.set(receipt.key, expectedSource);
      let currentReceipt = receipt;
      const deadline = Date.now() + 90_000;
      while (
        (currentReceipt.status === "queued" || currentReceipt.status === "running") &&
        Date.now() < deadline
      ) {
        await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
        const polled = await api.getItem(receipt.id);
        if (polled.key !== receipt.key) {
          throw new Error("AI Search item identity changed during indexing");
        }
        currentReceipt = { ...polled, chunksCount: receipt.chunksCount };
      }
      if (currentReceipt.status !== "completed") {
        throw new Error("AI Search did not complete disposable corpus indexing");
      }
      if (typeof currentReceipt.chunksCount === "number" && currentReceipt.chunksCount < 1) {
        throw new Error("AI Search indexed an evaluation item with no chunks");
      }
      return receipt;
    };
    for (const [index, document] of documents.entries()) {
      const source = sources.find(item => item.path === document.metadata.source_id);
      if (!source) throw new Error("AI Search upload source map is incomplete");
      await indexDocument(document, source);
      if ((index + 1) % 20 === 0 || index + 1 === documents.length) {
        process.stderr.write(`SPEC-229 ${PROFILE} indexed ${index + 1}/${documents.length}\n`);
      }
    }

    const securityControlResults = [];
    for (const control of securityCanaries) {
      const receipt = await indexDocument(control.document);
      if (!receipt.chunksCount || receipt.chunksCount < 1) {
        throw new Error("AI Search security canary did not produce an indexed chunk");
      }
      const visibleToControlScope = await api.searchKeyword(
        control.query,
        50,
        control.scope,
      );
      if (!visibleToControlScope.chunks.some(chunk => chunk.item.key === receipt.key)) {
        throw new Error("AI Search positive security control could not retrieve its canary");
      }
      const visibleToRepositoryScope = await api.searchKeyword(control.query);
      const leakedCanary = visibleToRepositoryScope.chunks.some(
        chunk => chunk.item.key === receipt.key,
      );
      if (leakedCanary) {
        throw new Error("SPEC229_PROFILE_C_ACL_LEAK_DETECTED");
      }
      securityControlResults.push({
        case: control.document.metadata.tenant_id === "repo-development"
          ? "same_tenant_unshared_acl"
          : "cross_tenant",
        positiveControl: "PASS",
        negativeControl: "PASS",
        leakedResultCount: 0,
      });
    }

    const sourceDigest = sha256Hex(
      sources.map(source => `${source.path}\0${source.digest}\n`).join(""),
    );
    const benchmarkCases = candidates.map(candidate =>
      retrievalBenchmarkGoldCaseSchema.parse({
        caseId: candidate.caseId,
        query: candidate.query,
        tenantId: candidate.benchmarkGold.tenantId,
        supportsAnswer: candidate.benchmarkGold.supportsAnswer,
        requiredEvidenceIds: candidate.benchmarkGold.requiredEvidenceIds,
        requiredClaims: candidate.benchmarkGold.requiredClaims,
        minimumAuthorityRank: candidate.benchmarkGold.minimumAuthorityRank,
        expectedRevision: candidate.benchmarkGold.expectedRevision,
        shouldCite: candidate.benchmarkGold.shouldCite,
        language: candidate.language,
        exactIdentifier: candidate.benchmarkGold.exactIdentifier,
      })
    );
    const observations = [];
    const traces = [];
    for (const [index, candidate] of candidates.entries()) {
      const started = performance.now();
      let providerState: "complete" | "outage" = "complete";
      let failureCode: string | null = null;
      let chunks: AiSearchEvaluationChunk[] = [];
      let apiUsage: Record<string, unknown> | null = null;
      try {
        const result = await api.searchKeyword(candidate.query, 50);
        chunks = result.chunks;
        apiUsage = result.usage ?? null;
      } catch (error) {
        if (!isTransientProviderFailure(error)) throw error;
        providerState = "outage";
        failureCode = "transient_provider_request_failure";
      }
      const latencyMs = Number((performance.now() - started).toFixed(3));
      const evidenceByPath = new Map<string, {
        evidenceId: string;
        tenantId: string;
        revision: string;
        digest: string;
        authorityRank: number;
        authorized: boolean;
        revoked: boolean;
        deleted: boolean;
      }>();
      const citations = [];
      const hitPaths = new Set<string>();
      for (const chunk of chunks) {
        const source = sourceByKey.get(chunk.item.key);
        if (!source) {
          throw new Error("SPEC229_PROFILE_C_EVIDENCE_KEY_NOT_IN_DISPOSABLE_CORPUS");
        }
        validateResultOwnership(chunk, source);
        hitPaths.add(source.path);
        if (!evidenceByPath.has(source.path)) {
          evidenceByPath.set(source.path, {
            evidenceId: source.path,
            tenantId: SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId,
            revision: `sha256:${source.digest}`,
            digest: source.digest,
            authorityRank: 1,
            authorized: true,
            revoked: false,
            deleted: false,
          });
        }
        if (
          citations.length > 0 ||
          !candidate.benchmarkGold.shouldCite ||
          !candidate.benchmarkGold.requiredEvidenceIds.includes(source.path)
        ) continue;
        const anchor = findCitation(source, chunk.text, `sha256:${source.digest}`);
        if (anchor) {
          citations.push({
            evidenceId: source.path,
            revision: anchor.revision,
            digest: anchor.digest,
            lineStart: anchor.lineStart,
            lineEnd: anchor.lineEnd,
            quoteHash: anchor.quoteHash,
            markdown: anchor.markdown,
          });
        }
      }
      const evidence = [...evidenceByPath.values()];
      const relevantHit = candidate.benchmarkGold.requiredEvidenceIds.every(
        evidenceId => hitPaths.has(evidenceId),
      );
      observations.push({
        caseId: candidate.caseId,
        comparisonProfile: PROFILE,
        answerSupported: candidate.benchmarkGold.supportsAnswer && relevantHit,
        coveredClaims: relevantHit ? candidate.benchmarkGold.requiredClaims : [],
        evidence,
        citations,
        providerState,
        latencyMs,
      });
      traces.push({
        caseId: candidate.caseId,
        profile: PROFILE,
        query: candidate.query,
        resultCount: chunks.length,
        latencyMs,
        failureCode,
        returnedItemKeys: chunks.map(chunk => chunk.item.key),
        citationsAvailable: citations.length,
        providerUsage: apiUsage,
      });
      if ((index + 1) % 50 === 0) {
        process.stderr.write(`SPEC-229 ${PROFILE} queried ${index + 1}/${candidates.length}\n`);
      }
    }

    const developmentMetrics = calculateRetrievalBenchmarkMetrics(
      benchmarkCases,
      observations,
    );
    run = {
      schemaVersion: "spec229-local-observation-run-v1",
      runId: RUN_ID,
      systemSha: collector.gitSha,
      collectorGitSha: collector.gitSha,
      collectorPatchSha256: collector.patchSha256,
      profile: PROFILE,
      runtime: "disposable non-production Cloudflare AI Search keyword-only profile",
      providerConfiguration: {
        provider: "cloudflare_ai_search",
        namespace: "default",
        instanceId: INSTANCE_ID,
        instanceProfile: {
          indexMethod: { vector: false, keyword: true },
          tokenizer: "trigram",
          keywordMatchMode: "or",
          maxResults: 50,
          matchThreshold: 0,
          reranking: false,
          queryRewrite: false,
          cache: false,
          publicEndpoint: false,
        },
        retrievalFilter: {
          tenant_id: SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId,
          acl_scope: SPEC229_AI_SEARCH_EVALUATION_SCOPE.aclScope,
        },
      },
      corpus: {
        tenantId: SPEC229_AI_SEARCH_EVALUATION_SCOPE.tenantId,
        sourceSha: runtime.sourceSha,
        sourceCount: sources.length,
        documentCount: documents.length,
        syntheticSecurityCanaries: securityCanaries.length,
        indexedItemCount: createdItemIds.length,
        revision: `sha256:${sourceDigest}`,
      },
      usage: {
        costMicros: null,
        provenance: "AI Search REST response does not provide billable per-query usage",
      },
      securityControls: securityControlResults,
      observationBundle: retrievalBenchmarkRunBundleSchema.parse({
        schemaVersion: "spec229-observation-bundle-v1",
        releaseComparisonProfile: PROFILE,
        comparisonRuns: { [PROFILE]: observations },
        latencyRuns: {},
      }),
      developmentMetrics,
      releaseGate: {
        status: "NOT_EVALUABLE",
        reason: "development candidate pool is not a release-approved held-out reviewed cohort",
        canonicalReleaseCriteria: SPEC_229_RELEASE_CRITERIA,
      },
      traces,
    };
  } finally {
    if (instanceCreated) {
      try {
        await api.deleteInstance();
      } catch {
        cleanupStatus = "failed";
      }
    }
  }

  if (run) {
    run.cleanup = {
      status: cleanupStatus,
      instanceId: INSTANCE_ID,
      createdItemIds,
    };
    const serialized = `${JSON.stringify(run, null, 2)}\n`;
    if (outputPath) writeFileSync(outputPath, serialized, { flag: "wx", mode: 0o600 });
    else process.stdout.write(serialized);
    if (cleanupStatus === "failed") process.exitCode = 2;
  }
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "SPEC-229 profile C evaluation failed"}\n`,
  );
  process.exitCode = 1;
});
