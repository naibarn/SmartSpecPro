import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { legacyLlmCallerInventory } from "../legacyLlmCallerInventory";

type DirectCaller = {
  sourcePath: string;
  functionName: string;
  callsiteCount: number;
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") return [];
      return sourceFiles(absolute);
    }
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".ts") ||
      entry.name.endsWith(".d.ts") ||
      entry.name.endsWith(".test.ts") ||
      entry.name.endsWith(".spec.ts")
    ) return [];
    return [absolute];
  });
}

function collectDirectLegacyCallers(serverRoot: string): DirectCaller[] {
  const callers = new Map<string, DirectCaller>();
  for (const absolute of sourceFiles(serverRoot)) {
    const sourcePath = `server/${path.relative(serverRoot, absolute).split(path.sep).join("/")}`;
    // The central router defines the API; the Spec 231 adapter is its approved
    // pinned execution boundary rather than a legacy consumer.
    if (
      sourcePath === "server/services/llmRouter.ts" ||
      sourcePath === "server/services/inference/llmRouterAttemptAdapter.ts"
    ) continue;

    const text = readFileSync(absolute, "utf8");
    const ast = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true);
    const functionNames: Array<string | null> = [];
    const visit = (node: ts.Node) => {
      const isFunction =
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node);
      if (isFunction) {
        let name = node.name?.getText(ast) ?? null;
        if (!name && ts.isVariableDeclaration(node.parent)) {
          name = node.parent.name.getText(ast);
        }
        functionNames.push(name);
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(ast).endsWith("executeWithFallback")
      ) {
        const functionName = functionNames.find(Boolean) ?? "<module>";
        const key = `${sourcePath}::${functionName}`;
        const prior = callers.get(key);
        callers.set(key, {
          sourcePath,
          functionName,
          callsiteCount: (prior?.callsiteCount ?? 0) + 1,
        });
      }
      ts.forEachChild(node, visit);
      if (isFunction) functionNames.pop();
    };
    visit(ast);
  }
  return [...callers.values()].sort((a, b) =>
    `${a.sourcePath}::${a.functionName}`.localeCompare(`${b.sourcePath}::${b.functionName}`)
  );
}

describe("legacy direct LLM caller inventory", () => {
  it("matches every direct Web executeWithFallback consumer to a reviewed inventory entry", () => {
    const actual = collectDirectLegacyCallers(path.resolve(process.cwd(), "server"));
    const expected = [...legacyLlmCallerInventory].sort((a, b) =>
      `${a.sourcePath}::${a.functionName}`.localeCompare(`${b.sourcePath}::${b.functionName}`)
    );
    expect(actual).toEqual(expected);
  }, 15_000);

  it("has a runtime-owner entry for every statically discovered Web caller", () => {
    const inventoryPath = path.resolve(
      process.cwd(),
      "../../specs/feature/231-Unified LLM Routing & Inference Orchestration/implementation/consumer-adoption-inventory.json",
    );
    const manifest = JSON.parse(readFileSync(inventoryPath, "utf8")) as {
      web: Array<{
        sourcePath: string;
        functionName: string;
        callsiteCount: number;
        runtimeOwnerClass: string;
        runtimeClosure: string;
        adoptionState: string;
      }>;
    };
    const rows = manifest.web.map(row => ({
      sourcePath: row.sourcePath,
      functionName: row.functionName,
      callsiteCount: row.callsiteCount,
    })).sort((a, b) =>
      `${a.sourcePath}::${a.functionName}`.localeCompare(`${b.sourcePath}::${b.functionName}`)
    );
    const expected = [...legacyLlmCallerInventory].map(({ sourcePath, functionName, callsiteCount }) => ({
      sourcePath,
      functionName,
      callsiteCount,
    })).sort((a, b) =>
      `${a.sourcePath}::${a.functionName}`.localeCompare(`${b.sourcePath}::${b.functionName}`)
    );
    expect(rows).toEqual(expected);
    expect(manifest.web.every(row =>
      Boolean(row.runtimeOwnerClass && row.runtimeClosure && row.adoptionState)
    )).toBe(true);
  });
});
