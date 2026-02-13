// Fix monorepo React version mismatch — MUST run before any React imports.
// Root node_modules has React 18 (from reactflow), apps/web has React 19.
// @testing-library/react is hoisted to root and resolves react-dom v18.
// This hook forces all react/react-dom imports to resolve from apps/web.
import Module from "node:module";
import path from "node:path";

const webNodeModules = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "node_modules",
);

const overrides: Record<string, string> = {
  react: path.join(webNodeModules, "react"),
  "react-dom": path.join(webNodeModules, "react-dom"),
  "react-dom/client": path.join(webNodeModules, "react-dom", "client.js"),
  "react-dom/test-utils": path.join(
    webNodeModules,
    "react-dom",
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
    const redirected = path.join(webNodeModules, "react-dom", subPath);
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

// React 19 testing environment setup
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// RTL auto-cleanup may not trigger with custom module resolution,
// so register it explicitly. Dynamic import ensures the hook is active first.
import { afterEach } from "vitest";

afterEach(async () => {
  const { cleanup } = await import("@testing-library/react");
  cleanup();
});
