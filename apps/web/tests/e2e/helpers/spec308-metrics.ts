import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import type { Page } from "@playwright/test";

type BrowserProbe = {
  layoutShifts: Array<{ value: number; startTime: number }>;
  layoutShiftEntries: number;
  layoutShiftObserverAvailable: boolean;
  functionTimeoutRegistrations: number;
  functionIntervalRegistrations: number;
  activeFunctionTimeouts: number;
  activeFunctionIntervals: number;
  untrackedStringTimeoutRegistrations: number;
  untrackedStringIntervalRegistrations: number;
};

export type Spec308MetricSnapshot = {
  phase: string;
  profile: string;
  viewport: { width: number; height: number };
  network: {
    requestsStarted: number;
    requestsFailed: number;
    sameOriginResourceEntries: number;
    transferSizeBytes: number;
    encodedBodyBytes: number;
  };
  heap: { jsHeapUsedBytes: number; source: "chromium-cdp-proxy" };
  layout: { cumulativeLayoutShift: number; qualifyingEntries: number };
  frameRendering?: {
    framesObserved: number;
    meanFrameIntervalMs: number;
    p95FrameIntervalMs: number;
    maxFrameIntervalMs: number;
    intervalsOver16_7ms: number;
  };
  timers: Pick<BrowserProbe,
    | "functionTimeoutRegistrations"
    | "functionIntervalRegistrations"
    | "activeFunctionTimeouts"
    | "activeFunctionIntervals"
    | "untrackedStringTimeoutRegistrations"
    | "untrackedStringIntervalRegistrations"
  >;
  mockedProcedureCalls: number;
};

export type Spec308MetricsEvidence = {
  schemaVersion: 1;
  sourceSha: string;
  comparison: "same-build, same-browser, feature-flag OFF versus ON across emulated viewport profiles";
  acceptanceBoundary: "Mocked authenticated UI fixture only; viewport/CPU/network emulation is not physical-device or QA-budget acceptance, and this is not a main-versus-candidate commit comparison or live acceptance.";
  profiles: Array<{
    name: string;
    viewport: { width: number; height: number };
    deviceScaleFactor: 1;
    cpuThrottlingRate: number;
    network: "baseline";
  }>;
  thresholds: "not defined; no budget pass/fail is asserted";
  browser: { engine: "Chromium"; userAgent: string };
  mascotSvg: {
    method: "Rendered settings preview SVG outerHTML, gzipSync";
    totalGzipBytes: number;
    variants: Array<{ style: string; rawBytes: number; gzipBytes: number }>;
  };
  samples: Spec308MetricSnapshot[];
};

