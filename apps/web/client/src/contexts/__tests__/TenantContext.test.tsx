/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantProvider, useTenant } from "../TenantContext";

function TenantName() {
  const { tenant } = useTenant();
  return <p>{tenant?.name ?? "No tenant"}</p>;
}

describe("TenantProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps public pages alive when a tenant response has no SEO settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tenant: {
            id: 7,
            slug: "example",
            name: "Example Tenant",
            primaryDomain: "example.test",
            theme: {
              primaryColor: "#2563eb",
              secondaryColor: "#06b6d4",
              accentColor: "#14b8a6",
              backgroundColor: "#ffffff",
              textColor: "#0f172a",
              fontFamily: "Inter, system-ui, sans-serif",
              headingFont: "Inter, system-ui, sans-serif",
              layout: "modern",
              headerStyle: "blur",
              footerStyle: "detailed",
              buttonStyle: "rounded",
              cardStyle: "elevated",
            },
          },
        }),
      })
    );

    render(
      <TenantProvider>
        <TenantName />
      </TenantProvider>
    );

    expect(await screen.findByText("Example Tenant")).toBeTruthy();
    await waitFor(() => expect(document.title).toBe("Example Tenant"));
  });
});
