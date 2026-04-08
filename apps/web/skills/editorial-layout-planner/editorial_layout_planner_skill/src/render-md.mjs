import fs from "node:fs/promises";
import path from "node:path";

export async function writeMarkdown(layoutSpec, outDir, fileName = "slides.md") {
  await fs.mkdir(outDir, { recursive: true });
  const outputPath = path.join(outDir, fileName);
  const lines = [
    `# ${layoutSpec.meta?.projectTitle ?? "Slide Deck"}`,
    "",
    `- ratio: ${layoutSpec.canvas.ratio}`,
    `- theme: ${layoutSpec.meta?.designStyle ?? "custom"}`,
    `- slides: ${layoutSpec.slides.length}`,
    ""
  ];

  for (const slide of layoutSpec.slides) {
    lines.push(`## ${slide.editorialStructure?.pageTitle ?? slide.id}`);
    lines.push("");
    lines.push(`- intent: ${slide.intent}`);
    lines.push(`- archetype: ${slide.archetype}`);
    if (slide.editorialStructure?.deck) {
      lines.push(`- deck: ${slide.editorialStructure.deck}`);
    }
    lines.push("");
    const textElements = slide.elements.filter(el => el.kind === "text" && el.text);
    for (const el of textElements) {
      lines.push(`### ${el.role}`);
      lines.push("");
      lines.push(el.text);
      lines.push("");
    }
  }

  await fs.writeFile(outputPath, lines.join("\n"), "utf8");
  return outputPath;
}
