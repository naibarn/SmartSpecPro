import { describe, expect, it } from "vitest";

import {
  isSupportedHyperframesNodeVersion,
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
    expect(doctor.node.requirement).toBe(">=20.20.0 <21 || >=22.22.0");
    expect(doctor.node.ok).toBe(isSupportedHyperframesNodeVersion(process.version));
    expect(doctor.hyperframesRuntime.ok).toBe(false);
    expect(doctor.localSmokeRenderer.renderer).toBe(
      "playwright_chromium_ffmpeg_smoke"
    );
    expect(typeof doctor.fonts.fontconfigAvailable).toBe("boolean");
    expect(Array.isArray(doctor.fonts.thaiFontFamilies)).toBe(true);
    expect(doctor.secretsPrinted).toBe(false);
  });

  it("uses the SmartSpecPro engine range for HyperFrames runtime checks", () => {
    expect(isSupportedHyperframesNodeVersion("v20.19.2")).toBe(false);
    expect(isSupportedHyperframesNodeVersion("v20.20.0")).toBe(true);
    expect(isSupportedHyperframesNodeVersion("v22.21.9")).toBe(false);
    expect(isSupportedHyperframesNodeVersion("v22.22.0")).toBe(true);
  });
});
