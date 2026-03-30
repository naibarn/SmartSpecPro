import fs from "node:fs/promises";
import path from "node:path";

export async function writeJsonSpec(layoutSpec, outDir, fileName = "layout-spec.json") {
  await fs.mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, fileName);
  await fs.writeFile(outputPath, JSON.stringify(layoutSpec, null, 2), "utf8");
  return outputPath;
}
