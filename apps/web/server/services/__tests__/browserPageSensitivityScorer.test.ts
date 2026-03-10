import { describe, expect, it } from "vitest";

import { scoreBrowserPageSensitivity } from "../browserPageSensitivityScorer";

describe("browser page sensitivity scorer", () => {
  it("prioritizes admin surfaces over other signals", () => {
    expect(
      scoreBrowserPageSensitivity({
        isAdminPage: true,
        isFinancialPage: true,
      }),
    ).toEqual({
      pageSensitivity: "admin",
      riskScore: 95,
      reasonCodes: ["admin_surface"],
    });
  });

  it("marks restricted data as sensitive", () => {
    expect(
      scoreBrowserPageSensitivity({
        dataClasses: ["Public", "Restricted"],
      }),
    ).toEqual({
      pageSensitivity: "sensitive_data",
      riskScore: 82,
      reasonCodes: ["sensitive_data"],
    });
  });

  it("carries the cross-site iframe reason code", () => {
    expect(
      scoreBrowserPageSensitivity({
        iframeTrustTier: "cross_site",
      }),
    ).toEqual({
      pageSensitivity: "none",
      riskScore: 20,
      reasonCodes: ["cross_site_iframe"],
    });
  });
});
