import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ConflictResolutionDialog } from "./ConflictResolutionDialog";

// Mock useI18n
vi.mock("@/lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => {
      const translations: Record<string, string> = {
        "editor.conflict.title": "Document Conflict",
        "editor.conflict.description":
          "This document has been modified elsewhere. Choose how to proceed:",
        "editor.conflict.overwrite": "Overwrite",
        "editor.conflict.overwriteHint":
          "Save your version, discarding the other changes",
        "editor.conflict.reload": "Reload",
        "editor.conflict.reloadHint":
          "Load the latest version, discarding your unsaved changes",
      };
      return translations[key] ?? key;
    },
    dict: {},
  }),
}));

describe("ConflictResolutionDialog", () => {
  it("renders warning message when open={true}", () => {
    render(
      <ConflictResolutionDialog
        open={true}
        onOverwrite={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByText("Document Conflict")).toBeTruthy();
  });

  it("Overwrite button fires onOverwrite callback", () => {
    const onOverwrite = vi.fn();
    render(
      <ConflictResolutionDialog
        open={true}
        onOverwrite={onOverwrite}
        onReload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Overwrite"));
    expect(onOverwrite).toHaveBeenCalledOnce();
  });

  it("Reload button fires onReload callback", () => {
    const onReload = vi.fn();
    render(
      <ConflictResolutionDialog
        open={true}
        onOverwrite={vi.fn()}
        onReload={onReload}
      />,
    );
    fireEvent.click(screen.getByText("Reload"));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("dialog cannot be dismissed without choosing an option", () => {
    const onOverwrite = vi.fn();
    const onReload = vi.fn();
    render(
      <ConflictResolutionDialog
        open={true}
        onOverwrite={onOverwrite}
        onReload={onReload}
      />,
    );
    // Simulate Escape key on the dialog content
    fireEvent.keyDown(screen.getByText("Document Conflict"), {
      key: "Escape",
      code: "Escape",
    });
    // Dialog should still be visible
    expect(screen.getByText("Document Conflict")).toBeTruthy();
    expect(onOverwrite).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
  });

  it("shows document title when provided", () => {
    render(
      <ConflictResolutionDialog
        open={true}
        documentTitle="My Report"
        onOverwrite={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByText(/My Report/)).toBeTruthy();
  });

  it("is not rendered when open={false}", () => {
    render(
      <ConflictResolutionDialog
        open={false}
        onOverwrite={vi.fn()}
        onReload={vi.fn()}
      />,
    );
    expect(screen.queryByText("Document Conflict")).toBeNull();
  });
});
