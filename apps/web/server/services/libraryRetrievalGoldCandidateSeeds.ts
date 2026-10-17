import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sha256 } from "./libraryCitationAnchor";
import type { GoldDatasetCandidate } from "./libraryRetrievalGoldDataset";

// Development-only candidate seeds based on SPEC-229 and its handoff. They are not a reviewed
// release corpus, are intentionally source-grouped into development, and cannot certify §27.
const specPath =
  "specs/feature/229-Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize/spec.md";
const handoffPath =
  "specs/feature/229-Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize/handoff/evidence/p229-8-anchors-benchmark-20261017.json";
const spec = readFileSync(
  fileURLToPath(new URL(`../../../../${specPath}`, import.meta.url)),
  "utf8"
).replace(/\r\n?/g, "\n");
const handoff = readFileSync(
  fileURLToPath(new URL(`../../../../${handoffPath}`, import.meta.url)),
  "utf8"
).replace(/\r\n?/g, "\n");
const specDigest =
  "22c00ed37c65360269ffb57917a37eef919a1f1976eee426c28fc0eda86fd63b";
const handoffDigest =
  "835f3795aaf9584ca62210b87ab3341077e32cb5172eab571b178857e9c20f55";

const seedRows = [
  {
    id: "cand-spec229-001",
    query:
      "ข้อใดบ้างที่ Evidence Quality Gate ต้องตรวจสอบก่อนส่ง context ให้ LLM?",
    language: "thai",
    classes: ["quality_coverage", "spec_factual"],
    start: 984,
    end: 992,
    answer:
      "Evidence count/coverage, exact-token coverage, rerank/fusion confidence, stale/conflicting versions, provenance, authority, citation availability.",
    claim: "quality-gate-dimensions",
  },
  {
    id: "cand-spec229-002",
    query: "What must a citation resolve against for citation precision?",
    language: "english",
    classes: ["citation", "provenance", "spec_factual"],
    start: 994,
    end: 994,
    answer:
      "Current ACL-authorized identity, immutable revision, digest, line range, optional quote hash, and the same canonical Markdown.",
    claim: "citation-identity-contract",
  },
  {
    id: "cand-spec229-003",
    query:
      "ชุด development fixtures ใช้รับรอง threshold หรือเลื่อน weak เป็น sufficient ได้หรือไม่?",
    language: "thai",
    classes: ["negative_policy_answer", "quality_gate", "spec_factual"],
    start: 994,
    end: 994,
    answer:
      "ไม่ได้; development fixtures ไม่ใช่ reviewed 500-query gold dataset และรับรอง threshold หรือ promote weak เป็น sufficient ไม่ได้.",
    claim: "fixtures-not-certification",
  },
  {
    id: "cand-spec229-004",
    query: "How large is the initial SPEC-229 reviewed query set?",
    language: "english",
    classes: ["gold_dataset", "spec_factual"],
    start: 1451,
    end: 1451,
    answer: "At least 500 reviewed queries initially, growing beyond 1,000.",
    claim: "initial-gold-size",
  },
  {
    id: "cand-spec229-005",
    query: "SPEC §27.1 ยกตัวอย่าง class ของ query อะไรบ้าง?",
    language: "thai",
    classes: ["taxonomy", "spec_factual"],
    start: 1453,
    end: 1453,
    answer:
      "รวมถึง Thai, English, mixed, semantic paraphrase, exact IDs, UUID, error code, API path, filename, spec ID, follow-up, ambiguous, typo, multi-hop, stale/conflict, no-answer, ACL attacks, deleted/revoked, OCR, long docs, code/config/log.",
    claim: "required-query-classes",
  },
  {
    id: "cand-spec229-006",
    query:
      "What are the Exact identifier Hit@5 and overall Recall@20 release targets?",
    language: "english",
    classes: ["release_threshold", "spec_factual"],
    start: 1492,
    end: 1493,
    answer: "Exact identifier Hit@5 >= 0.99; Overall Recall@20 >= 0.95.",
    claim: "exact-and-overall-thresholds",
  },
  {
    id: "cand-spec229-007",
    query:
      "เกณฑ์ Recall@20 ของ Thai, English และ Mixed ใน SPEC §27 เป็นเท่าไร?",
    language: "thai",
    classes: ["language", "release_threshold", "spec_factual"],
    start: 1475,
    end: 1478,
    answer:
      "มี metric Thai/English/Mixed Recall@20; release targets ระบุ Thai >= 0.92 และ English >= 0.95 แต่ไม่ได้กำหนด threshold สำหรับ Mixed.",
    claim: "language-recall-thresholds",
  },
  {
    id: "cand-spec229-008",
    query: "What no-answer precision and recall thresholds does §27.4 set?",
    language: "english",
    classes: ["release_threshold", "spec_factual"],
    start: 1500,
    end: 1501,
    answer: "Both no-answer precision and recall must be at least 0.90.",
    claim: "no-answer-thresholds",
  },
  {
    id: "cand-spec229-009",
    query: "Does the P229.8 handoff report measured P95 latency?",
    language: "english",
    classes: ["latency", "handoff_fact"],
    sourcePath: handoffPath,
    sourceContent: handoff,
    start: 71,
    end: 75,
    answer:
      "No; the handoff records latency as null pending an approved live or recorded run.",
    claim: "handoff-latency-not-reported",
    decision: "needs_adjudication",
  },
  {
    id: "cand-spec229-010",
    query: "SPEC §27.4 กำหนด P95 latency สำหรับ retrieval pipeline ใดบ้าง?",
    language: "thai",
    classes: ["latency", "release_threshold", "spec_factual"],
    start: 1507,
    end: 1509,
    answer:
      "Simple exact/keyword <= 800ms; hybrid + rerank <= 1500ms; rewrite + hybrid + rerank <= 2500ms.",
    claim: "latency-targets",
  },
] as const;

