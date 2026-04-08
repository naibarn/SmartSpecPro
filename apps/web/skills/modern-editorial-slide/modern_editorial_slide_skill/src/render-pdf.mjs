import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

export async function tryConvertPptxToPdf(pptxPath, outDir, pdfFileName = "slides.pdf", engine = "libreoffice") {
  if (engine === "skip") return null;
  const absOut = path.resolve(outDir);
  await fs.mkdir(absOut, { recursive: true });
  try {
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to", "pdf",
      "--outdir", absOut,
      path.resolve(pptxPath)
    ]);
  } catch (error) {
    const message = error?.stderr || error?.message || String(error);
    throw new Error(`PDF conversion failed. Ensure LibreOffice (soffice) is installed. Details: ${message}`);
  }

  const generatedPdf = path.join(absOut, path.basename(pptxPath, path.extname(pptxPath)) + ".pdf");
  const finalPdf = path.join(absOut, pdfFileName);
  try {
    await fs.rename(generatedPdf, finalPdf);
  } catch {
    return generatedPdf;
  }
  return finalPdf;
}
