/**
 * @vitest-environment jsdom
 */
import React from "react";
import { HelmetProvider } from "react-helmet-async";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ useLocation: () => ["/features"] }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: null }),
}));

import { Seo } from "../Seo";

describe("Seo without tenant defaults", () => {
  it("keeps platform public metadata when there is no tenant SEO object", async () => {
    render(
      <HelmetProvider>
        <Seo
          title="Features"
          description="Explore platform features"
          fetchTenantSeo={false}
        />
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(document.title).toBe("Features");
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute("content")
      ).toBe("Explore platform features");
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href"))
        .toBe(`${window.location.origin}/features`);
    });
  });
});