export const P2298_CANDIDATE_SEEDS: GoldDatasetCandidate[] = seedRows.map(
  (row, index) => {
    const path = "sourcePath" in row ? row.sourcePath : specPath;
    const content = "sourceContent" in row ? row.sourceContent : spec;
    const lines = content.split("\n");
    const quote = lines.slice(row.start - 1, row.end).join("\n");
    const reviewerDecision =
      "decision" in row ? row.decision : "accept_candidate";
    const reviews = [
      {
        reviewerId: "candidate_review",
        reviewerVersion: "independent-agent-review-2026-10-17",
        reviewerType: "agent" as const,
        decision: reviewerDecision,
        rationale:
          index === 4
            ? "Supported; class list is introduced as 'include' and is not exhaustive."
            : index === 6
              ? "Supported; mixed Recall@20 is listed as a metric but has no initial release threshold."
              : reviewerDecision === "needs_adjudication"
                ? "First review requested rewriting this candidate to ask what the handoff reports."
                : "Candidate source span and expected answer verified against the cited repository source.",
      },
    ];
    if (reviewerDecision === "needs_adjudication")
      reviews.push({
        reviewerId: "candidate_review",
        reviewerVersion: "independent-agent-review-2026-10-17-r2",
        reviewerType: "agent" as const,
        decision: "accept_candidate",
        rationale:
          "Re-reviewed corrected wording. Handoff lines 71-75 and pinned digest support that measured latency is reported as null pending approved live or recorded evidence.",
      });
    return {
      caseId: row.id,
      query: row.query,
      language: row.language,
      classes: [...row.classes],
      sourceGroupId: path,
      split: "development",
      useApproval: "development_only",
      source: {
        path,
        sha256: "sourcePath" in row ? handoffDigest : specDigest,
        lineStart: row.start,
        lineEnd: row.end,
        quoteSha256: sha256(quote),
        license: "MIT (repository LICENSE)",
        allowedUseEvidence:
          "Owner authorized repository documents for development fixtures only; no tenant production data.",
      },
      expectedAnswer: row.answer,
      generator: {
        id: "candidate_queries",
        version: "agent-session-2026-10-17",
      },
      reviews,
      disagreement: { present: false },
      benchmarkGold: {
        tenantId: "repo-development",
        supportsAnswer: true,
        requiredEvidenceIds: [path],
        requiredClaims: [row.claim],
        minimumAuthorityRank: 1,
        expectedRevision: `sha256:${"sourcePath" in row ? handoffDigest : specDigest}`,
        shouldCite: true,
        exactIdentifier: false,
      },
    };
  }
);
