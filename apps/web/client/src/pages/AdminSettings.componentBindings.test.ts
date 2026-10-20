import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

describe("Admin settings JSX component bindings", () => {
  it("does not render undefined component names after a successful Vite build", () => {
    // Vite transpiles JSX without checking symbols. Bind this entry only;
    // do not traverse imports or run a repository-wide TypeScript check.
    const filename = resolve("client/src/pages/AdminSettings.tsx");
    const program = ts.createProgram([filename], {
      jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true, types: [],
    });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(filename)!;
    const unresolved = new Set<string>();
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        let tag: ts.Node = node.tagName;
        while (ts.isPropertyAccessExpression(tag)) tag = tag.expression;
        if (ts.isIdentifier(tag) && /^[A-Z]/.test(tag.text) && !checker.getSymbolAtLocation(tag)) {
          unresolved.add(tag.text);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect([...unresolved].sort()).toEqual([]);
  });
});
