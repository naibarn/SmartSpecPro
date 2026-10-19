#!/usr/bin/env node
import { builtinModules } from "node:module";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const runtimeRoot = path.resolve(process.argv[2] ?? ".");
const manifestPath = path.join(runtimeRoot, "package.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const productionDependencies = new Set([
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.optionalDependencies ?? {}),
]);
const nodeBuiltins = new Set(builtinModules.flatMap((name) => [name, name.replace(/^node:/, "")]));
const violations = [];
const allowedDevelopmentImports = new Map([
  ["server/_core/vite.ts", new Set(["vite"])],
]);

function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function isRuntimeAlias(specifier) {
  return ["@/", "@shared/", "@db/", "@server/"].some((prefix) => specifier.startsWith(prefix));
}

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...await sourceFiles(file));
      continue;
    }
    if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)
      && !/(?:\.test|\.spec)\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
      files.push(file);
    }
  }
  return files;
}

function importSites(sourceFile) {
  const sites = [];
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        sites.push({ specifier: node.moduleSpecifier.text, dynamic: false });
      }
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))
      && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      sites.push({
        specifier: node.arguments[0].text,
        dynamic: node.expression.kind === ts.SyntaxKind.ImportKeyword,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return sites;
}

for (const file of await sourceFiles(path.join(runtimeRoot, "server"))) {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const relativeFile = path.relative(runtimeRoot, file).split(path.sep).join("/");
  for (const site of importSites(sourceFile)) {
    const specifier = site.specifier;
    if (specifier.startsWith(".")) {
      const target = path.resolve(path.dirname(file), specifier);
      const relativeTarget = path.relative(runtimeRoot, target);
      if (relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
        violations.push(`${relativeFile}: '${specifier}' escapes the standalone runtime artifact; use a declared workspace package`);
      }
      continue;
    }
    if (specifier.startsWith("/") || specifier.startsWith("#")
      || specifier.startsWith("node:") || isRuntimeAlias(specifier)) continue;

    const dependency = packageName(specifier);
    if (nodeBuiltins.has(dependency)) continue;

    if (!productionDependencies.has(dependency)) {
      const devOnly = site.dynamic && allowedDevelopmentImports.get(relativeFile)?.has(dependency);
      if (!devOnly) {
        violations.push(`${relativeFile}: '${specifier}' is imported but '${dependency}' is not a production dependency`);
        continue;
      }
      continue;
    }

    try {
      await access(path.join(runtimeRoot, "node_modules", ...dependency.split("/")));
    } catch {
      violations.push(`${relativeFile}: '${specifier}' is declared for production but does not resolve in the runtime artifact`);
    }
  }
}

if (violations.length) {
  console.error("Linux backend runtime dependency preflight failed:");
  for (const violation of [...new Set(violations)].sort()) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Linux backend runtime dependencies are declared and resolvable in the artifact.");
}
