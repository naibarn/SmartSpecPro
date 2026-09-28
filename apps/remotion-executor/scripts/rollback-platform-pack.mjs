import fs from "node:fs/promises";
import path from "node:path";

const destinationArg = process.argv.includes("--archive") ? process.argv[process.argv.indexOf("--archive") + 1] : process.argv[2];
const destination = path.resolve(destinationArg ?? "");
if (!destination) throw new Error("runtime_pack_archive_required");
const previous = `${destination}.previous`;
await fs.access(previous);
await fs.rm(destination, { force: true });
await fs.rename(previous, destination);
await fs.rename(`${previous}.manifest.json`, `${destination}.manifest.json`).catch(() => {});
console.log(JSON.stringify({ rolledBack: destination }));
