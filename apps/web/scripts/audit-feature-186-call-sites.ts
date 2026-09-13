import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const files: string[] = [];
function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", ".next"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|py)$/.test(name)) files.push(path);
  }
}
walk(join(root, "server"));
walk(join(root, "..", "..", "python-backend", "app"));
const patterns = [/\b(?:ensureQueue\(\)|\w*Queue)\.add\s*\(/, /\.delay\s*\(/, /\.apply_async\s*\(/, /send_task\s*\(/];
const allowed = new Set(["server/services/jobTransportAdapters.ts", "server/services/jobOutboxPublisher.ts"]);
const findings = files.flatMap(path => {
  const name = relative(root, path).replaceAll("\\", "/");
  if (allowed.has(name)) return [];
  return readFileSync(path, "utf8").split("\n").flatMap((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) return [];
    return patterns.some(pattern => pattern.test(line))
      ? [{ file: name, line: index + 1, text: trimmed.slice(0, 180) }]
      : [];
  });
});
console.log(JSON.stringify({ feature: 186, mode: "inventory", directTransportCallSites: findings.length, findings, migratedWave: [] }, null, 2));
