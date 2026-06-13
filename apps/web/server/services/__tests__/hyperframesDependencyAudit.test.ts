import { describe, expect, it } from "vitest";

import {
  isSupportedHyperframesNodeVersion,
  isSupportedOfficialHyperframesNodeVersion,
  runHyperframesDependencyAudit,
  runHyperframesDoctorCheck,
} from "../hyperframesDependencyAudit";

describe("hyperframesDependencyAudit", () => {
  it("pins official HyperFrames packages while keeping tenant rollout gated", () => {
    const audit = runHyperframesDependencyAudit();

    expect(audit.packageInstallDeferred).toBe(false);
    expect(audit.packageNames).toEqual([
      "hyperframes@0.6.95",
      "@hyperframes/producer@0.6.95",
    ]);
    expect(audit.mainBundleExcluded).toBe(true);
    expect(audit.gate).toBe("pass");
    expect(audit.notes.join(" ")).toContain("Diagnostic fallback");
  });

  it("doctor reports runtime checks without printing secrets", () => {
    const doctor = runHyperframesDoctorCheck();

    expect(doctor.node.version).toBe(process.version);
    expect(doctor.node.requirement).toBe(">=20.20.0 <21 || >=22.22.0");
    expect(doctor.node.ok).toBe(isSupportedHyperframesNodeVersion(process.version));
    expect(doctor.officialHyperframesNode.ok).toBe(
      isSupportedOfficialHyperframesNodeVersion(process.version)
    );
    expect(doctor.hyperframesRuntime.cliPackage).toBe("hyperframes@0.6.95");
    expect(doctor.hyperframesRuntime.producerPackage).toBe("@hyperframes/producer@0.6.95");
    expect(doctor.localSmokeRenderer.renderer).toBe(
      "diagnostic_ffmpeg_smoke"
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
    expect(isSupportedHyperframesNodeVersion("v24.13.0")).toBe(true);
  });
});
