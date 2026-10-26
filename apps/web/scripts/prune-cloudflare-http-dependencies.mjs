import { builtinModules, createRequire } from "node:module";
import { lstat, readdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const devOnly = new Set(["vite", "@vitejs/plugin-react", "@tailwindcss/vite"]);
const packageName = name => name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0];

/** Only the packager's owned staging copy may be pruned. The immutable source,
 * Linux artifact and selected API package/peer/native dependencies are retained. */
export async function pruneHttpRuntimeDependencies(runtime, imports) {
  const root = await realpath(runtime);
  if (basename(root) !== "runtime" || !basename(dirname(root)).startsWith(".http-image-")) throw Error("HTTP_IMAGE_PRUNE_STAGING_REQUIRED");
  const nodeModules = join(root, "node_modules"), store = join(nodeModules, ".pnpm");
  try { if (!(await lstat(store)).isDirectory()) throw Error(); }
  catch { return { applied: false, packageCount: null }; } // Portable non-pnpm fixture/artifact.
  const pending = [...new Set([...imports.filter(name => !builtins.has(name)).map(packageName), "tsx"])].map(name => ({ name, from: root, required: !devOnly.has(name) }));
  const kept = new Set(), stores = new Set();
  const resolvePackage = async (name, from, expectedName = name) => {
    if (!/^(@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/.test(name)) throw Error("HTTP_IMAGE_PACKAGE_NAME_INVALID");
    for (const search of createRequire(join(from, "package.json")).resolve.paths(name) ?? []) {
      try {
        const directory = await realpath(join(search, name));
        const local = relative(root, directory);
        if (local.startsWith("..") || isAbsolute(local)) throw Error("HTTP_IMAGE_PACKAGE_ESCAPE");
        const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
        if (manifest.name !== expectedName) throw Error("HTTP_IMAGE_PACKAGE_IDENTITY_MISMATCH");
        return { directory, manifest };
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      }
    }
    return null;
  };
  while (pending.length) {
    const item = pending.shift();
    if (builtins.has(item.name)) continue;
    const found = await resolvePackage(item.name, item.from, item.expectedName);
    if (!found) { if (item.required) throw Error(`HTTP_IMAGE_RUNTIME_PACKAGE_MISSING:${item.name}`); continue; }
    if (kept.has(found.directory)) continue;
    kept.add(found.directory);
    const local = relative(store, found.directory);
    if (!local.startsWith("..") && !isAbsolute(local)) stores.add(local.split("/")[0]);
    const optional = found.manifest.optionalDependencies ?? {};
    for (const name of Object.keys({ ...found.manifest.dependencies, ...optional, ...found.manifest.peerDependencies })) {
      const spec = optional[name] ?? found.manifest.dependencies?.[name] ?? found.manifest.peerDependencies?.[name];
      const alias = typeof spec === "string" ? /^npm:((?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+)(?:@|$)/.exec(spec) : null;
      pending.push({ name, expectedName: alias?.[1] ?? name, from: found.directory, required: Boolean(found.manifest.dependencies?.[name]) && !optional[name] });
    }
  }
  // Resolve the whole graph before deleting anything. A missing required edge
  // leaves the stage unchanged, rather than producing a broken partial image.
  for (const entry of await readdir(store, { withFileTypes: true }))
    if (entry.isDirectory() && entry.name !== "node_modules" && !stores.has(entry.name)) await rm(join(store, entry.name), { recursive: true });
  async function removeDanglingLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        try { await realpath(file); }
        catch (error) { if (error.code === "ENOENT") await rm(file); else throw error; }
      } else if (entry.isDirectory()) await removeDanglingLinks(file);
    }
  }
  await removeDanglingLinks(nodeModules);
  let packageBytes = 0;
  async function bytes(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await bytes(file);
      else if (entry.isFile()) packageBytes += (await stat(file)).size;
    }
  }
  for (const directory of kept) await bytes(directory);
  return { applied: true, packageCount: kept.size, packageBytes };
}
