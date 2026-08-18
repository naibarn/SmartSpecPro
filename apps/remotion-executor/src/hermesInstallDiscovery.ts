import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type HermesInstallCandidate = {
  source: "hermes_cli" | "hermes_one";
  root: string;
  executable: string | null;
  provenance: "known_path";
};

function knownRoots(): Array<{ source: HermesInstallCandidate["source"]; root: string }> {
  const home = process.env.HOME ?? os.homedir();
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? "";
    const roaming = process.env.APPDATA ?? "";
    const roots: Array<{ source: HermesInstallCandidate["source"]; root: string }> = [
      { source: "hermes_one", root: path.join(local, "Hermes") },
      { source: "hermes_cli", root: path.join(local, "SmartAIHub", "Hermes") },
      { source: "hermes_cli", root: path.join(roaming, "Hermes") },
    ];
    return roots.filter((candidate) => candidate.root.length > 0);
  }
  return [
    { source: "hermes_one", root: path.join(home, "Library", "Application Support", "Hermes") },
    { source: "hermes_cli", root: path.join(home, ".hermes") },
    { source: "hermes_cli", root: path.join(home, "Library", "Application Support", "SmartAIHub", "Hermes") },
  ];
}

export async function discoverHermesInstallations(): Promise<HermesInstallCandidate[]> {
  const results: HermesInstallCandidate[] = [];
  for (const candidate of knownRoots()) {
    try {
      const stat = await fs.stat(candidate.root);
      if (!stat.isDirectory()) continue;
      const executableCandidates = process.platform === "win32"
        ? [path.join(candidate.root, "hermes.exe"), path.join(candidate.root, "hermes.cmd"), path.join(candidate.root, "bin", "hermes.exe")]
        : [path.join(candidate.root, "hermes"), path.join(candidate.root, "bin", "hermes")];
      let executable: string | null = null;
      for (const file of executableCandidates) {
        try { if ((await fs.stat(file)).isFile()) { executable = file; break; } } catch { /* candidate absent */ }
      }
      results.push({ ...candidate, executable, provenance: "known_path" });
    } catch { /* closed registry candidate absent */ }
  }
  return results;
}
