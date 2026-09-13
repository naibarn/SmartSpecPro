/** @vitest-environment jsdom */
/**
 * The start-mode chooser is intentionally tested with the Dialog primitives
 * flattened, matching the existing Vertical Drama dialog tests. This keeps
 * the test focused on the user-visible mode contract rather than Radix portal
 * animation internals.
 */
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? createElement("div", { role: "dialog" }, children) : null,
  DialogContent: ({ children, ...rest }: any) =>
    createElement("div", rest, children),
  DialogDescription: ({ children }: any) => createElement("p", null, children),
  DialogFooter: ({ children }: any) => createElement("footer", null, children),
  DialogHeader: ({ children }: any) => createElement("header", null, children),
  DialogTitle: ({ children }: any) => createElement("h2", null, children),
}));

import { SpecialTieInStartModeDialog } from "../SpecialTieInStartModeDialog";

describe("SpecialTieInStartModeDialog", () => {
  it("clearly offers fresh and resume modes", () => {
    render(
      <SpecialTieInStartModeDialog
        lang="th"
        open
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />
    );

    expect(
      screen.getByTestId("vd-special-tie-in-start-dialog")
    ).toBeInTheDocument();
    expect(screen.getByTestId("vd-special-tie-in-fresh")).toHaveTextContent(
      "สร้างตอนใหม่"
    );
    expect(screen.getByTestId("vd-special-tie-in-fresh")).toHaveTextContent(
      "ไม่โหลดงานก่อนหน้ามาปะปน"
    );
    expect(screen.getByTestId("vd-special-tie-in-resume")).toHaveTextContent(
      "โหลดงานเดิม"
    );
  });

  it("returns the selected mode without silently opening either path", () => {
    const onSelect = vi.fn();
    render(
      <SpecialTieInStartModeDialog
        lang="th"
        open
        onOpenChange={vi.fn()}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByTestId("vd-special-tie-in-fresh"));
    expect(onSelect).toHaveBeenCalledWith("fresh");

    fireEvent.click(screen.getByTestId("vd-special-tie-in-resume"));
    expect(onSelect).toHaveBeenCalledWith("resume");
  });
});
