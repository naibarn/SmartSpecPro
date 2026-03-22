import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OpenAPIImportModal } from "./OpenAPIImportModal";

// Mock trpc
const mockImportMutate = vi.fn();
const mockConfirmMutate = vi.fn();
let mockImportOnSuccess: Function;
let mockImportOnError: Function;
let mockConfirmOnSuccess: Function;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      importOpenAPITools: {
        useMutation: (opts: any) => {
          mockImportOnSuccess = opts?.onSuccess;
          mockImportOnError = opts?.onError;
          return {
            mutate: mockImportMutate,
            isPending: false,
          };
        },
      },
      confirmOpenAPIImport: {
        useMutation: (opts: any) => {
          mockConfirmOnSuccess = opts?.onSuccess;
          return {
            mutate: mockConfirmMutate,
            isPending: false,
          };
        },
      },
    },
  },
}));

const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: (...args: any[]) => mockToastError(...args),
  },
}));

describe("OpenAPIImportModal", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onImportComplete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders upload/paste area when opened", () => {
    render(<OpenAPIImportModal {...defaultProps} />);
    expect(screen.getByTestId("spec-content-input")).toBeInTheDocument();
    expect(screen.getByTestId("parse-btn")).toBeInTheDocument();
  });

  it("shows preview table after successful parse", async () => {
    render(<OpenAPIImportModal {...defaultProps} />);

    const textarea = screen.getByTestId("spec-content-input");
    fireEvent.change(textarea, { target: { value: '{"openapi":"3.0"}' } });

    fireEvent.click(screen.getByTestId("parse-btn"));
    expect(mockImportMutate).toHaveBeenCalled();

    mockImportOnSuccess({
      previews: [
        { name: "listPets", description: "List", httpMethod: "GET", path: "/pets", inputSchema: {} },
        { name: "createPet", description: "Create", httpMethod: "POST", path: "/pets", inputSchema: {} },
        { name: "getPet", description: "Get", httpMethod: "GET", path: "/pets/{id}", inputSchema: {} },
      ],
      baseUrl: "https://api.example.com",
    });

    await waitFor(() => {
      expect(screen.getByTestId("preview-row-0")).toBeInTheDocument();
      expect(screen.getByTestId("preview-row-1")).toBeInTheDocument();
      expect(screen.getByTestId("preview-row-2")).toBeInTheDocument();
    });
  });

  it("disables confirm button when no tools selected", async () => {
    render(<OpenAPIImportModal {...defaultProps} />);

    const textarea = screen.getByTestId("spec-content-input");
    fireEvent.change(textarea, { target: { value: '{"openapi":"3.0"}' } });
    fireEvent.click(screen.getByTestId("parse-btn"));

    mockImportOnSuccess({
      previews: [
        { name: "listPets", description: "List", httpMethod: "GET", path: "/pets", inputSchema: {} },
      ],
      baseUrl: "https://api.example.com",
    });

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-all-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-import-btn")).toBeDisabled();
    });
  });

  it("shows error toast on parse failure", () => {
    render(<OpenAPIImportModal {...defaultProps} />);

    const textarea = screen.getByTestId("spec-content-input");
    fireEvent.change(textarea, { target: { value: "invalid spec" } });
    fireEvent.click(screen.getByTestId("parse-btn"));

    // Simulate error callback
    mockImportOnError({ message: "Failed to parse spec: invalid JSON" });

    expect(mockToastError).toHaveBeenCalledWith("Failed to parse spec: invalid JSON");
  });

  it("calls confirmOpenAPIImport with selected tool IDs on confirm", async () => {
    render(<OpenAPIImportModal {...defaultProps} />);

    const textarea = screen.getByTestId("spec-content-input");
    fireEvent.change(textarea, { target: { value: '{"openapi":"3.0"}' } });
    fireEvent.click(screen.getByTestId("parse-btn"));

    mockImportOnSuccess({
      previews: [
        { name: "listPets", description: "List", httpMethod: "GET", path: "/pets", inputSchema: {} },
        { name: "createPet", description: "Create", httpMethod: "POST", path: "/pets", inputSchema: {} },
        { name: "getPet", description: "Get", httpMethod: "GET", path: "/pets/{id}", inputSchema: {} },
      ],
      baseUrl: "https://api.example.com",
    });

    await waitFor(() => {
      expect(screen.getByTestId("preview-row-0")).toBeInTheDocument();
    });

    // Deselect the third tool
    fireEvent.click(screen.getByTestId("preview-checkbox-2"));

    fireEvent.click(screen.getByTestId("confirm-import-btn"));

    expect(mockConfirmMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedTools: expect.arrayContaining([
          expect.objectContaining({ name: "listPets" }),
          expect.objectContaining({ name: "createPet" }),
        ]),
        baseUrl: "https://api.example.com",
      }),
    );
    expect(mockConfirmMutate.mock.calls[0][0].selectedTools).toHaveLength(2);
  });

  it("shows base URL override input field", () => {
    render(<OpenAPIImportModal {...defaultProps} />);
    expect(screen.getByTestId("base-url-input")).toBeInTheDocument();
  });

  it("shows API key input field (password type)", () => {
    render(<OpenAPIImportModal {...defaultProps} />);
    const apiKeyInput = screen.getByTestId("api-key-input");
    expect(apiKeyInput).toBeInTheDocument();
    expect(apiKeyInput).toHaveAttribute("type", "password");
  });
});
