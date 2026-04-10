/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FinanceCounterpartyAutocomplete } from "../FinanceCounterpartyAutocomplete";

describe("FinanceCounterpartyAutocomplete", () => {
  it("deduplicates counterparties and selects a canonical name", () => {
    const onValueChange = vi.fn();

    render(
      <FinanceCounterpartyAutocomplete
        value=""
        onValueChange={onValueChange}
        items={[
          { id: 1, displayName: "ACME", aliases: ["Acme Co.", "A.C.M.E."], usageCount: 4 },
          { id: 2, displayName: "ACME", aliases: ["ACME Ltd."], usageCount: 2 },
          { id: 3, displayName: "Starbucks", aliases: ["Starbuck"] },
        ]}
        placeholder="Counterparty"
        helperText="Pick a canonical counterparty"
      />,
    );

    const input = screen.getByPlaceholderText("Counterparty");
    fireEvent.focus(input);

    expect(screen.getAllByRole("button", { name: /acme/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /starbucks/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /acme/i }));

    expect(onValueChange).toHaveBeenCalledWith("ACME");
    expect(screen.queryByText("Pick a canonical counterparty")).not.toBeInTheDocument();
  });
});
