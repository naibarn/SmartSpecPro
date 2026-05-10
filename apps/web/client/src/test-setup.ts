// Fix monorepo React version mismatch — MUST run before any React imports.
// Prefer apps/web React when present; fall back to the hoisted workspace copy.
// @testing-library/react is hoisted to root and resolves react-dom v18.
// This hook forces all react/react-dom imports to resolve from apps/web.
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import i18next from "i18next";
import { i18nReady } from "./i18n";

const webNodeModules = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "node_modules",
);
const workspaceNodeModules = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "node_modules",
);

function resolvePackageDir(packageName: string): string {
  const localPackageDir = path.join(webNodeModules, packageName);
  if (fs.existsSync(localPackageDir)) {
    return localPackageDir;
  }
  return path.join(workspaceNodeModules, packageName);
}

const overrides: Record<string, string> = {
  react: resolvePackageDir("react"),
  "react-dom": resolvePackageDir("react-dom"),
  "react-dom/client": path.join(resolvePackageDir("react-dom"), "client.js"),
  "react-dom/test-utils": path.join(
    resolvePackageDir("react-dom"),
    "test-utils.js",
  ),
};

const originalResolveFilename = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any,
) {
  // Some transformed deps resolve absolute paths to root React 18 jsx runtime.
  // Redirect those absolute runtime paths to apps/web React 19 runtime.
  if (path.isAbsolute(request)) {
    const normalized = request.replace(/\\/g, "/");
    if (
      normalized.includes("/node_modules/react/") &&
      !normalized.includes("/apps/web/node_modules/react/") &&
      (
        normalized.endsWith("/jsx-runtime.js") ||
        normalized.endsWith("/jsx-dev-runtime.js") ||
        normalized.includes("/cjs/react-jsx-runtime.") ||
        normalized.includes("/cjs/react-jsx-dev-runtime.")
      )
    ) {
      const marker = "/node_modules/react/";
      const suffix = normalized.split(marker)[1] ?? "";
      const redirected = path.join(resolvePackageDir("react"), suffix);
      return originalResolveFilename.call(
        this,
        redirected,
        parent,
        isMain,
        options,
      );
    }

    if (
      normalized.includes("/node_modules/react-dom/") &&
      !normalized.includes("/apps/web/node_modules/react-dom/")
    ) {
      const marker = "/node_modules/react-dom/";
      const suffix = normalized.split(marker)[1] ?? "";
      const redirected = path.join(resolvePackageDir("react-dom"), suffix);
      return originalResolveFilename.call(
        this,
        redirected,
        parent,
        isMain,
        options,
      );
    }
  }

  if (overrides[request]) {
    return originalResolveFilename.call(
      this,
      overrides[request],
      parent,
      isMain,
      options,
    );
  }
  if (request.startsWith("react-dom/") && !overrides[request]) {
    const subPath = request.slice("react-dom/".length);
    const redirected = path.join(resolvePackageDir("react-dom"), subPath);
    return originalResolveFilename.call(
      this,
      redirected,
      parent,
      isMain,
      options,
    );
  }
  if (request.startsWith("react/")) {
    const subPath = request.slice("react/".length);
    const redirected = path.join(webNodeModules, "react", subPath);
    return originalResolveFilename.call(
      this,
      redirected,
      parent,
      isMain,
      options,
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (typeof (i18next as any).exists !== "function") {
  (i18next as any).exists = () => false;
}

await i18nReady;

// React 19 testing environment setup
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Mock ResizeObserver (used by Radix UI components)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = ResizeObserverMock;

// RTL auto-cleanup may not trigger with custom module resolution,
// so register it explicitly. Dynamic import ensures the hook is active first.
import { afterEach, vi } from "vitest";

// Mock matchMedia — only in jsdom/browser environments
if (typeof window !== "undefined") {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  afterEach(async () => {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  });
}

// Add jest-dom matchers
import "@testing-library/jest-dom/vitest";
