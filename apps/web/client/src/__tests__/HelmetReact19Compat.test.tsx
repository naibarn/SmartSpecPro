// @vitest-environment jsdom

import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Helmet, HelmetProvider } from "react-helmet-async";

describe("react-helmet-async React 19 compatibility", () => {
  afterEach(() => {
    cleanup();
    document.head.replaceChildren();
    document.title = "";
  });

  it("keeps Helmet metadata and JSON-LD in the document head", () => {
    const structuredData = { "@context": "https://schema.org", "@type": "WebSite", name: "SmartAIHub" };

    render(
      <HelmetProvider>
        <Helmet>
          <title>SmartAIHub SEO Compatibility</title>
          <meta name="description" content="React 19 metadata compatibility" />
          <link rel="canonical" href="https://smartaihub.app/compat" />
          <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
        </Helmet>
      </HelmetProvider>,
    );

    expect(document.title).toBe("SmartAIHub SEO Compatibility");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "React 19 metadata compatibility",
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://smartaihub.app/compat",
    );
    expect(document.querySelector('script[type="application/ld+json"]')?.textContent).toBe(
      JSON.stringify(structuredData),
    );
  });
});
