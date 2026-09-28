// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LegalDocumentPage } from "./LegalDocumentPage";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ locale: "th" }),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav aria-label="mock navigation" />,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer />,
}));

vi.mock("@/components/Seo", () => ({
  Seo: () => null,
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: "div",
    footer: "footer",
    header: "header",
    nav: "nav",
    section: "section",
  },
}));

describe("LegalDocumentPage", () => {
  it("renders Thai legal copy when the selected locale is Thai", () => {
    render(<LegalDocumentPage kind="privacy" />);

    expect(
      screen.getByRole("heading", { name: "นโยบายความเป็นส่วนตัว", level: 1 })
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Smart AI Hub Team", { exact: false }).length
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: "ข้อกำหนดการให้บริการ" })
    ).toHaveAttribute("href", "/terms");
  });
});
