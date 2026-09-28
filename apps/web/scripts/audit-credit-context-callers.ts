import fs from "node:fs";
import path from "node:path";
import * as ts from "../../../node_modules/typescript/lib/typescript.js";

export type CreditCallerClassification =
  | "context_aware"
  | "legacy_unattributed"
  | "central_writer"
  | "ledger_bypass"
  | "unclassified";

export interface CreditCallerAuditEntry {
  file: string;
  line: number;
  symbol: string;
  classification: CreditCallerClassification;
  contextAvailable: boolean;
  contextFields: string[];
  sourceProvenance: "explicit_context" | "structured_metadata" | "tenant_only" | "legacy" | "central_writer" | "ledger_insert";
  strictness: "required_when_enabled" | "best_effort_legacy" | "central_writer" | "bypass";
  schemaVersion: "0264";
  resolverVersion: "1";
  commitVersion: string;
}

const BILLING_SYMBOLS = new Set(["deductCredits", "deductCreditsForModel", "refundCredits", "createCreditReservation", "addCredits"]);
const CREDIT_SERVICE_FILE = /(?:^|\/)creditService\.ts$/;
const ALLOWED_LEDGER_HELPERS = new Set([
  "creditService.ts",
  "skillRevenueBilling.ts",
  "freeCreditInactivityService.ts",
  "creatorRevenueService.ts",
  "postgresAdapter.ts",
]);
const CONTEXT_FIELDS = [
  "contextRef", "billing", "seriesId", "series_id", "episodeId", "jobId", "taskId", "runId",
  "skillRunId", "conversationId", "workerJobId", "mediaTaskId", "tenantId",
];
const COMMIT_VERSION = process.env.GIT_COMMIT_SHA ?? "working-tree";

function classifyBillingCall(argumentText: string): Omit<CreditCallerAuditEntry, "file" | "line" | "symbol"> {
  const contextFields = CONTEXT_FIELDS.filter(field => new RegExp(`\\b${field}\\b`).test(argumentText));
  const contextIdentityFields = contextFields.filter(field => field !== "tenantId");
  const contextAvailable = contextIdentityFields.length > 0;
  const explicit = contextFields.includes("contextRef") || contextFields.includes("billing");
  const structured = contextIdentityFields.some(field => ["seriesId", "series_id", "episodeId", "jobId", "taskId", "runId", "skillRunId", "conversationId", "workerJobId", "mediaTaskId"].includes(field));
  const classification = contextAvailable ? "context_aware" : "legacy_unattributed";
  return {
    classification,
    contextAvailable,
    contextFields,
    sourceProvenance: explicit ? "explicit_context" : structured ? "structured_metadata" : contextAvailable ? "tenant_only" : "legacy",
    strictness: classification === "context_aware" ? "required_when_enabled" : "best_effort_legacy",
    schemaVersion: "0264",
    resolverVersion: "1",
    commitVersion: COMMIT_VERSION,
  };
}

function directLedgerClassification(file: string): Omit<CreditCallerAuditEntry, "file" | "line" | "symbol"> {
  const allowed = ALLOWED_LEDGER_HELPERS.has(path.basename(file));
  return {
    classification: allowed ? "central_writer" : "ledger_bypass",
    contextAvailable: allowed,
    contextFields: [],
    sourceProvenance: allowed ? "central_writer" : "ledger_insert",
    strictness: allowed ? "central_writer" : "bypass",
    schemaVersion: "0264",
    resolverVersion: "1",
    commitVersion: COMMIT_VERSION,
  };
}

export function auditCreditContextCallers(root = path.resolve(process.cwd(), "server")) {
  const entries: CreditCallerAuditEntry[] = [];
  const files: string[] = [];
  const visitFiles = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (name === "__tests__" || name.endsWith(".test.ts") || name.endsWith(".spec.ts")) continue;
      if (fs.statSync(file).isDirectory()) visitFiles(file);
      else if (file.endsWith(".ts")) files.push(file);
    }
  };
  visitFiles(root);
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const billingAliases = new Map<string, string>();
    const namespaceAliases = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || !statement.moduleSpecifier.text.includes("creditService")) continue;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) namespaceAliases.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) namespaceAliases.add(clause.namedBindings.name.text);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (BILLING_SYMBOLS.has(imported)) billingAliases.set(element.name.text, imported);
        }
      }
    }
    // Resolve simple local aliases such as `const charge = deductCredits` so
    // a refactor cannot hide a billing call from the inventory.
    for (const statement of source.statements) {
      const declarations: ts.VariableDeclaration[] = [];
      if (ts.isVariableStatement(statement)) declarations.push(...statement.declarationList.declarations);
      if (ts.isForStatement(statement) && statement.initializer && ts.isVariableDeclarationList(statement.initializer)) declarations.push(...statement.initializer.declarations);
      for (const declaration of declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name) || !ts.isIdentifier(declaration.initializer)) continue;
        const imported = billingAliases.get(declaration.initializer.text);
        if (imported) billingAliases.set(declaration.name.text, imported);
      }
    }
    const add = (node: ts.Node, symbol: string, info: Omit<CreditCallerAuditEntry, "file" | "line" | "symbol">) => {
      entries.push({ file: path.relative(process.cwd(), file), line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, symbol, ...info });
    };
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        let symbol: string | null = null;
        if (ts.isIdentifier(node.expression)) {
          symbol = billingAliases.get(node.expression.text) ?? null;
        } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && namespaceAliases.has(node.expression.expression.text) && BILLING_SYMBOLS.has(node.expression.name.text)) {
          symbol = node.expression.name.text;
        }
        if (symbol) {
          const info = file.match(CREDIT_SERVICE_FILE)
            ? { ...directLedgerClassification(file), classification: "central_writer" as const, strictness: "central_writer" as const }
            : classifyBillingCall(node.arguments[0]?.getText(source) ?? "");
          add(node, symbol, info);
        }
        const isLedgerInsert = ts.isPropertyAccessExpression(node.expression)
          && node.expression.name.text === "insert"
          && node.arguments.some(argument => argument.getText(source).includes("creditTransactions"));
        if (isLedgerInsert) add(node, "direct_credit_transactions_insert", directLedgerClassification(file));
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }
  const legacyUnattributed = entries.filter(entry => entry.classification === "legacy_unattributed");
  const ledgerBypasses = entries.filter(entry => entry.classification === "ledger_bypass");
  const unclassified = entries.filter(entry => entry.classification === "unclassified");
  return {
    schemaVersion: "0264",
    resolverVersion: "1",
    commitVersion: COMMIT_VERSION,
    generatedAt: new Date().toISOString(),
    callers: entries,
    legacyUnattributed,
    ledgerBypasses,
    unclassified,
  };
}

if (process.argv[1]?.endsWith("audit-credit-context-callers.ts")) {
  const result = auditCreditContextCallers();
  const formatIndex = process.argv.indexOf("--format");
  const format = formatIndex >= 0 ? process.argv[formatIndex + 1] : "json";
  if (format !== "json") {
    console.error("Only --format json is supported");
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (process.argv.includes("--fail-on-unclassified") && (result.unclassified.length > 0 || result.ledgerBypasses.length > 0)) process.exitCode = 1;
}
