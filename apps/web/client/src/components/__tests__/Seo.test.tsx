/**
 * @vitest-environment jsdom
 */
import React from "react";
import { HelmetProvider } from "react-helmet-async";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { removePrerenderedSeoHeadMetadata, Seo } from "../Seo";

describe("Seo", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps route metadata ahead of broad remote tenant defaults", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          seo: {
            defaultTitle: "Stale platform title",
            defaultDescription: "Stale platform description",
            defaultKeywords: ["stale-keyword"],
          },
          metadata: null,
        }),
      }),
    );
    render(
      <HelmetProvider>
        <Seo
          title="Features page title"
          description="Features page description"
          keywords={["features-keyword"]}
          canonicalPath="/features"
        />
      </HelmetProvider>
    );

    await waitFor(() => {
      expect(document.title).toBe("Features page title");
      expect(document.querySelector('meta[name="description"]')?.getAttribute("content"))
        .toBe("Features page description");
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href"))
        .toBe(new URL("/features", window.location.origin).href);
    });
    expect(document.querySelector('meta[name="keywords"]')?.getAttribute("content"))
      .toBe("features-keyword");
  });

  it("removes only the no-JS prerender metadata after the client route loads", () => {
    document.head.insertAdjacentHTML(
      "beforeend",
      '<link rel="canonical" href="https://smartaihub.app/" data-seo-prerender="true"><meta property="og:url" content="https://smartaihub.app/" data-seo-prerender="true"><meta name="description" content="snapshot" data-seo-prerender="true">',
    );
    document.head.insertAdjacentHTML(
      "beforeend",
      '<link rel="canonical" href="https://smartaihub.app/features"><meta name="description" content="Features page">',
    );

    removePrerenderedSeoHeadMetadata();

    expect(document.head.querySelectorAll('[data-seo-prerender="true"]')).toHaveLength(0);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href"))
      .toBe("https://smartaihub.app/features");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content"))
      .toBe("Features page");
  });

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