export async function installSpec308MetricsProbe(page: Page) {
  let requestsStarted = 0;
  let requestsFailed = 0;

  page.on("request", request => {
    const requestUrl = new URL(request.url());
    if (requestUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(requestUrl.hostname)) return;
    requestsStarted += 1;
  });
  page.on("requestfailed", request => {
    const requestUrl = new URL(request.url());
    if (requestUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(requestUrl.hostname)) requestsFailed += 1;
  });

  await page.addInitScript(() => {
    const scope = window as Window & { __spec308MetricProbe?: BrowserProbe };
    const probe: BrowserProbe = {
      layoutShifts: [],
      layoutShiftEntries: 0,
      layoutShiftObserverAvailable: false,
      functionTimeoutRegistrations: 0,
      functionIntervalRegistrations: 0,
      activeFunctionTimeouts: 0,
      activeFunctionIntervals: 0,
      untrackedStringTimeoutRegistrations: 0,
      untrackedStringIntervalRegistrations: 0,
    };
    scope.__spec308MetricProbe = probe;

    const activeTimeouts = new Set<number>();
    const activeIntervals = new Set<number>();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const nativeClearTimeout = window.clearTimeout.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);

    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        probe.untrackedStringTimeoutRegistrations += 1;
        return nativeSetTimeout(handler, timeout, ...args);
      }
      let handle = 0;
      const wrapped: TimerHandler = (...callbackArgs: unknown[]) => {
        activeTimeouts.delete(handle);
        probe.activeFunctionTimeouts = activeTimeouts.size;
        Reflect.apply(handler, window, callbackArgs);
      };
      handle = nativeSetTimeout(wrapped, timeout, ...args);
      activeTimeouts.add(handle);
      probe.functionTimeoutRegistrations += 1;
      probe.activeFunctionTimeouts = activeTimeouts.size;
      return handle;
    }) as typeof window.setTimeout;

    window.clearTimeout = ((handle?: number) => {
      if (handle !== undefined) activeTimeouts.delete(handle);
      probe.activeFunctionTimeouts = activeTimeouts.size;
      nativeClearTimeout(handle);
    }) as typeof window.clearTimeout;

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (typeof handler !== "function") {
        probe.untrackedStringIntervalRegistrations += 1;
        return nativeSetInterval(handler, timeout, ...args);
      }
      const handle = nativeSetInterval(handler, timeout, ...args);
      activeIntervals.add(handle);
      probe.functionIntervalRegistrations += 1;
      probe.activeFunctionIntervals = activeIntervals.size;
      return handle;
    }) as typeof window.setInterval;

    window.clearInterval = ((handle?: number) => {
      if (handle !== undefined) activeIntervals.delete(handle);
      probe.activeFunctionIntervals = activeIntervals.size;
      nativeClearInterval(handle);
    }) as typeof window.clearInterval;

    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { hadRecentInput?: boolean; value?: number }>) {
          if (entry.entryType !== "layout-shift" || entry.hadRecentInput || typeof entry.value !== "number") continue;
          probe.layoutShifts.push({ value: entry.value, startTime: entry.startTime });
          probe.layoutShiftEntries += 1;
        }
      });
      observer.observe({ type: "layout-shift", buffered: true });
      probe.layoutShiftObserverAvailable = true;
    } catch {
      // Unsupported browsers report zero entries; this workflow runs Chromium.
    }
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");

  return {
    async resetLayoutShiftWindow() {
      await page.evaluate(() => {
        const probe = (window as Window & { __spec308MetricProbe?: BrowserProbe }).__spec308MetricProbe;
        if (!probe) throw new Error("SPEC-308 metrics probe is unavailable");
        probe.layoutShifts = [];
        probe.layoutShiftEntries = 0;
      });
    },
    async snapshot(phase: string, profile: string, mockedProcedureCalls: number): Promise<Spec308MetricSnapshot> {
      await cdp.send("HeapProfiler.collectGarbage");
      const [viewport, browserProbe, resources, cdpMetrics] = await Promise.all([
        page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
        page.evaluate(() => {
          const value = (window as Window & { __spec308MetricProbe?: BrowserProbe }).__spec308MetricProbe;
          if (!value) return null;
          const shifts = [...value.layoutShifts].sort((a, b) => a.startTime - b.startTime);
          let largestSession = 0;
          let sessionValue = 0;
          let sessionStart = 0;
          let lastShift = 0;
          for (const shift of shifts) {
            if (sessionValue === 0 || shift.startTime - lastShift >= 1000 || shift.startTime - sessionStart > 5000) {
              sessionValue = shift.value;
              sessionStart = shift.startTime;
            } else {
              sessionValue += shift.value;
            }
            lastShift = shift.startTime;
            largestSession = Math.max(largestSession, sessionValue);
          }
          return {
            clsSessionWindow: largestSession,
            layoutShiftEntries: value.layoutShiftEntries,
            layoutShiftObserverAvailable: value.layoutShiftObserverAvailable,
            functionTimeoutRegistrations: value.functionTimeoutRegistrations,
            functionIntervalRegistrations: value.functionIntervalRegistrations,
            activeFunctionTimeouts: value.activeFunctionTimeouts,
            activeFunctionIntervals: value.activeFunctionIntervals,
            untrackedStringTimeoutRegistrations: value.untrackedStringTimeoutRegistrations,
            untrackedStringIntervalRegistrations: value.untrackedStringIntervalRegistrations,
          };
        }),
        page.evaluate(() => {
          const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          const origin = window.location.origin;
          const sameOriginEntries = entries.filter(entry => {
            try { return new URL(entry.name).origin === origin; } catch { return false; }
          });
          return {
            count: sameOriginEntries.length,
            transferSizeBytes: sameOriginEntries.reduce((total, entry) => total + entry.transferSize, 0),
            encodedBodyBytes: sameOriginEntries.reduce((total, entry) => total + entry.encodedBodySize, 0),
          };
        }),
        cdp.send("Performance.getMetrics"),
      ]);
      const heapMetric = cdpMetrics.metrics.find(metric => metric.name === "JSHeapUsedSize");
      if (!browserProbe?.layoutShiftObserverAvailable) {
        throw new Error("SPEC-308 metrics probe did not attach the layout-shift observer");
      }
      if (!heapMetric || !Number.isFinite(heapMetric.value)) {
        throw new Error("Chromium CDP did not provide JSHeapUsedSize");
      }

      const result: Spec308MetricSnapshot = {
        phase,
        profile,
        viewport,
        network: {
          requestsStarted,
          requestsFailed,
          sameOriginResourceEntries: resources.count,
          transferSizeBytes: resources.transferSizeBytes,
          encodedBodyBytes: resources.encodedBodyBytes,
        },
        heap: { jsHeapUsedBytes: heapMetric.value, source: "chromium-cdp-proxy" },
        layout: {
          cumulativeLayoutShift: browserProbe?.clsSessionWindow ?? 0,
          qualifyingEntries: browserProbe?.layoutShiftEntries ?? 0,
        },
        timers: {
          functionTimeoutRegistrations: browserProbe.functionTimeoutRegistrations,
          functionIntervalRegistrations: browserProbe.functionIntervalRegistrations,
          activeFunctionTimeouts: browserProbe.activeFunctionTimeouts,
          activeFunctionIntervals: browserProbe.activeFunctionIntervals,
          untrackedStringTimeoutRegistrations: browserProbe.untrackedStringTimeoutRegistrations,
          untrackedStringIntervalRegistrations: browserProbe.untrackedStringIntervalRegistrations,
        },
        mockedProcedureCalls,
      };
      requestsStarted = 0;
      requestsFailed = 0;
      return result;
    },
    async close() {
      await cdp.detach();
    },
    async clearBrowserCache() {
      await cdp.send("Network.clearBrowserCache");
    },
    async setEmulationProfile(profile: "low-end-mobile-cpu-emulation" | "tablet-emulation" | "desktop-emulation") {
      const mobile = profile === "low-end-mobile-cpu-emulation";
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: mobile ? 4 : 1 });
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
        connectionType: "none",
      });
    },
  };
}

