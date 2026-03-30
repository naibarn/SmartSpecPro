import pptxgen from "pptxgenjs";
import fs from "node:fs";
import path from "node:path";

function resolveLayout(layoutSpec) {
  const { ratio, widthIn, heightIn } = layoutSpec.canvas;
  return { name: `CUSTOM_${ratio.replace(':', 'x')}`, width: widthIn, height: heightIn };
}

function pctToInches(slideSpec, xPct, yPct, wPct, hPct) {
  const { widthIn, heightIn } = slideSpec.canvas;
  return {
    x: (xPct / 100) * widthIn,
    y: (yPct / 100) * heightIn,
    w: (wPct / 100) * widthIn,
    h: (hPct / 100) * heightIn
  };
}

function fitFont(role, ratio) {
  if (role === "title") return ratio === "9:16" ? 22 : 24;
  if (role === "kicker") return 11;
  if (role === "deck") return 12;
  if (role.includes("number")) return 20;
  if (role === "caption") return 9;
  return 11.5;
}

function isColor(value) {
  return typeof value === "string" && /^#?[0-9A-Fa-f]{6}$/.test(value);
}

function sanitizeColor(value, fallback) {
  if (!isColor(value)) return fallback.replace("#", "");
  return value.replace("#", "");
}

function addShape(slide, slideSpec, element, theme) {
  const box = pctToInches(slideSpec, element.xPct, element.yPct, element.wPct, element.hPct);
  slide.addShape("rect", {
    ...box,
    fill: { color: sanitizeColor(element.fill ?? theme.panel ?? theme.background, theme.panel ?? theme.background) },
    line: { color: sanitizeColor(element.line ?? element.fill ?? theme.panel ?? theme.background, theme.panel ?? theme.background) },
    radius: element.radius ?? 0.12
  });
}

function addText(slide, slideSpec, element, theme) {
  const box = pctToInches(slideSpec, element.xPct, element.yPct, element.wPct, element.hPct);
  slide.addText(element.text ?? "", {
    ...box,
    fontFace: element.role === "title" || element.role === "kicker"
      ? (element.fontFace ?? theme.titleFont ?? "Aptos Display")
      : (element.fontFace ?? theme.bodyFont ?? "Aptos"),
    fontSize: element.fontSize ?? fitFont(element.role ?? "", slideSpec.canvas.ratio),
    color: sanitizeColor(element.color ?? theme.text ?? "#1A1A1A", theme.text ?? "#1A1A1A"),
    bold: element.role === "title" || element.role?.includes("heading"),
    margin: 0,
    valign: "mid",
    breakLine: false,
    fit: "shrink",
    paraSpaceAfterPt: 0
  });
}

function addImage(slide, slideSpec, element) {
  const box = pctToInches(slideSpec, element.xPct, element.yPct, element.wPct, element.hPct);
  const source = element.source;
  if (!source) return;
  if (/^https?:\/\//i.test(source)) {
    // PptxGenJS can embed remote URLs only if accessible at generation time.
    slide.addText(`[Remote image placeholder]\n${source}`, {
      ...box,
      fontSize: 10,
      color: "666666",
      margin: 0.1,
      valign: "mid",
      align: "center",
      border: { color: "CCCCCC", pt: 1 }
    });
    return;
  }

  if (!fs.existsSync(source)) {
    slide.addText(`[Missing image]\n${path.basename(source)}`, {
      ...box,
      fontSize: 10,
      color: "666666",
      margin: 0.1,
      valign: "mid",
      align: "center",
      border: { color: "CCCCCC", pt: 1 }
    });
    return;
  }

  slide.addImage({ path: source, ...box, transparency: element.opacity ? Math.round((1 - element.opacity) * 100) : 0 });
}

export async function writePptx(layoutSpec, outDir, fileName = "slides.pptx") {
  const pptx = new pptxgen();
  const layout = resolveLayout(layoutSpec);
  pptx.defineLayout(layout);
  pptx.layout = layout.name;
  pptx.author = "OpenAI";
  pptx.company = "OpenAI";
  pptx.subject = layoutSpec.meta?.projectTitle ?? "Modern Editorial Slide Deck";
  pptx.title = layoutSpec.meta?.projectTitle ?? "Modern Editorial Slide Deck";
  pptx.lang = "th-TH";
  pptx.theme = {
    headFontFace: layoutSpec.theme.titleFont ?? "Aptos Display",
    bodyFontFace: layoutSpec.theme.bodyFont ?? "Aptos",
    lang: "th-TH"
  };

  for (const slideSpec of layoutSpec.slides) {
    const slide = pptx.addSlide();
    slide.background = { color: sanitizeColor(slideSpec.background ?? layoutSpec.theme.background ?? "#FFFFFF", "#FFFFFF") };

    for (const element of slideSpec.elements) {
      if (element.kind === "shape") addShape(slide, layoutSpec, element, layoutSpec.theme);
      else if (element.kind === "text") addText(slide, layoutSpec, element, layoutSpec.theme);
      else if (element.kind === "image") addImage(slide, layoutSpec, element);
    }

    // speaker notes with layout metadata
    slide.addNotes(`
[Sources]
Generated from structured layout spec.
Intent: ${slideSpec.intent}
Archetype: ${slideSpec.archetype}

${slideSpec.notes ? `\n[Page Notes]\n${slideSpec.notes}` : ""}
    `.trim());
  }

  const outputPath = path.join(outDir, fileName);
  await pptx.writeFile({ fileName: outputPath });
  return outputPath;
}
