import { mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, transform } from "esbuild";

/** Compile application modules during image preparation. Packages and original
 * source remain in the image for native dependencies and dynamic workers. No
 * application code, environment file, migration or scheduler is executed. */
export async function bundleCloudflareHttpApi(sourceRoot, output, runtimeRoot = "/app") {
  const root = await realpath(sourceRoot);
  if (!isAbsolute(runtimeRoot) || !isAbsolute(output)) throw Error("HTTP_API_BUNDLE_PATH_REQUIRED");
  const alias = {};
  let workspacePackages = [];
  try { workspacePackages = await readdir(resolve(root, "node_modules/@smartspec")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const name of workspacePackages) {
    const directory = await realpath(resolve(root, "node_modules/@smartspec", name));
    const local = relative(root, directory);
    if (!local || local.startsWith("../") || isAbsolute(local)) throw Error("HTTP_API_BUNDLE_SOURCE_ESCAPE");
    const packageJson = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
    const packageName = `@smartspec/${name}`;
    const exports = packageJson.exports;
    alias[packageName] = directory;
    if (!exports || typeof exports !== "object" || Array.isArray(exports)) {
      continue;
    }
    for (const [subpath, value] of Object.entries(exports)) {
      const target = exportTarget(value);
      if (!target) continue;
      const aliasName = subpath === "." ? packageName : `${packageName}/${subpath.slice(2)}`;
      if (subpath.includes("*")) {
        // Keep wildcard exports on the package directory alias. Exact
        // subpath exports below take precedence and retain their target.
        continue;
      }
      if (!target.startsWith("./") || target.includes("..")) throw Error("HTTP_API_BUNDLE_PACKAGE_EXPORT_INVALID");
      const exported = await realpath(resolve(directory, target));
      const exportedRelative = relative(directory, exported);
      if (!exportedRelative || exportedRelative.startsWith("../") || isAbsolute(exportedRelative)) throw Error("HTTP_API_BUNDLE_SOURCE_ESCAPE");
      alias[aliasName] = exported;
    }
  }
  const result = await build({
    absWorkingDir: root,
    entryPoints: { "server/_core/cloudflare-http-api/index": "server/_core/index.ts" },
    outdir: output,
    outExtension: { ".js": ".mjs" },
    chunkNames: "chunks/[name]-[hash]",
    bundle: true,
    splitting: true,
    packages: "external",
    alias,
    platform: "node",
    format: "esm",
    target: "node22",
    keepNames: true,
    treeShaking: false,
    metafile: true,
    write: false,
    logLevel: "silent",
    plugins: [{
      name: "retain-source-relative-assets",
      setup(builder) {
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
          const source = await realpath(args.path), name = relative(root, source);
          if (!name || name.startsWith("../") || isAbsolute(name)) throw Error("HTTP_API_BUNDLE_SOURCE_ESCAPE");
          const text = await readFile(source, "utf8");
          if (!text.includes("import.meta")) return undefined;
          const runtimeFile = resolve(runtimeRoot, name);
          const loader = extname(source).slice(1).replace(/^[cm](?=[jt]s$)/, "");
          // Definitions are parsed by esbuild, not replaced inside string
          // literals/comments. Each module keeps its original asset anchors.
          const transformed = await transform(text, {
            loader, target: "node22", sourcefile: name,
            define: {
              "import.meta.url": JSON.stringify(pathToFileURL(runtimeFile).href),
              "import.meta.filename": JSON.stringify(runtimeFile),
              "import.meta.dirname": JSON.stringify(dirname(runtimeFile)),
            },
          });
          return { contents: transformed.code, loader: "js", resolveDir: dirname(source) };
        });
      },
    }],
  });
  // Native Node must not require runtime TypeScript transformation. Splitting
  // also retains lazy imports and a single identity for shared module state.
  for (const file of Object.values(result.metafile.outputs)) {
    if (file.imports.some(item => item.external && /\.[cm]?tsx?(?:$|[?#])/.test(item.path))) throw Error("HTTP_API_BUNDLE_EXTERNAL_TYPESCRIPT_DENIED");
  }
  await mkdir(output, { recursive: true });
  const files = [];
  for (const file of result.outputFiles) {
    const name = relative(output, file.path);
    if (!name || name.startsWith("../") || isAbsolute(name)) throw Error("HTTP_API_BUNDLE_OUTPUT_REQUIRED");
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents, { flag: "wx", mode: 0o444 });
    files.push({ name, sha256: createHash("sha256").update(file.contents).digest("hex"), bytes: file.contents.length });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { entrypoint: "server/_core/cloudflare-http-api/index.mjs", manifestSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    bytes: files.reduce((sum, file) => sum + file.bytes, 0), inputModules: Object.keys(result.metafile.inputs).length, files };
}

function exportTarget(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) { const target = exportTarget(item); if (target) return target; }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const condition of ["import", "node", "default"]) {
    const target = exportTarget(value[condition]);
    if (target) return target;
  }
  return undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output, runtimeRoot] = process.argv.slice(2);
  try {
    if (!source || !output) throw Error("HTTP_API_BUNDLE_PATH_REQUIRED");
    console.log(JSON.stringify(await bundleCloudflareHttpApi(source, output, runtimeRoot)));
  } catch (error) {
    console.error(error.errors ?? error.message);
    process.exitCode = 1;
  }
}
