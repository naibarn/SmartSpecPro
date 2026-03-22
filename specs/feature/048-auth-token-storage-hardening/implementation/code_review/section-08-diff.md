diff --git a/apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx b/apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx
new file mode 100644
index 00000000..d36493d6
--- /dev/null
+++ b/apps/web/client/src/components/settings/__tests__/UserLlmKeysPanel.test.tsx
@@ -0,0 +1,208 @@
+/**
+ * @vitest-environment jsdom
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import { render, screen, fireEvent, waitFor } from "@testing-library/react";
+
+// Hoisted mocks for tRPC and sonner
+const { mockUseQuery, mockSetKeyMutate, mockDeleteKeyMutate, mockUseUtils } =
+  vi.hoisted(() => ({
+    mockUseQuery: vi.fn(),
+    mockSetKeyMutate: vi.fn(),
+    mockDeleteKeyMutate: vi.fn(),
+    mockUseUtils: vi.fn(),
+  }));
+
+vi.mock("@/lib/trpc", () => ({
+  trpc: {
+    userApiKeys: {
+      listKeys: { useQuery: mockUseQuery },
+      setKey: {
+        useMutation: vi.fn((opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockSetKeyMutate(...args);
+            if (opts?.onSuccess) opts.onSuccess({}, args[0]);
+          },
+          isPending: false,
+        })),
+      },
+      deleteKey: {
+        useMutation: vi.fn((opts: any) => ({
+          mutate: (...args: any[]) => {
+            mockDeleteKeyMutate(...args);
+            if (opts?.onSuccess) opts.onSuccess({}, args[0]);
+          },
+          isPending: false,
+        })),
+      },
+    },
+    useUtils: mockUseUtils,
+  },
+}));
+
+vi.mock("sonner", () => ({
+  toast: {
+    success: vi.fn(),
+    error: vi.fn(),
+  },
+}));
+
+// Mock skeleton (simple div)
+vi.mock("@/components/ui/skeleton", () => ({
+  Skeleton: (props: any) => <div data-testid="skeleton" {...props} />,
+}));
+
+import { UserLlmKeysPanel } from "../UserLlmKeysPanel";
+import { toast } from "sonner";
+
+const mockInvalidate = vi.fn();
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  mockUseUtils.mockReturnValue({
+    userApiKeys: { listKeys: { invalidate: mockInvalidate } },
+  });
+  mockUseQuery.mockReturnValue({
+    data: [
+      { provider: "openai", keyHint: "abcd", configured: true },
+      { provider: "anthropic", keyHint: "wxyz", configured: true },
+    ],
+    isLoading: false,
+    isError: false,
+  });
+});
+
+describe("UserLlmKeysPanel", () => {
+  it("renders list of all 5 LLM providers", () => {
+    render(<UserLlmKeysPanel />);
+
+    expect(screen.getByText("OpenAI")).toBeDefined();
+    expect(screen.getByText("Anthropic")).toBeDefined();
+    expect(screen.getByText("DeepSeek")).toBeDefined();
+    expect(screen.getByText("Google AI")).toBeDefined();
+    expect(screen.getByText("OpenRouter")).toBeDefined();
+  });
+
+  it("displays keyHint for configured providers (e.g., '...abcd')", () => {
+    render(<UserLlmKeysPanel />);
+
+    expect(screen.getByText("...abcd")).toBeDefined();
+    expect(screen.getByText("...wxyz")).toBeDefined();
+  });
+
+  it("shows 'Not configured' for providers without keys", () => {
+    render(<UserLlmKeysPanel />);
+
+    // DeepSeek, Google AI, OpenRouter are not in the mock data
+    const badges = screen.getAllByText("Not configured");
+    expect(badges.length).toBe(3);
+  });
+
+  it("save button calls setKey mutation with provider and apiKey", () => {
+    render(<UserLlmKeysPanel />);
+
+    // Click "Add Key" for DeepSeek (unconfigured)
+    const addButtons = screen.getAllByText("Add Key");
+    fireEvent.click(addButtons[0]); // first unconfigured = DeepSeek
+
+    // Type API key into the password input
+    const input = screen.getByPlaceholderText("Paste API key");
+    fireEvent.change(input, { target: { value: "sk-deep-test1234" } });
+
+    // Click Save
+    fireEvent.click(screen.getByText("Save"));
+
+    expect(mockSetKeyMutate).toHaveBeenCalledWith({
+      provider: "deepseek",
+      apiKey: "sk-deep-test1234",
+    });
+  });
+
+  it("delete button calls deleteKey mutation with provider", () => {
+    render(<UserLlmKeysPanel />);
+
+    // The Edit buttons appear for configured providers (openai, anthropic)
+    // After Edit, the row changes to show Save/Cancel. But we want the delete
+    // button which is visible in the non-editing state.
+    // Find all buttons that are NOT Edit/Add Key - they must be delete buttons.
+    const allButtons = screen.getAllByRole("button");
+    const editButtons = screen.getAllByText("Edit");
+    const addButtons = screen.getAllByText("Add Key");
+    const knownTexts = new Set(
+      [...editButtons, ...addButtons].map((b) => b),
+    );
+    const deleteButtons = allButtons.filter(
+      (btn) => !knownTexts.has(btn) && !btn.textContent?.includes("Edit") && !btn.textContent?.includes("Add Key") && btn.textContent === "",
+    );
+
+    expect(deleteButtons.length).toBeGreaterThan(0);
+    fireEvent.click(deleteButtons[0]);
+
+    expect(mockDeleteKeyMutate).toHaveBeenCalledWith({
+      provider: "openai",
+    });
+  });
+
+  it("shows success toast after saving key", () => {
+    render(<UserLlmKeysPanel />);
+
+    // Click Add Key for DeepSeek
+    const addButtons = screen.getAllByText("Add Key");
+    fireEvent.click(addButtons[0]);
+
+    const input = screen.getByPlaceholderText("Paste API key");
+    fireEvent.change(input, { target: { value: "sk-test-abcd" } });
+    fireEvent.click(screen.getByText("Save"));
+
+    expect(toast.success).toHaveBeenCalledWith("deepseek key saved");
+  });
+
+  it("does NOT display raw API key values in the DOM", () => {
+    render(<UserLlmKeysPanel />);
+
+    // The DOM should not contain any full API key
+    const html = document.body.innerHTML;
+    expect(html).not.toContain("sk-full-key");
+    expect(html).not.toContain("apiKeyEncrypted");
+
+    // Only keyHints should appear
+    expect(html).toContain("...abcd");
+    expect(html).toContain("...wxyz");
+  });
+
+  it("input field uses type='password' to mask the key", () => {
+    render(<UserLlmKeysPanel />);
+
+    // Open editing for an unconfigured provider
+    const addButtons = screen.getAllByText("Add Key");
+    fireEvent.click(addButtons[0]);
+
+    const input = screen.getByPlaceholderText("Paste API key");
+    expect(input.getAttribute("type")).toBe("password");
+  });
+
+  it("shows loading skeletons when query is loading", () => {
+    mockUseQuery.mockReturnValue({
+      data: undefined,
+      isLoading: true,
+      isError: false,
+    });
+
+    render(<UserLlmKeysPanel />);
+
+    const skeletons = screen.getAllByTestId("skeleton");
+    expect(skeletons.length).toBeGreaterThan(0);
+  });
+
+  it("shows error message when query fails", () => {
+    mockUseQuery.mockReturnValue({
+      data: undefined,
+      isLoading: false,
+      isError: true,
+    });
+
+    render(<UserLlmKeysPanel />);
+
+    expect(screen.getByText("Failed to load API keys")).toBeDefined();
+  });
+});
