import { describe, expect, it } from "vitest";

import {
  runHyperframesDependencyAudit,
  runHyperframesDoctorCheck,
} from "../hyperframesDependencyAudit";

describe("hyperframesDependencyAudit", () => {
  it("keeps package installation deferred and flags safe by default", () => {
    const audit = runHyperframesDependencyAudit();

    expect(audit.packageInstallDeferred).toBe(true);
    expect(audit.mainBundleExcluded).toBe(true);
    expect(audit.gate).toBe("partial");
    expect(audit.notes.join(" ")).toContain("deferred");
  });

  it("doctor reports runtime checks without printing secrets", () => {
    const doctor = runHyperframesDoctorCheck();

    expect(doctor.node.version).toBe(process.version);
    expect(doctor.hyperframesRuntime.ok).toBe(false);
    expect(doctor.localSmokeRenderer.renderer).toBe(
      "playwright_chromium_ffmpeg_smoke"
    );
    expect(doctor.secretsPrinted).toBe(false);
  });
});
