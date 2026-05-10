import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { injectPublicSeoSnapshot } from "../services/publicSeoPrerender";

const STATIC_ASSET_REQUEST = /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|mjs|woff2?|ttf|eot|map|json|wasm)(\?.*)?$/i;

function isStaticAssetRequest(url: string): boolean {
  return STATIC_ASSET_REQUEST.test(url);
}

function resolveBaseUrl(req: { protocol?: string; hostname?: string; get?: (header: string) => string | undefined }): string {
  const configured = process.env.SMARTAIHUB_PUBLIC_BASE_URL || process.env.PUBLIC_SITE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || process.env.NODE_ENV !== "production") {
        return `${url.protocol}//${url.host}`;
      }
    } catch {
      // Fall through to the canonical public host.
    }
  }

  const host = (req.hostname || "").trim().toLowerCase();
  if (process.env.NODE_ENV !== "production" && (host === "localhost" || host === "127.0.0.1")) {
    const requestHost = req.get?.("host") || host;
    return `${req.protocol || "http"}://${requestHost}`;
  }

  return "https://smartaihub.app";
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
      const transformed = await vite.transformIndexHtml(url, template);
      const page = injectPublicSeoSnapshot(transformed, url, resolveBaseUrl(req));
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
  app.use("*", async (req, res, next) => {
    if (isStaticAssetRequest(req.originalUrl)) {
      res.setHeader("Cache-Control", "no-store");
      res.type("text/plain");
      return res.status(404).send("Not Found");
    }

    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(indexPath, "utf-8");
      const page = injectPublicSeoSnapshot(template, req.originalUrl, resolveBaseUrl(req));
      res.setHeader("Cache-Control", "no-store");
      res.status(200).type("html").send(page);
    } catch (error) {
      next(error);
    }
  });
}
