import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditCreditContextCallers } from "../audit-credit-context-callers";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("credit context caller audit", () => {
  it("detects named aliases and ignores comments", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "credit-context-callers-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "caller.ts"), [
      'import { deductCredits as charge } from "../services/creditService";',
      "const wrappedCharge = charge;",
      "// charge({ seriesId: 999 });",
      "export async function run(input: { tenantId: string; seriesId: number }) {",
      "  return wrappedCharge({ userId: 1, tenantId: input.tenantId, seriesId: input.seriesId });",
      "}",
    ].join("\n"));

    const result = auditCreditContextCallers(root);
    expect(result.callers).toHaveLength(1);
    expect(result.callers[0]).toMatchObject({
      symbol: "deductCredits",
      classification: "context_aware",
      contextFields: ["seriesId", "tenantId"],
      sourceProvenance: "structured_metadata",
      strictness: "required_when_enabled",
      schemaVersion: "0264",
      resolverVersion: "1",
      commitVersion: "working-tree",
    });
  });

  it("flags a direct ledger insert outside the allowlist", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "credit-context-ledger-"));
    temporaryRoots.push(root);
    fs.writeFileSync(path.join(root, "unsafe.ts"), [
      "async function write(tx: any, creditTransactions: unknown) {",
      "  return tx.insert(creditTransactions).values({ amount: -1 });",
      "}",
    ].join("\n"));

    const result = auditCreditContextCallers(root);
    expect(result.ledgerBypasses).toHaveLength(1);
    expect(result.ledgerBypasses[0].symbol).toBe("direct_credit_transactions_insert");
  });
});
