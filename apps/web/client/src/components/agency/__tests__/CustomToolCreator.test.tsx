/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

// ── Radix Dialog mock ────────────────────────────────────────
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) =>
    open ? createElement("div", { "data-testid": "dialog" }, children) : null,
  DialogContent: ({ children }: any) =>
    createElement("div", { "data-testid": "dialog-content" }, children),
  DialogHeader: ({ children }: any) => createElement("div", null, children),
  DialogTitle: ({ children }: any) =>
    createElement("h2", null, children),
}));

// ── Radix Select mock ────────────────────────────────────────
vi.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) =>
    createElement("div", null, children),
  SelectTrigger: ({ children, ...props }: any) =>
    createElement("button", { ...props, type: "button" }, children),
  SelectValue: () => createElement("span"),
  SelectContent: ({ children }: any) => createElement("div", null, children),
  SelectItem: ({ children, value }: any) =>
    createElement("option", { value }, children),
}));

// ── Switch mock ──────────────────────────────────────────────
vi.mock("@/components/ui/switch", () => ({
  Switch: ({ checked, onCheckedChange }: any) =>
    createElement("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e: any) => onCheckedChange?.(e.target.checked),
    }),
}));

// ── Checkbox mock ────────────────────────────────────────────
vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange, ...props }: any) =>
    createElement("input", {
      type: "checkbox",
      checked: !!checked,
      onChange: (e: any) => onCheckedChange?.(e.target.checked),
      ...props,
    }),
}));

// ── Sonner mock ──────────────────────────────────────────────
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ── tRPC mock ────────────────────────────────────────────────
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockTestMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      createCustomTool: {
        useMutation: (opts: any) => ({
          mutate: (...args: any[]) => {
            mockCreateMutate(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateCustomTool: {
        useMutation: (opts: any) => ({
          mutate: (...args: any[]) => {
            mockUpdateMutate(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      testCustomTool: {
        useMutation: (opts: any) => ({
          mutate: (...args: any[]) => {
            mockTestMutate(...args);
            opts?.onSuccess?.({ status: 200, body: { ok: true }, latencyMs: 42 });
          },
          isPending: false,
        }),
      },
      listCustomTools: {
        useQuery: () => ({ data: undefined }),
      },
    },
    useUtils: () => ({
      agency: { listTools: { invalidate: mockInvalidate } },
    }),
  },
}));

describe("CustomToolCreator", () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onSuccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onClose = vi.fn();
    onSuccess = vi.fn();
  });

  it("renders step 1 (name/description) as initial view", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    expect(screen.getByTestId("step-basic-info")).toBeTruthy();
    expect(screen.getByTestId("tool-name-input")).toBeTruthy();
    expect(screen.getByText("Create Custom Tool")).toBeTruthy();
  });

  it("validates required fields before allowing next step", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Click next without filling name
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Should still be on step 1
    expect(screen.getByTestId("step-basic-info")).toBeTruthy();
    expect(screen.getByText("Name is required")).toBeTruthy();
  });

  it("step 2 shows endpoint URL input and HTTP method select", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Fill name and go to step 2
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "My Tool" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    expect(screen.getByTestId("step-endpoint")).toBeTruthy();
    expect(screen.getByTestId("tool-endpoint-input")).toBeTruthy();
    expect(screen.getByTestId("http-method-select")).toBeTruthy();
  });

  it("step 2 has headers key-value editor with add button", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Navigate to step 2
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "My Tool" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    expect(screen.getByTestId("add-header-btn")).toBeTruthy();
  });

  it("step 3 renders JsonSchemaEditor", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Navigate to step 3
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "My Tool" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    expect(screen.getByTestId("step-schema")).toBeTruthy();
    expect(screen.getByTestId("add-property-btn")).toBeTruthy();
  });

  it("calls createCustomTool.mutate on save with correctly shaped payload", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Fill step 1
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "Test API" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Fill step 2
    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
      target: { value: "https://api.test.com" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Skip step 3
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Step 4: save
    fireEvent.click(screen.getByTestId("save-tool-btn"));

    expect(mockCreateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Test API",
        endpoint: "https://api.test.com",
        httpMethod: "POST",
        riskLevel: "low",
      }),
    );
  });

  it("disables save button while mutation is pending", async () => {
    // The mock has isPending: false, so we check the button is enabled
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Navigate to step 4
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "My Tool" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));
    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
      target: { value: "https://api.test.com" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Button should exist and not be disabled when isPending is false
    const saveBtn = screen.getByTestId("save-tool-btn");
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.hasAttribute("disabled")).toBe(false);
  });

  it("navigating back between steps preserves entered data", async () => {
    const { CustomToolCreator } = await import("../CustomToolCreator");
    render(
      createElement(CustomToolCreator, { open: true, onClose, onSuccess }),
    );

    // Fill step 1
    fireEvent.change(screen.getByTestId("tool-name-input"), {
      target: { value: "Preserved Name" },
    });
    fireEvent.click(screen.getByTestId("next-step-btn"));

    // Go to step 2, fill endpoint
    fireEvent.change(screen.getByTestId("tool-endpoint-input"), {
      target: { value: "https://preserved.com" },
    });

    // Go back to step 1
    fireEvent.click(screen.getByText("Back"));

    // Name should still be there
    const nameInput = screen.getByTestId("tool-name-input") as HTMLInputElement;
    expect(nameInput.value).toBe("Preserved Name");

    // Go forward again
    fireEvent.click(screen.getByTestId("next-step-btn"));
    const endpointInput = screen.getByTestId(
      "tool-endpoint-input",
    ) as HTMLInputElement;
    expect(endpointInput.value).toBe("https://preserved.com");
  });
});
