/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { I18nProvider } from "@/lib/i18n";
import { BrowserSessionHelpDialog } from "../BrowserSessionHelpDialog";

function renderWithI18n(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

describe("BrowserSessionHelpDialog", () => {
  it("opens an English help guide with usage instructions and diverse use cases", () => {
    renderWithI18n(<BrowserSessionHelpDialog />);

    fireEvent.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByText("Browser Session Help")).toBeInTheDocument();
    expect(screen.getByText(/Use Browser Session when you want AI to find websites/i)).toBeInTheDocument();
    expect(screen.getByText("Quick start")).toBeInTheDocument();
    expect(screen.getByText("How to write a strong request")).toBeInTheDocument();
    expect(screen.getByText("Diverse use cases")).toBeInTheDocument();
    expect(screen.getByText(/Travel planning: find flights, compare hotels/i)).toBeInTheDocument();
    expect(screen.getByText(/Grant or tender research: discover official sources/i)).toBeInTheDocument();
  });

  it("shows the language toggle and switches to Thai", () => {
    renderWithI18n(<BrowserSessionHelpDialog />);

    fireEvent.click(screen.getByRole("button", { name: /help/i }));

    expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ไทย" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ไทย" }));

    expect(screen.getByText("คู่มือ Browser Session")).toBeInTheDocument();
  });
});
