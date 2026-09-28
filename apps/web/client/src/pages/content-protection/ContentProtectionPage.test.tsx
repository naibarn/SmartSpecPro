/**
 * @vitest-environment jsdom
 */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const routeParams = vi.hoisted(() => ({
  section: "rights",
  assetId: undefined as string | undefined,
}));
const createRightsClaimMock = vi.hoisted(() => vi.fn());
const ownershipProfileQuery = vi.hoisted(() => ({
  data: {
    displayName: "Nopporn",
    legalName: "Nopporn",
    contactEmail: "owner@example.com",
  },
  isLoading: false,
  isError: false,
  error: null,
}));

const makeQueryEndpoint = (
  query: unknown = {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  }
) => ({
  useQuery: vi.fn(() => query),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  })),
});

const makeMutationEndpoint = (
  mutation: unknown = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
  }
) => ({
  useMutation: vi.fn(() => mutation),
});

const trpcRoot = vi.hoisted(() => {
  const contentProtection = new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, property) {
        if (property === "getRights") {
          return makeQueryEndpoint({
            data: { holder: null, claims: [], documents: [], components: [] },
            isLoading: false,
            isError: false,
            error: null,
          });
        }
        if (property === "createRightsClaim") {
          return makeMutationEndpoint({
            mutate: createRightsClaimMock,
            mutateAsync: vi.fn(),
            isPending: false,
          });
        }
        return makeQueryEndpoint();
      },
    }
  );
  const users = new Proxy<Record<string, unknown>>(
    {},
    {
      get(_target, property) {
        if (property === "getOwnershipProfile") {
          return makeQueryEndpoint(ownershipProfileQuery);
        }
        return makeQueryEndpoint();
      },
    }
  );
  return {
    contentProtection,
    users,
    useUtils: () => ({
      contentProtection: {
        getRights: { invalidate: vi.fn() },
      },
    }),
  };
});

vi.mock("wouter", () => ({
  Link: ({
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => ["/content-protection/rights", vi.fn()] as const,
  useParams: () => routeParams,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlagStatus: () => ({ enabled: true, isResolved: true }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/trpc", () => ({ trpc: trpcRoot }));

vi.mock("@/services/webAssetResolver", () => ({
  WebAssetResolver: class {
    uploadAsset() {
      return { promise: Promise.resolve({ mediaAssetId: 1 }) };
    }
  },
}));

import ContentProtectionPage from "./ContentProtectionPage";

describe("ContentProtectionPage rights flow", () => {
  beforeEach(() => {
    routeParams.section = "rights";
    routeParams.assetId = undefined;
    createRightsClaimMock.mockClear();
  });

  it("uses the Settings ownership profile instead of duplicating owner fields", () => {
    render(<ContentProtectionPage />);

    expect(screen.queryByLabelText("rightsHolderName")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("contactEmail")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "saveRightsClaim" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "editOwnershipProfile" })
    ).toHaveAttribute("href", "/settings?section=profile");
  });

  it("enables and submits the asset claim after legal confirmation", () => {
    routeParams.assetId = "11111111-1111-4111-8111-111111111111";
    render(<ContentProtectionPage />);

    const saveButton = screen.getByRole("button", { name: "saveRightsClaim" });
    expect(saveButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));

    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(createRightsClaimMock).toHaveBeenCalledWith({
      assetId: routeParams.assetId,
      claimType: "creator",
      legalDeclarationConfirmed: true,
    });
  });
});
