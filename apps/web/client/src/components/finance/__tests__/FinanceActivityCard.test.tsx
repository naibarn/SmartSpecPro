import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FinanceActivityCard } from "../FinanceActivityCard";

describe("FinanceActivityCard", () => {
  it("renders finance metadata and opens the finance panel", () => {
    const onOpenFinancePanel = vi.fn();

    render(
      <FinanceActivityCard
        title="OCR Draft"
        content={["Lunch with client", "Category: food"]}
        metadata={{
          finance: {
            kind: "receipt",
            title: "Receipt OCR",
            summary: "Lunch with client",
            type: "expense",
            amountMinor: 12345,
            currency: "THB",
            categoryCode: "food",
            merchantName: "Cafe",
            status: "draft",
            confidence: 0.88,
            source: "ocr_document",
            occurredAt: "2026-04-09T10:00:00.000Z",
          },
        }}
        onOpenFinancePanel={onOpenFinancePanel}
      />
    );

    expect(screen.getByText("OCR Draft")).toBeInTheDocument();
    expect(screen.getByText("Lunch with client")).toBeInTheDocument();
    expect(screen.getByText("receipt")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open finance panel/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open finance panel/i }));
    expect(onOpenFinancePanel).toHaveBeenCalledTimes(1);
  });
});
