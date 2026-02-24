import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

const STATIC_ASSET_REQUEST = /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|mjs|woff2?|ttf|eot|map|json|wasm)(\?.*)?$/i;

function isStaticAssetRequest(url: string): boolean {
  return STATIC_ASSET_REQUEST.test(url);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip static asset requests that Vite didn't serve (return 404 instead of 500)
    if (isStaticAssetRequest(url)) {
      return res.status(404).end();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "../..", "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (path.extname(filePath).toLowerCase() === ".html") {
          res.setHeader("Cache-Control", "no-store");
        }
      },
    })
  );

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    if (isStaticAssetRequest(req.originalUrl)) {
      res.setHeader("Cache-Control", "no-store");
      res.type("text/plain");
      return res.status(404).send("Not Found");
    }

    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
