import { describe, expect, it } from "vitest";

import { evaluateBrowserIncidentControls } from "../browserIncidentControls";

describe("browser incident controls", () => {
  it("fails closed when a global, tenant, or workflow kill switch is active", () => {
    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://app.example.com",
        pageSensitivity: "none",
        globalKillSwitchEnabled: true,
        tenantKillSwitchEnabled: false,
        workflowEnabled: true,
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "global_kill_switch",
    });

    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://app.example.com",
        pageSensitivity: "none",
        globalKillSwitchEnabled: false,
        tenantKillSwitchEnabled: true,
        workflowEnabled: true,
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "tenant_kill_switch",
    });

    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://app.example.com",
        pageSensitivity: "none",
        globalKillSwitchEnabled: false,
        tenantKillSwitchEnabled: false,
        workflowEnabled: false,
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "workflow_disabled",
    });
  });

  it("lets emergency domain and category overrides supersede normal allowance", () => {
    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://danger.example.com",
        pageSensitivity: "none",
        workflowEnabled: true,
        emergencyDeniedDomains: ["danger.example.com"],
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "emergency_domain_override",
    });

    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://app.example.com",
        pageSensitivity: "admin",
        workflowEnabled: true,
        emergencyDeniedPageSensitivities: ["admin"],
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "emergency_category_override",
    });
  });

  it("fails closed when a browser approval is revoked before dispatch", () => {
    expect(
      evaluateBrowserIncidentControls({
        targetOrigin: "https://app.example.com",
        pageSensitivity: "none",
        workflowEnabled: true,
        approvalRevoked: true,
      }),
    ).toEqual({
      allowed: false,
      reasonCode: "approval_revoked",
    });
  });
});
