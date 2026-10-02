/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MapContextDraft from "../MapContextDraft";

afterEach(cleanup);

describe("MapContextDraft", () => {
  it("shows the attached context for review and exposes removal", async () => {
    const onRemove = vi.fn();
    render(<MapContextDraft contextText="Public map area: 13.000, 100.000" onRemove={onRemove} />);
    expect(await screen.findByRole("region", { name: /emergency map context/i })).toBeTruthy();
    expect(screen.getByText(/will not be sent until you submit/i)).toBeTruthy();
    expect(screen.getByText("Public map area: 13.000, 100.000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /remove map context/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
