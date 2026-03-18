/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Hoisted mocks for tRPC and sonner
const {
  mockUseQuery,
  mockSetKeyMutate,
  mockDeleteKeyMutate,
  mockUseUtils,
  mockSetKeyUseMutation,
  mockDeleteKeyUseMutation,
} = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockSetKeyMutate: vi.fn(),
  mockDeleteKeyMutate: vi.fn(),
  mockUseUtils: vi.fn(),
  mockSetKeyUseMutation: vi.fn(),
  mockDeleteKeyUseMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    userApiKeys: {
      listKeys: { useQuery: mockUseQuery },
      setKey: { useMutation: mockSetKeyUseMutation },
      deleteKey: { useMutation: mockDeleteKeyUseMutation },
    },
    useUtils: mockUseUtils,
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock skeleton (simple div)
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
}));

import { UserLlmKeysPanel } from "../UserLlmKeysPanel";
import { toast } from "sonner";

const mockInvalidate = vi.fn();

function setupMutationMocks(overrides?: {
  setKeyError?: Error;
  deleteKeyError?: Error;
}) {
  mockSetKeyUseMutation.mockImplementation((opts: any) => ({
    mutate: (...args: any[]) => {
      mockSetKeyMutate(...args);
      if (overrides?.setKeyError) {
        opts?.onError?.(overrides.setKeyError);
      } else {
        opts?.onSuccess?.({}, args[0]);
      }
    },
    isPending: false,
  }));

  mockDeleteKeyUseMutation.mockImplementation((opts: any) => ({
    mutate: (...args: any[]) => {
      mockDeleteKeyMutate(...args);
      if (overrides?.deleteKeyError) {
        opts?.onError?.(overrides.deleteKeyError);
      } else {
        opts?.onSuccess?.({}, args[0]);
      }
    },
    isPending: false,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseUtils.mockReturnValue({
    userApiKeys: { listKeys: { invalidate: mockInvalidate } },
  });
  mockUseQuery.mockReturnValue({
    data: [
      { provider: "openai", keyHint: "abcd", configured: true },
      { provider: "anthropic", keyHint: "wxyz", configured: true },
    ],
    isLoading: false,
    isError: false,
  });
  setupMutationMocks();
});

describe("UserLlmKeysPanel", () => {
  it("renders list of all 5 LLM providers", () => {
    render(<UserLlmKeysPanel />);

    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("Anthropic")).toBeDefined();
    expect(screen.getByText("DeepSeek")).toBeDefined();
    expect(screen.getByText("Google AI")).toBeDefined();
    expect(screen.getByText("OpenRouter")).toBeDefined();
  });

  it("displays keyHint for configured providers (e.g., '...abcd')", () => {
    render(<UserLlmKeysPanel />);

    expect(screen.getByText("...abcd")).toBeDefined();
    expect(screen.getByText("...wxyz")).toBeDefined();
  });

  it("shows 'Not configured' for providers without keys", () => {
    render(<UserLlmKeysPanel />);

    // DeepSeek, Google AI, OpenRouter are not in the mock data
    const badges = screen.getAllByText("Not configured");
    expect(badges.length).toBe(3);
  });

  it("save button calls setKey mutation with provider and apiKey, then invalidates cache", () => {
    render(<UserLlmKeysPanel />);

    // Click "Add Key" for DeepSeek (unconfigured)
    const addButtons = screen.getAllByText("Add Key");
    fireEvent.click(addButtons[0]); // first unconfigured = DeepSeek

    // Type API key into the password input
    const input = screen.getByPlaceholderText("Paste API key");
    fireEvent.change(input, { target: { value: "sk-deep-test1234" } });

    // Click Save
    fireEvent.click(screen.getByText("Save"));

    expect(mockSetKeyMutate).toHaveBeenCalledWith({
      provider: "deepseek",
      apiKey: "sk-deep-test1234",
    });
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("delete button calls deleteKey mutation with provider after confirmation, then invalidates cache", () => {
    render(<UserLlmKeysPanel />);

    // Icon-only buttons have empty textContent — these are the delete buttons
    const allButtons = screen.getAllByRole("button");
    const deleteButtons = allButtons.filter(
      (btn) => btn.textContent === "",
    );

    expect(deleteButtons.length).toBeGreaterThan(0);
    fireEvent.click(deleteButtons[0]);

    // Confirm the deletion via AlertDialog
    const confirmBtn = screen.getByText("Delete Key");
    fireEvent.click(confirmBtn);

    expect(mockDeleteKeyMutate).toHaveBeenCalledWith({
      provider: "openai",
    });
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("shows success toast after saving key", () => {
    render(<UserLlmKeysPanel />);

    // Click Add Key for DeepSeek
    const addButtons = screen.getAllByText("Add Key");
    fireEvent.click(addButtons[0]);

    const input = screen.getByPlaceholderText("Paste API key");
    fireEvent.change(input, { target: { value: "sk-test-abcd" } });
    fireEvent.click(screen.getByText("Save"));

    expect(toast.success).toHaveBeenCalledWith("deepseek key saved");
  });

  it("shows error toast when setKey mutation fails", () => {
    setupMutationMocks({
      setKeyError: new Error("Rate limit exceeded"),
    });

    render(<UserLlmKeysPanel />);

    const addButtons = screen.getAllByText("Add Key");
    fireEvent.click(addButtons[0]);

    const input = screen.getByPlaceholderText("Paste API key");
    fireEvent.change(input, { target: { value: "sk-test-fail" } });
    fireEvent.click(screen.getByText("Save"));

    expect(toast.error).toHaveBeenCalledWith("Failed to save key");
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("shows error toast when deleteKey mutation fails", () => {
    setupMutationMocks({
      deleteKeyError: new Error("Server error"),
    });

    render(<UserLlmKeysPanel />);

    // Click the icon-only delete button to open confirmation dialog
    const allButtons = screen.getAllByRole("button");
    const deleteButtons = allButtons.filter(
      (btn) => btn.textContent === "",
    );
    fireEvent.click(deleteButtons[0]);

    // Click the confirm "Delete Key" button in the AlertDialog
    const confirmBtn = screen.getByText("Delete Key");
    fireEvent.click(confirmBtn);

    expect(toast.error).toHaveBeenCalledWith("Failed to delete key");
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("does NOT display raw API key values in the DOM — only keyHint shown", () => {
    // Inject extra fields that should NEVER appear in rendered output
    mockUseQuery.mockReturnValue({
      data: [
        {
          provider: "openai",
          keyHint: "abcd",
          configured: true,
          apiKeyEncrypted: "iv:tag:sk-proj-SECRETVALUE1234",
        },
        {
          provider: "anthropic",
          keyHint: "wxyz",
          configured: true,
          apiKeyEncrypted: "iv:tag:sk-ant-TOPSECRETKEY5678",
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<UserLlmKeysPanel />);

    const html = document.body.innerHTML;

    // These secret values must NOT appear anywhere in the DOM
    expect(html).not.toContain("sk-proj-SECRETVALUE1234");
    expect(html).not.toContain("sk-ant-TOPSECRETKEY5678");
    expect(html).not.toContain("apiKeyEncrypted");

    // Only the keyHints should be visible
    expect(html).toContain("...abcd");
    expect(html).toContain("...wxyz");
  });

  it("input field uses type='password' to mask the key", () => {
    render(<UserLlmKeysPanel />);

    // Open editing for an unconfigured provider
    const addButtons = screen.getAllByText("Add Key");
    fireEvent.click(addButtons[0]);

    const input = screen.getByPlaceholderText("Paste API key");
    expect(input.getAttribute("type")).toBe("password");
  });

  it("shows loading skeletons when query is loading", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<UserLlmKeysPanel />);

    const skeletons = screen.getAllByTestId("skeleton");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows error message when query fails", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<UserLlmKeysPanel />);

    expect(screen.getByText("Failed to load API keys")).toBeDefined();
  });
});
