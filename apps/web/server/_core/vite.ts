import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import zlib from "zlib";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { injectPublicSeoSnapshot } from "../services/publicSeoPrerender";
import { isApiRequestPath } from "./apiPathGuard";

const STATIC_ASSET_REQUEST = /\.(ico|svg|png|jpg|jpeg|gif|webp|css|js|mjs|woff2?|ttf|eot|map|json|wasm|zip)(\?.*)?$/i;
const HTML_CACHE_CONTROL = "no-store, no-cache, must-revalidate, proxy-revalidate";
const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const STATIC_NOT_FOUND_CACHE_CONTROL = "public, max-age=60";
const COMPRESSIBLE_STATIC_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".map",
  ".svg",
  ".wasm",
]);

function isStaticAssetRequest(url: string): boolean {
  return STATIC_ASSET_REQUEST.test(url);
}

function sendApiFallbackJson(req: express.Request, res: express.Response): void {
  res.status(404).json({
    error: {
      message:
        `API route '${req.originalUrl}' was not handled before the web app fallback. ` +
        "Check that the client is using the SmartSpec web server origin for API requests.",
      code: "API_ROUTE_NOT_HANDLED",
    },
  });
}

function registerHealthRoutes(app: Express): void {
  const handler: express.RequestHandler = (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      status: "ok",
      service: "smartaihub-web",
      uptimeSeconds: Math.round(process.uptime()),
    });
  };

  app.get(["/health", "/healthz", "/api/health"], handler);
}

export function cacheControlForStaticFile(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return HTML_CACHE_CONTROL;
  }

  if (filePath.split(path.sep).includes("assets")) {
    return IMMUTABLE_ASSET_CACHE_CONTROL;
  }

  return null;
}

function isCompressibleStaticFile(filePath: string): boolean {
  return COMPRESSIBLE_STATIC_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function registerCompressedStaticAssets(app: Express, distPath: string): void {
  app.get("*", (req, res, next) => {
    if (!req.acceptsEncodings("gzip")) {
      return next();
    }

    if (req.headers.range || !isStaticAssetRequest(req.path)) {
      return next();
    }

    let requestedPath: string;
    try {
      requestedPath = decodeURIComponent(req.path);
    } catch {
      return next();
    }
    const filePath = path.resolve(distPath, `.${requestedPath}`);
    if (!filePath.startsWith(`${distPath}${path.sep}`) || !isCompressibleStaticFile(filePath)) {
      return next();
    }

    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) {
        return next();
      }

      const cacheControl = cacheControlForStaticFile(filePath);
      if (cacheControl) {
        res.setHeader("Cache-Control", cacheControl);
      }
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
      res.type(path.extname(filePath));

      fs.createReadStream(filePath)
        .on("error", next)
        .pipe(zlib.createGzip())
        .on("error", next)
        .pipe(res);
    });
  });
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

  registerHealthRoutes(app);
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    if (isApiRequestPath(url)) {
      return sendApiFallbackJson(req, res);
    }

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
      res
        .status(200)
        .set({
          "Content-Type": "text/html",
          "Cache-Control": HTML_CACHE_CONTROL,
        })
        .end(page);
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

  registerCompressedStaticAssets(app, distPath);

  app.use(
    express.static(distPath, {
      setHeaders: (res, filePath) => {
        const cacheControl = cacheControlForStaticFile(filePath);
        if (cacheControl) {
          res.setHeader("Cache-Control", cacheControl);
        }
        if (path.extname(filePath).toLowerCase() === ".zip") {
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
      },
    })
  );

  registerHealthRoutes(app);

  // fall through to index.html if the file doesn't exist
  app.use("*", async (req, res, next) => {
    if (isApiRequestPath(req.originalUrl)) {
      return sendApiFallbackJson(req, res);
    }

    if (isStaticAssetRequest(req.originalUrl)) {
      res.setHeader("Cache-Control", STATIC_NOT_FOUND_CACHE_CONTROL);
      res.type("text/plain");
      return res.status(404).send("Not Found");
    }

    try {
      const indexPath = path.resolve(distPath, "index.html");
      const template = await fs.promises.readFile(indexPath, "utf-8");
      const page = injectPublicSeoSnapshot(template, req.originalUrl, resolveBaseUrl(req));
      res.setHeader("Cache-Control", HTML_CACHE_CONTROL);
      res.status(200).type("html").send(page);
    } catch (error: any) {
      // A missing/unreadable index.html means the build output is momentarily
      // incomplete (e.g. a non-atomic `npm run build` mid-flight emptied
      // dist/public). This is a transient deploy condition, not a server
      // bug — respond 503 with Retry-After instead of letting it fall
      // through to the generic 500 handler or bubble further. Never let this
      // become an uncaught exception that could take the process down.
      if (error?.code === "ENOENT") {
        console.error(
          `[serveStatic] index.html missing at ${distPath} — build likely in progress. Responding 503.`
        );
        res.setHeader("Retry-After", "5");
        res.status(503).type("text/plain").send("Service temporarily unavailable: deploy in progress");
        return;
      }
      next(error);
    }
  });
}
