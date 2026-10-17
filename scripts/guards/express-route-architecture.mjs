import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "all", "use"]);
const EXCEPTIONS_PATH = "scripts/guards/express-route-exceptions.json";

export function isGuardedSourceFile(file) {
  return file.startsWith("apps/web/server/") && /\.(ts|tsx)$/.test(file) &&
    !/(^|\/)(__tests__|tests?)(\/|$)/.test(file) && !/\.(test|spec)\.tsx?$/.test(file);
}

function stringArgument(node) {
  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isArrayLiteralExpression(node) && node.elements.every(ts.isStringLiteralLike)) {
    return node.elements.map((item) => item.text).join(",");
  }
  return null;
}

function isRoutePath(value) {
  return typeof value === "string" && (value.startsWith("/") || value.startsWith("*") || value.startsWith("{"));
}

export function collectExpressRouteSignatures(fileName, sourceText) {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const signatures = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text.toLowerCase();
      let route = node.arguments.length > 0 ? stringArgument(node.arguments[0]) : null;
      if (ROUTE_METHODS.has(method) && !isRoutePath(route) && ts.isCallExpression(node.expression.expression) &&
          ts.isPropertyAccessExpression(node.expression.expression.expression) &&
          node.expression.expression.expression.name.text.toLowerCase() === "route") {
        route = stringArgument(node.expression.expression.arguments[0]);
      }
      if (ROUTE_METHODS.has(method) && isRoutePath(route)) signatures.push({ method, path: route });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return signatures;
}

export function findAddedRoutes(fileName, beforeText, afterText) {
  const before = collectExpressRouteSignatures(fileName, beforeText);
  const remaining = new Map();
  for (const route of before) {
    const key = `${route.method}\0${route.path}`;
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return collectExpressRouteSignatures(fileName, afterText).filter((route) => {
    const key = `${route.method}\0${route.path}`;
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

export function validateException(exception, today = new Date().toISOString().slice(0, 10)) {
  const expires = exception?.expires;
  const validDate = typeof expires === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expires) &&
    !Number.isNaN(Date.parse(`${expires}T00:00:00Z`)) && new Date(`${expires}T00:00:00Z`).toISOString().slice(0, 10) === expires;
  return Boolean(exception && typeof exception.file === "string" && exception.file.startsWith("apps/web/server/") &&
    typeof exception.method === "string" && ROUTE_METHODS.has(exception.method.toLowerCase()) &&
    typeof exception.path === "string" && exception.path.startsWith("/") &&
    !["/*", "/{*path}", "/{*splat}"].includes(exception.path) &&
    typeof exception.owner === "string" && exception.owner.trim() &&
    typeof exception.reason === "string" && exception.reason.trim() &&
    validDate && exception.expires >= today);
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readGitFile(revision, file) {
  try { return execFileSync("git", ["show", `${revision}:${file}`], { encoding: "utf8" }); }
  catch { return ""; }
}

export function evaluateChangedRoutes(changes, exceptions, today = new Date().toISOString().slice(0, 10)) {
  const invalidExceptions = exceptions.filter((exception) => !validateException(exception, today));
  const violations = [];
  for (const change of changes) {
    const addedRoutes = findAddedRoutes(change.file, change.before, change.after);
    for (const route of addedRoutes) {
      const covered = exceptions.some((exception) => validateException(exception, today) &&
        exception.file === change.file && exception.method.toLowerCase() === route.method && exception.path === route.path);
      if (!covered) violations.push({ file: change.file, ...route });
    }
  }
  return { violations, invalidExceptions };
}

function defaultBase() {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) return `origin/${baseRef}`;
  const before = process.env.GITHUB_EVENT_BEFORE;
  if (before && !/^0+$/.test(before)) return before;
  return "HEAD^";
}

export function main() {
  const base = process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) ?? defaultBase();
  const mergeBase = git(["merge-base", base, "HEAD"]);
  const changedFiles = git(["diff", "--name-only", `${mergeBase}...HEAD`]).split("\n").filter(isGuardedSourceFile);
  const changes = changedFiles.map((file) => ({
    file,
    before: readGitFile(mergeBase, file),
    after: readGitFile("HEAD", file),
  }));
  const exceptionData = JSON.parse(fs.readFileSync(path.resolve(EXCEPTIONS_PATH), "utf8"));
  const exceptions = exceptionData.exceptions;
  const { violations, invalidExceptions } = evaluateChangedRoutes(changes, exceptions);
  if (invalidExceptions.length) {
    console.error(`Invalid or expired Express route exceptions: ${invalidExceptions.map((item) => `${item.file}:${item.method} ${item.path}`).join("; ")}`);
  }
  if (violations.length) {
    console.error("New Express HTTP route registration requires a scoped exception:");
    for (const route of violations) console.error(`- ${route.file}: ${route.method.toUpperCase()} ${route.path}`);
  }
  if (invalidExceptions.length || violations.length) process.exitCode = 1;
  else console.log(`Express route architecture guard passed (${changedFiles.length} changed server file(s), ${exceptions.length} exception(s)).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
