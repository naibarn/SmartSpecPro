/**
 * @vitest-environment jsdom
 */
import React from "react";
import { HelmetProvider } from "react-helmet-async";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({ useLocation: () => ["/"] }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: {
      name: "Tenant branding",
      seo: {
        defaultTitle: "Tenant title",
        defaultDescription: "Tenant description",
        defaultKeywords: ["tenant-keyword"],
        ogImage: "/tenant-preview.png",
      },
    },
  }),
}));

import { Seo } from "../Seo";

describe("Seo", () => {
  it("can keep tenant defaults and unapproved social imagery off a public page", async () => {
    render(
      <HelmetProvider>
        <Seo
          title="Public title"
          description="Public description"
          keywords={["public-keyword"]}
          image={null}
          canonicalPath="/"
          fetchTenantSeo={false}
          useTenantDefaults={false}
        />
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(document.title).toBe("Public title");
      expect(
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content")
      ).toBe("Public description");
    });
    expect(
      document.querySelector('meta[name="keywords"]')?.getAttribute("content")
    ).toBe("public-keyword");
    expect(
      document
        .querySelector('meta[property="og:site_name"]')
        ?.getAttribute("content")
    ).toBe("SmartAIHub");
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('meta[name="twitter:image"]')).toBeNull();
  });
});
