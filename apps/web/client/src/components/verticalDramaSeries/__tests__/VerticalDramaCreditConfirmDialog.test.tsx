import { createElement, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? createElement("div", null, children) : null,
  AlertDialogContent: ({ children, ...props }: { children: ReactNode }) =>
    createElement("div", props, children),
  AlertDialogDescription: ({ children }: { children: ReactNode }) =>
    createElement("p", null, children),
  AlertDialogFooter: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  AlertDialogHeader: ({ children }: { children: ReactNode }) =>
    createElement("div", null, children),
  AlertDialogTitle: ({ children }: { children: ReactNode }) =>
    createElement("h2", null, children),
  AlertDialogAction: ({ children, onClick, ...props }: any) =>
    createElement("button", { type: "button", onClick, ...props }, children),
  AlertDialogCancel: ({ children, ...props }: any) =>
    createElement("button", { type: "button", ...props }, children),
}));

import {
  useVerticalDramaCreditConfirmation,
} from "@/components/verticalDramaSeries/VerticalDramaCreditConfirmDialog";

function Harness({ action }: { action: () => void }) {
  const { requestConfirmation, creditConfirmDialog } =
    useVerticalDramaCreditConfirmation();
  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () =>
          requestConfirmation({
            title: "ยืนยัน",
            description: "ใช้เครดิต",
            confirmLabel: "ทำต่อ",
            cancelLabel: "ยกเลิก",
            testId: "credit-confirm-test",
            onConfirm: action,
          }),
      },
      "เปิด dialog",
    ),
    creditConfirmDialog,
  );
}

describe("VerticalDramaCreditConfirmDialog", () => {
  it("does not run the paid action until confirm and consumes a repeated confirm only once", () => {
    const action = vi.fn();
    render(createElement(Harness, { action }));

    fireEvent.click(screen.getByRole("button", { name: "เปิด dialog" }));
    expect(action).not.toHaveBeenCalled();

    const confirm = screen.getByTestId("credit-confirm-test-confirm");
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("does not run the paid action when canceled", () => {
    const action = vi.fn();
    render(createElement(Harness, { action }));

    fireEvent.click(screen.getByRole("button", { name: "เปิด dialog" }));
    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));
    expect(action).not.toHaveBeenCalled();
  });
});
