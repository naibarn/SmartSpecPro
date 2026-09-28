/**
 * @vitest-environment jsdom
 *
 * Feature 135 follow-up — Admin Media Models "Generation Route" picker only
 * exposed `gateway_api` / `mcp`, so a seeded `hermes_worker` row rendered a
 * BLANK route field on Edit (no matching SelectItem for its real transport)
 * and, because the picker's `onValueChange` was typed to the 2-arm union,
 * touching it (or any future wiring that saves the picker's value) would
 * silently coerce the row's `configJson.transport` back to `gateway_api` on
 * Save — corrupting a hermes row into a gateway one.
 *
 * These tests reproduce both hazards against the real page component (real
 * Dialog/Table/Badge, mocked Select + trpc + auth), then pin the fix.
 */
import { Children, Fragment, createElement } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdateMutate = vi.fn();

const hermesModel = {
  id: 501,
  modelId: "hermes-grok/grok-imagine-image",
  name: "Grok Imagine (Grok via Hermes)",
  description: "xAI Grok Imagine via Hermes",
  modelType: "image" as const,
  provider: "hermes-grok",
  aliases: ["hermes grok imagine"],
  creditCost: 0,
  aspectRatios: ["9:16", "16:9", "1:1"],
  sizes: null,
  durations: null,
  voices: null,
  configJson: {
    transport: "hermes_worker",
    hermes: {
      providerType: "xai_grok",
      providerModelId: "grok-imagine-image",
      operationDefaults: { aspectRatios: ["9:16", "16:9", "1:1"] },
    },
    generateType: "text-to-image",
    supportsReferenceImages: true,
    referenceImageLimit: 3,
    aspectRatios: ["9:16", "16:9", "1:1"],
    inputFields: [],
    pricing: {
      formula: "provider_account",
      defaultCredits: 0,
      note: "Uses the connected Grok subscription.",
    },
  },
  isEnabled: false,
  providerReady: true,
  priority: 90,
  sortOrder: 290,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const gatewayModel = {
  ...hermesModel,
  id: 502,
  modelId: "grok-imagine/text-to-image",
  name: "Grok Imagine",
  provider: "kie.ai",
  configJson: {
    transport: "gateway_api",
    providerModelId: "grok-imagine",
    apiEndpoint: "/api/v1/jobs/createTask",
    apiPayloadFormat: "market",
  },
  isEnabled: true,
};

function makeQuery(data: any) {
  return { data, isLoading: false, refetch: vi.fn() };
}
function makeMutation(mutate = vi.fn()) {
  return { mutate, mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
}

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ isLoading: false, user: { id: 1, role: "admin" } }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/media-models", vi.fn()],
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => null,
}));

// Same mock convention used elsewhere (e.g. VerticalDramaSettingsTab tests):
// a native <select> driven by `value`/`onValueChange`, with `disabled` passed
// straight through so tests can assert the route picker is actually inert.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => {
    let testId = "mock-select";
    Children.forEach(children, (child: any) => {
      if (child?.props?.["data-testid"]) testId = child.props["data-testid"];
    });
    return createElement(
      "select",
      {
        "data-testid": testId,
        value,
        disabled,
        onChange: (e: any) => onValueChange?.(e.target.value),
      },
      children,
    );
  },
  SelectTrigger: ({ children }: any) => createElement(Fragment, null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: any) =>
    createElement(Fragment, null, children),
  SelectItem: ({ value, children }: any) =>
    createElement("option", { value }, children),
}));

let modelsData = [hermesModel];

vi.mock("@/lib/trpc", () => {
  const genericHandlers = {
    get: (target: any, prop: string) => {
      if (prop in target) return target[prop];
      return {
        useQuery: () => makeQuery(undefined),
        useMutation: () => makeMutation(),
      };
    },
  };
  return {
    trpc: {
      mediaModels: new Proxy(
        {
          adminList: { useQuery: () => makeQuery(modelsData) },
          adminTemplates: { useQuery: () => makeQuery([]) },
          stats: { useQuery: () => makeQuery(undefined) },
          runtimeCounters: { useQuery: () => makeQuery(undefined) },
          update: { useMutation: () => makeMutation(mockUpdateMutate) },
          create: { useMutation: () => makeMutation() },
          delete: { useMutation: () => makeMutation() },
          toggleEnabled: { useMutation: () => makeMutation() },
          disableUnavailable: { useMutation: () => makeMutation() },
          resetRuntimeCounters: { useMutation: () => makeMutation() },
          previewFieldOptions: { useMutation: () => makeMutation() },
          importTemplate: { useMutation: () => makeMutation() },
        },
        genericHandlers,
      ),
      useUtils: () => ({
        mediaModels: new Proxy(
          {},
          { get: () => ({ invalidate: vi.fn() }) },
        ),
      }),
    },
  };
});

import AdminMediaModels from "../AdminMediaModels";

beforeEach(() => {
  vi.clearAllMocks();
  modelsData = [hermesModel];
});

describe("AdminMediaModels — hermes_worker Generation Route (Feature 135 hazard fix)", () => {
  it("shows the real transport for a hermes_worker row instead of a blank Generation Route field", async () => {
    render(<AdminMediaModels />);

    fireEvent.click(screen.getAllByTitle("Edit")[0]);

    const select = (await screen.findByTestId(
      "transport",
    )) as HTMLSelectElement;
    // Before the fix there was no <option value="hermes_worker">, so a
    // native <select> silently falls back to value="" (selectedIndex -1) —
    // the on-disk reproduction of the reported "blank field" bug.
    expect(select.value).toBe("hermes_worker");
    expect(
      within(select).getByRole("option", { name: /hermes/i }),
    ).toBeInTheDocument();
  });

  it("does not clobber configJson.transport to gateway_api when Save is clicked without touching the route", async () => {
    render(<AdminMediaModels />);

    fireEvent.click(screen.getAllByTitle("Edit")[0]);
    await screen.findByTestId("transport");

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const payload = mockUpdateMutate.mock.calls[0][0];
    expect(payload.configJson.transport).toBe("hermes_worker");
    expect(payload.configJson.hermes).toEqual(hermesModel.configJson.hermes);
  });

  it("disables the Generation Route picker for a hermes_worker row so it cannot be touched into gateway_api", async () => {
    render(<AdminMediaModels />);

    fireEvent.click(screen.getAllByTitle("Edit")[0]);

    const select = (await screen.findByTestId(
      "transport",
    )) as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(
      screen.getByText(/provisioned by the seed script/i),
    ).toBeInTheDocument();
  });

  it("leaves the Generation Route picker enabled and selectable for a non-hermes (gateway_api) row (regression)", async () => {
    modelsData = [gatewayModel];
    render(<AdminMediaModels />);

    fireEvent.click(screen.getAllByTitle("Edit")[0]);

    const select = (await screen.findByTestId(
      "transport",
    )) as HTMLSelectElement;
    expect(select).not.toBeDisabled();
    expect(select.value).toBe("gateway_api");

    fireEvent.change(select, { target: { value: "mcp" } });
    expect(select.value).toBe("mcp");
  });

  it("renders a distinguishable badge for hermes_worker rows in the models table", () => {
    render(<AdminMediaModels />);

    expect(screen.getByText("Hermes")).toBeInTheDocument();
  });
});
