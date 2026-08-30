// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  apply: vi.fn(),
  fetchTask: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      media: { getTask: { fetch: mocks.fetchTask } },
      verticalDramaSeries: { get: { invalidate: vi.fn() } },
    }),
    verticalDramaSeries: {
      listLogoGenerationModels: {
        useQuery: () => ({
          isLoading: false,
          data: {
            models: [
              {
                modelId: "gpt-image-2-text-to-image",
                name: "GPT Image 2",
                provider: "kie.ai",
                creditCost: 70,
              },
            ],
          },
        }),
      },
      generateSeriesLogo: {
        useMutation: () => ({ mutateAsync: mocks.generate, isPending: false }),
      },
      applyGeneratedSeriesLogo: {
        useMutation: () => ({ mutateAsync: mocks.apply, isPending: false }),
      },
    },
  },
}));

vi.mock("@/components/media/AuthenticatedMediaImage", () => ({
  AuthenticatedMediaImage: (props: Record<string, unknown>) => (
    <img {...props} />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: any) => <textarea {...props} />,
}));
vi.mock("@/components/ui/label", () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ children, value }: any) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children, ...props }: any) => (
    <span {...props}>{children}</span>
  ),
  SelectValue: () => null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogFooter: ({ children }: any) => <footer>{children}</footer>,
  DialogHeader: ({ children }: any) => <header>{children}</header>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: any) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogCancel: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  ),
  AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: any) => <footer>{children}</footer>,
  AlertDialogHeader: ({ children }: any) => <header>{children}</header>,
  AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

import { VerticalDramaLogoGenerationDialog } from "../VerticalDramaLogoGenerationDialog";

const baseProps = {
  lang: "th" as const,
  open: true,
  onOpenChange: vi.fn(),
  seriesId: "53",
  seriesTitle: "รักนี้ต้องลุ้น",
  slotId: "primary" as const,
  onApplied: vi.fn(),
};

describe("VerticalDramaLogoGenerationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue({
      id: "internal-logo-task-1",
      taskId: "provider-logo-task-1",
    });
    mocks.fetchTask.mockResolvedValue({
      id: "internal-logo-task-1",
      taskId: "provider-logo-task-1",
      status: "completed",
      resultUrl: "/api/storage/files/logo.png",
    });
    mocks.apply.mockResolvedValue({ imageUrl: "/api/storage/files/logo.png" });
  });

  it("shows the exact title prompt and requires a second confirmation before apply", async () => {
    render(<VerticalDramaLogoGenerationDialog {...baseProps} />);
    expect(screen.getByTestId("vd-logo-prompt-primary")).toHaveValue(
      "สร้าง logo แบบพื้นหลังโปร่งใส สำหรับซีรีย์แนวตั้งเรื่อง รักนี้ต้องลุ้น"
    );

    fireEvent.click(screen.getByTestId("vd-logo-generate-primary"));
    fireEvent.click(screen.getByTestId("vd-logo-generate-primary"));
    await screen.findByTestId("vd-logo-apply-primary");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt:
          "สร้าง logo แบบพื้นหลังโปร่งใส สำหรับซีรีย์แนวตั้งเรื่อง รักนี้ต้องลุ้น",
      })
    );
    expect(mocks.apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("vd-logo-apply-primary"));
    expect(
      screen.getByTestId("vd-logo-apply-confirm-primary")
    ).toBeInTheDocument();
    expect(mocks.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันใช้ภาพนี้" }));
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "internal-logo-task-1" })
    );
    expect(baseProps.onApplied).toHaveBeenCalledWith(
      "/api/storage/files/logo.png"
    );
  });

  it("builds the channel prompt only after a channel name is entered", () => {
    render(
      <VerticalDramaLogoGenerationDialog {...baseProps} slotId="secondary" />
    );
    const prompt = screen.getByTestId("vd-logo-prompt-secondary");
    expect(prompt).toHaveValue("");
    fireEvent.change(screen.getByTestId("vd-logo-channel-name"), {
      target: { value: "Smart AI Hub" },
    });
    expect(prompt).toHaveValue(
      "สร้าง logo แบบพื้นหลังโปร่งใส สำหรับชื่อช่องเฟสบุค ชื่อ  Smart AI Hub"
    );
  });
});
