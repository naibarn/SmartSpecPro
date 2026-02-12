#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function parseTscLog(content) {
  const lines = content.split(/\r?\n/);
  const codeCounts = new Map();
  const fileCounts = new Map();

  for (const line of lines) {
    const match = line.match(/^(.*?\.(?:ts|tsx))\(\d+,\d+\): error (TS\d+):/);
    if (!match) continue;
    const filePath = match[1];
    const code = match[2];

    codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    fileCounts.set(filePath, (fileCounts.get(filePath) ?? 0) + 1);
  }

  const codes = [...codeCounts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  const topFiles = [...fileCounts.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);

  return {
    total_errors: codes.reduce((sum, item) => sum + item.count, 0),
    codes,
    top_files: topFiles,
  };
}

function main() {
  const [, , inputPath, outputPath] = process.argv;
  if (!inputPath || !outputPath) {
    console.error(
      "Usage: node apps/web/scripts/generate-typescript-report.mjs <tsc-log-path> <output-json-path>",
    );
    process.exit(1);
  }

  const content = fs.readFileSync(inputPath, "utf8");
  const report = parseTscLog(content);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outputPath} (total_errors=${report.total_errors})`);
}

main();
