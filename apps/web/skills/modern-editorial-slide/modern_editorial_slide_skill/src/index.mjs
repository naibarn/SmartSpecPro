import fs from "node:fs/promises";
import path from "node:path";
import { normalizeRequest, resolveImagePath } from "./normalize.mjs";
import { buildLayoutSpec } from "./planner.mjs";
import { writeJsonSpec } from "./render-json.mjs";
import { writeMarkdown } from "./render-md.mjs";
import { writePptx } from "./render-pptx.mjs";
import { tryConvertPptxToPdf } from "./render-pdf.mjs";

async function main() {
  const inputPath = process.argv[2] ?? path.resolve("./examples/demo.input.json");
  const outDir = process.argv[3] ?? path.resolve("./dist");
  const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));

  const normalized = normalizeRequest(raw);
  resolveAllImagePaths(normalized, inputPath);

  const layoutSpec = buildLayoutSpec(normalized);

  const outputs = {};
  if (normalized.outputFormats.includes("json")) {
    outputs.json = await writeJsonSpec(layoutSpec, outDir, normalized.renderOptions.jsonFileName);
  }
  outputs.debug = await writeJsonSpec(layoutSpec.meta?.debug ?? { pages: [] }, outDir, "debug-report.json");

  if (normalized.outputFormats.includes("md")) {
    outputs.md = await writeMarkdown(layoutSpec, outDir, normalized.renderOptions.mdFileName);
  }

  let pptxPath = null;
  if (normalized.outputFormats.includes("pptx") || normalized.outputFormats.includes("pdf")) {
    pptxPath = await writePptx(layoutSpec, outDir, normalized.renderOptions.pptxFileName);
    outputs.pptx = pptxPath;
  }

  if (normalized.outputFormats.includes("pdf")) {
    if (!pptxPath) {
      pptxPath = await writePptx(layoutSpec, outDir, normalized.renderOptions.pptxFileName);
      outputs.pptx = pptxPath;
    }
    outputs.pdf = await tryConvertPptxToPdf(
      pptxPath,
      outDir,
      normalized.renderOptions.pdfFileName,
      normalized.renderOptions.pdfEngine
    );
  }

  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(outputs, null, 2),
    "utf8"
  );

  console.log(JSON.stringify({ ok: true, outputs }, null, 2));
}

function resolveAllImagePaths(normalized, inputPath) {
  const resolveImages = (items = []) => {
    for (const item of items) {
      item.source = resolveImagePath(item.source, inputPath);
    }
  };

  if (normalized.contentMode === "manual-pages") {
    resolveImages(normalized.sharedImagePool?.images);
    for (const page of normalized.pages) resolveImages(page.images);
  } else {
    resolveImages(normalized.globalImagePool?.images);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
