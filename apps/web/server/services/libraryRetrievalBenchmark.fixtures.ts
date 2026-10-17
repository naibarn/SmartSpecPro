import { sha256 } from "./libraryCitationAnchor";
import type { RetrievalBenchmarkGoldCase, RetrievalBenchmarkObservation } from "./libraryRetrievalBenchmark";

// Development-only synthetic corpus; not reviewed 500-query gold data and not a certification receipt.
// Run the report with: pnpm --filter @smartspec/web exec tsx scripts/run-retrieval-fixture-benchmark.ts
// Verify formulas with: pnpm --filter @smartspec/web exec vitest run server/services/libraryRetrievalBenchmark.test.ts

const validMarkdown = "# Authorized guide\nThe approved amount is 42.";
const validDigest = sha256(validMarkdown);
const validQuoteHash = sha256("The approved amount is 42.");

export const DEVELOPMENT_GOLD_CASES: RetrievalBenchmarkGoldCase[] = [
  { caseId: "supported-valid-citation", query: "approved amount 42", tenantId: "tenant-a", supportsAnswer: true, requiredEvidenceIds: ["doc-a"], requiredClaims: ["amount-42"], minimumAuthorityRank: 2, expectedRevision: "r2", shouldCite: true, language: "english" },
  { caseId: "unsupported-no-evidence", query: "unpublished launch date", tenantId: "tenant-a", supportsAnswer: false, requiredEvidenceIds: [], requiredClaims: [], minimumAuthorityRank: 0, shouldCite: false },
  { caseId: "cross-tenant-acl", query: "private account detail", tenantId: "tenant-a", supportsAnswer: false, requiredEvidenceIds: [], requiredClaims: [], minimumAuthorityRank: 1, shouldCite: false },
  { caseId: "stale-revision", query: "SPEC-229 current policy revision", tenantId: "tenant-a", supportsAnswer: true, requiredEvidenceIds: ["doc-stale"], requiredClaims: ["current-policy"], minimumAuthorityRank: 2, expectedRevision: "r2", shouldCite: true, language: "mixed", exactIdentifier: true },
  { caseId: "revoked-document", query: "revoked policy", tenantId: "tenant-a", supportsAnswer: false, requiredEvidenceIds: [], requiredClaims: [], minimumAuthorityRank: 2, shouldCite: false },
  { caseId: "deleted-document", query: "deleted guidance", tenantId: "tenant-a", supportsAnswer: false, requiredEvidenceIds: [], requiredClaims: [], minimumAuthorityRank: 2, shouldCite: false },
  { caseId: "authority-and-coverage", query: "คู่มือทางการ complete guidance", tenantId: "tenant-a", supportsAnswer: true, requiredEvidenceIds: ["doc-weak"], requiredClaims: ["claim-a", "claim-b"], minimumAuthorityRank: 3, expectedRevision: "r1", shouldCite: true, language: "thai" },
  { caseId: "digest-mismatch-citation", query: "digest identity", tenantId: "tenant-a", supportsAnswer: true, requiredEvidenceIds: ["doc-digest"], requiredClaims: ["digest-match"], minimumAuthorityRank: 1, expectedRevision: "r1", shouldCite: true },
  { caseId: "partial-provider-outage", query: "provider unavailable", tenantId: "tenant-a", supportsAnswer: false, requiredEvidenceIds: [], requiredClaims: [], minimumAuthorityRank: 0, shouldCite: false },
];

export const DEVELOPMENT_OBSERVATIONS: RetrievalBenchmarkObservation[] = [
  { caseId: "supported-valid-citation", answerSupported: true, coveredClaims: ["amount-42"], evidence: [{ evidenceId: "doc-a", tenantId: "tenant-a", revision: "r2", digest: validDigest, authorityRank: 3, revoked: false, deleted: false }], citations: [{ evidenceId: "doc-a", revision: "r2", digest: validDigest, lineStart: 2, lineEnd: 2, quoteHash: validQuoteHash, markdown: validMarkdown }], providerState: "complete" },
  { caseId: "unsupported-no-evidence", answerSupported: false, coveredClaims: [], evidence: [], citations: [], providerState: "complete" },
  { caseId: "cross-tenant-acl", answerSupported: false, coveredClaims: [], evidence: [{ evidenceId: "private-doc", tenantId: "tenant-b", revision: "r1", digest: validDigest, authorityRank: 2, revoked: false, deleted: false }], citations: [], providerState: "complete" },
  { caseId: "stale-revision", answerSupported: true, coveredClaims: ["current-policy"], evidence: [{ evidenceId: "doc-stale", tenantId: "tenant-a", revision: "r1", digest: validDigest, authorityRank: 3, revoked: false, deleted: false }], citations: [], providerState: "complete" },
  { caseId: "revoked-document", answerSupported: false, coveredClaims: [], evidence: [{ evidenceId: "doc-revoked", tenantId: "tenant-a", revision: "r1", digest: validDigest, authorityRank: 3, revoked: true, deleted: false }], citations: [], providerState: "complete" },
  { caseId: "deleted-document", answerSupported: false, coveredClaims: [], evidence: [{ evidenceId: "doc-deleted", tenantId: "tenant-a", revision: "r1", digest: validDigest, authorityRank: 3, revoked: false, deleted: true }], citations: [], providerState: "complete" },
  { caseId: "authority-and-coverage", answerSupported: true, coveredClaims: ["claim-a"], evidence: [{ evidenceId: "doc-weak", tenantId: "tenant-a", revision: "r1", digest: validDigest, authorityRank: 1, revoked: false, deleted: false }], citations: [], providerState: "partial" },
  { caseId: "digest-mismatch-citation", answerSupported: true, coveredClaims: ["digest-match"], evidence: [{ evidenceId: "doc-digest", tenantId: "tenant-a", revision: "r1", digest: validDigest, authorityRank: 2, revoked: false, deleted: false }], citations: [{ evidenceId: "doc-digest", revision: "r1", digest: "a".repeat(64), lineStart: 2, lineEnd: 2, quoteHash: validQuoteHash, markdown: validMarkdown }], providerState: "complete" },
  { caseId: "partial-provider-outage", answerSupported: false, coveredClaims: [], evidence: [], citations: [], providerState: "outage" },
];
