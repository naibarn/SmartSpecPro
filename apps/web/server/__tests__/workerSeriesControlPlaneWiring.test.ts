import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CORE_INDEX_PATH = path.resolve(__dirname, "../_core/index.ts");
const ROUTE_PATH = path.resolve(__dirname, "../routes/workerSeriesControlPlane.ts");

describe("Worker Series control-plane route wiring", () => {
  const source = fs.readFileSync(CORE_INDEX_PATH, "utf8");

  it("keeps the route module present and registered", () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true);
    expect(source).toContain(
      'import { registerWorkerSeriesControlPlaneRoutes } from "../routes/workerSeriesControlPlane";',
    );
    expect(source).toContain("registerWorkerSeriesControlPlaneRoutes(app);");
  });

  it("registers the API before the SPA fallback", () => {
    const routeIndex = source.indexOf("registerWorkerSeriesControlPlaneRoutes(app);");
    const fallbackIndexes = [source.indexOf("setupVite(app)"), source.indexOf("serveStatic(app)")]
      .filter(index => index >= 0);

    expect(routeIndex).toBeGreaterThan(-1);
    expect(fallbackIndexes.length).toBeGreaterThan(0);
    expect(Math.max(...fallbackIndexes)).toBeGreaterThan(routeIndex);
  });
});
