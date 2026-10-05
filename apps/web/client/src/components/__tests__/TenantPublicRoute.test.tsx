/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  location: "/features",
  tenant: null as null | { id: string; name: string; primaryDomain: string },
  tenantLoading: false,
  page: null as null | { title: string; tenantId: string; pageKey: string },
  pageLoading: false,
  requestedPageKey: "",
  requestedEnabled: true,
}));

vi.mock("wouter", () => ({ useLocation: () => [state.location, vi.fn()] }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: state.tenant, isLoading: state.tenantLoading }),
}));
vi.mock("@/hooks/useTenantPage", () => ({
  useTenantPage: (pageKey: string, options?: { enabled?: boolean }) => {
    state.requestedPageKey = pageKey;
    state.requestedEnabled = options?.enabled ?? true;
    return { page: state.page, isLoading: state.pageLoading };
  },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("../Seo", () => ({
  Seo: ({ noIndex, canonicalPath }: { noIndex?: boolean; canonicalPath?: string }) => (
    <div data-testid="tenant-route-seo" data-no-index={String(noIndex)} data-canonical={canonicalPath} />
  ),
}));
vi.mock("@/pages/TenantHomePage", () => ({
  default: ({
    page,
    canonicalPath,
    showEmergencyEntry,
  }: {
    page: { title: string };
    canonicalPath?: string;
    showEmergencyEntry?: boolean;
  }) => (
    <main data-canonical={canonicalPath} data-emergency-entry={String(showEmergencyEntry)}>
      {page.title}
    </main>
  ),
}));

import { TenantPublicRoute } from "../TenantPublicRoute";

afterEach(() => {
  cleanup();
  state.location = "/features";
  state.tenant = null;
  state.tenantLoading = false;
  state.page = null;
  state.pageLoading = false;
  state.requestedPageKey = "";
  state.requestedEnabled = true;
});

describe("TenantPublicRoute", () => {
  it("keeps the SmartAIHub-owned route on the verified platform domain", () => {
    state.tenant = { id: "platform", name: "SmartAIHub", primaryDomain: "smartaihub.app" };
    render(<TenantPublicRoute pageKey="features"><p>Global Features</p></TenantPublicRoute>);

    expect(screen.getByText("Global Features")).toBeInTheDocument();
    expect(state.requestedEnabled).toBe(false);
  });

  it("renders the exact tenant's published page instead of global fallback content", () => {
    state.tenant = { id: "tenant-1", name: "Acme", primaryDomain: "acme.example" };
    state.page = { title: "Acme Features", tenantId: "tenant-1", pageKey: "features" };
    render(<TenantPublicRoute pageKey="features"><p>Global Features</p></TenantPublicRoute>);

    expect(screen.getByText("Acme Features")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("data-canonical", "/features");
    expect(screen.getByRole("main")).toHaveAttribute("data-emergency-entry", "false");
    expect(screen.queryByText("Global Features")).toBeNull();
    expect(state.requestedEnabled).toBe(true);
  });

  it("shows a tenant-branded unpublished state and resolves dynamic page keys", () => {
    state.location = "/docs/security/best-practices?ref=nav";
    state.tenant = { id: "tenant-1", name: "Acme", primaryDomain: "acme.example" };
    render(
      <TenantPublicRoute pageKey={(path) => `docs-${path.split("?")[0].slice("/docs/".length).replace(/\//g, "-")}`}>
        <p>Global Documentation</p>
      </TenantPublicRoute>,
    );

    expect(state.requestedPageKey).toBe("docs-security-best-practices");
    expect(screen.getByRole("heading", { name: "tenantPage.unavailableTitle" })).toBeInTheDocument();
    expect(screen.getByTestId("tenant-route-seo")).toHaveAttribute("data-no-index", "true");
    expect(screen.getByTestId("tenant-route-seo")).toHaveAttribute(
      "data-canonical",
      "/docs/security/best-practices",
    );
    expect(screen.queryByText("Global Documentation")).toBeNull();
  });
});
