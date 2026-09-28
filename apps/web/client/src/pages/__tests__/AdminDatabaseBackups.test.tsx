import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AdminDatabaseBackups from "../AdminDatabaseBackups";

const createMutate = vi.fn();
const invalidate = vi.fn();
const refetch = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/database-backups", vi.fn()],
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    databaseBackups: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          isError: false,
          isFetching: false,
          refetch,
        }),
      },
      create: {
        useMutation: () => ({ mutate: createMutate, isPending: false }),
      },
    },
    useUtils: () => ({ databaseBackups: { list: { invalidate } } }),
  },
}));

describe("AdminDatabaseBackups", () => {
  it("shows the empty state and submits a safe backup", () => {
    render(<AdminDatabaseBackups />);
    expect(screen.getByText("admin.databaseBackups.empty")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "admin.databaseBackups.createButton" })
    );
    expect(createMutate).toHaveBeenCalledWith({
      mode: "safe",
      confirmedFullExport: false,
    });
  });

  it("requires confirmation before submitting a full backup", () => {
    render(<AdminDatabaseBackups />);
    fireEvent.click(
      screen.getByRole("radio", { name: /admin\.databaseBackups\.fullMode/i })
    );
    expect(
      screen.getByRole("button", { name: "admin.databaseBackups.createButton" })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(
      screen.getByRole("button", { name: "admin.databaseBackups.createButton" })
    ).not.toBeDisabled();
  });
});
