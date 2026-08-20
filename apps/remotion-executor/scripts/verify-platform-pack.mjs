import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");
const archivePath = path.resolve(process.argv.includes("--archive") ? process.argv[process.argv.indexOf("--archive") + 1] : process.argv[2] ?? "");
if (!archivePath) throw new Error("runtime_pack_archive_required");
const manifest = JSON.parse(await fs.readFile(`${archivePath}.manifest.json`, "utf8"));
const actualHash = crypto.createHash("sha256").update(await fs.readFile(archivePath)).digest("hex");
if (actualHash !== manifest.archiveSha256) throw new Error("runtime_pack_checksum_mismatch");
const publicKey = process.env.SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY?.trim();
if (!publicKey || !crypto.verify(null, Buffer.from(actualHash), crypto.createPublicKey(publicKey), Buffer.from(manifest.archiveSignature, "base64"))) {
  throw new Error("runtime_pack_signature_invalid");
}
let entries;
try {
  entries = (await exec("unzip", ["-Z1", archivePath])).stdout.split(/\r?\n/).filter(Boolean);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
  entries = new AdmZip(archivePath).getEntries().map((entry) => entry.entryName).filter(Boolean);
}
if (!entries.includes("runtime-pack/remotion-sidecar/render.mjs")) {
  throw new Error("runtime_pack_sidecar_missing");
}
console.log(JSON.stringify({ valid: true, runtimeId: manifest.runtimeId, version: manifest.version, archiveSha256: actualHash }));