export async function measureMascotSvgGzip(page: Page): Promise<Spec308MetricsEvidence["mascotSvg"]> {
  await page.goto("/settings?tab=notifications");
  await page.getByTestId("assistant-appearance-preferences").waitFor({ state: "visible" });
  const renderedVariants = await page.locator('[data-testid^="assistant-mascot-style-"][data-testid$="-preview"]').evaluateAll(containers =>
    containers.flatMap(container => {
      const svg = container.querySelector<SVGSVGElement>("svg[data-mascot-style]");
      return svg ? [{ style: svg.dataset.mascotStyle ?? "", markup: svg.outerHTML }] : [];
    }),
  );
  if (renderedVariants.length !== 5 || renderedVariants.some(variant => !variant.style || !variant.markup)) {
    throw new Error(`Expected five rendered mascot SVG previews, found ${renderedVariants.length}`);
  }
  const variants = renderedVariants.map(({ style, markup }) => {
    const raw = Buffer.from(markup, "utf8");
    return { style, rawBytes: raw.byteLength, gzipBytes: gzipSync(raw).byteLength };
  });
  return {
    method: "Rendered settings preview SVG outerHTML, gzipSync",
    totalGzipBytes: variants.reduce((total, variant) => total + variant.gzipBytes, 0),
    variants,
  };
}

export async function writeSpec308MetricsEvidence(evidence: Spec308MetricsEvidence) {
  const outputPath = path.resolve("test-results/production-director", `spec-308-metrics-${evidence.sourceSha.slice(0, 12)}-profiles.json`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return outputPath;
}

export function getSpec308SourceSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}
