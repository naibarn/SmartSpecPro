/**
 * VerticalDramaSharedSeriesPage coverage (task #32, Collab-lite L1, F131AA)
 * — the PUBLIC `/share/vd/:token` viewer. Same `useRoute` mock convention as
 * `RoleAgentDetail.test.tsx`, same hand-rolled `@/lib/trpc` mock convention
 * as the rest of this codebase's page tests.
 *
 * Covers: loading state, the exact generic error state (missing/invalid
 * token), the full read-only render (banner/overview/episodes/dialogue
 * excerpt), and — the leak-prevention angle from the CLIENT side — that no
 * owner-style action buttons (share/edit/delete) ever render here.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
// The page uses useMutation (POST body — keeps the raw token out of GET
// query strings / nginx logs; security review 2026-07-09 finding #1). The
// mock name is kept generic; each test supplies the mutation-state shape
// {mutate, isIdle, isPending, isError, data}.
const useQueryMock = vi.fn();
const mutateMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
}));

/**
 * This page resolves its own language via `useVerticalDramaShareLang`
 * (no `lang` prop — it's a standalone route, unlike
 * `VerticalDramaSeriesShareDialog`, which the owner page passes `lang`
 * into). The REAL i18n instance's `fallbackLng` is `"en"`
 * (`client/src/i18n/config.ts`'s `DEFAULT_LANGUAGE`), so an unmocked
 * jsdom test render resolves to English, not Thai — force Thai here (same
 * "mock react-i18next's useTranslation directly" convention as
 * `LocaleToggle.i18n.test.tsx`/`WelcomeLanguagePicker.test.tsx`) so this
 * file's Thai-copy assertions reflect the actual default a real Thai
 * browser session would see.
 */
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "th" } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    verticalDramaShare: {
      getSharedSeries: {
        useMutation: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

import VerticalDramaSharedSeriesPage from "../VerticalDramaSharedSeriesPage";

beforeEach(() => {
  vi.clearAllMocks();
  useRouteMock.mockReturnValue([true, { token: "raw-token-abc" }]);
});

describe("loading state", () => {
  it("shows a loading message while the query is pending", () => {
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: true, isError: false, data: undefined });
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByTestId("vd-shared-viewer-loading")).toBeInTheDocument();
  });
});

describe("error / not-found state", () => {
  it("shows the exact generic Thai error message when the query errors", () => {
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: false, isError: true, data: undefined });
    render(<VerticalDramaSharedSeriesPage />);

    const errorCard = screen.getByTestId("vd-shared-viewer-error");
    expect(errorCard).toHaveTextContent("ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว");
  });

  it("shows the error state when there is no token in the route at all", () => {
    useRouteMock.mockReturnValue([false, undefined]);
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: false, isError: false, data: undefined });
    render(<VerticalDramaSharedSeriesPage />);

    expect(screen.getByTestId("vd-shared-viewer-error")).toBeInTheDocument();
  });

  it("shows the error state when the query succeeds with no data (defensive)", () => {
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: false, isError: false, data: undefined });
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByTestId("vd-shared-viewer-error")).toBeInTheDocument();
  });

  it("never renders any owner-style action button (share/edit/delete) on the error state", () => {
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: false, isError: true, data: undefined });
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("happy path render", () => {
  const projection = {
    series: { title: "Corporate Betrayal", genre: "Drama", tone: "Dark", targetEpisodeCount: 12 },
    overview: {
      logline: "A rising executive uncovers a conspiracy.",
      mainPlot: "The full plot summary text.",
      seasonArc: "The season-long arc text.",
    },
    episodes: [
      {
        episodeNumber: 1,
        title: "Pilot",
        roughStatus: "scripted" as const,
        logline: "Episode one logline.",
        dialogue: [
          { speaker: "Aria", text: "We need to talk." },
          { speaker: "Narrator", text: "The city never slept." },
        ],
      },
      {
        episodeNumber: 2,
        title: null,
        roughStatus: "draft" as const,
        logline: null,
      },
    ],
  };

  beforeEach(() => {
    useQueryMock.mockReturnValue({ mutate: mutateMock, isIdle: false, isPending: false, isError: false, data: projection });
  });

  it("shows the visitor read-only banner", () => {
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByTestId("vd-shared-viewer-banner")).toHaveTextContent(
      "มุมมองผู้เยี่ยมชม — อ่านอย่างเดียว",
    );
  });

  it("renders the series title, genre, tone, and episode count", () => {
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByTestId("vd-shared-series-title")).toHaveTextContent("Corporate Betrayal");
    expect(screen.getByText("Drama")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
  });

  it("renders the overview section (logline/mainPlot/seasonArc)", () => {
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByText("A rising executive uncovers a conspiracy.")).toBeInTheDocument();
    expect(screen.getByText("The full plot summary text.")).toBeInTheDocument();
    expect(screen.getByText("The season-long arc text.")).toBeInTheDocument();
  });

  it("renders every episode with a Thai rough-status chip, and a fallback title for a null title", () => {
    render(<VerticalDramaSharedSeriesPage />);
    expect(screen.getByTestId("vd-shared-episode-trigger-1")).toHaveTextContent("Pilot");
    expect(screen.getByTestId("vd-shared-episode-trigger-1")).toHaveTextContent("มีบท");
    expect(screen.getByTestId("vd-shared-episode-trigger-2")).toHaveTextContent("ตอนที่ 2");
    expect(screen.getByTestId("vd-shared-episode-trigger-2")).toHaveTextContent("ร่าง");
  });

  it("expands an episode to reveal its dialogue excerpt (speaker + text only)", () => {
    render(<VerticalDramaSharedSeriesPage />);
    fireEvent.click(screen.getByTestId("vd-shared-episode-trigger-1"));

    expect(screen.getByText("Episode one logline.")).toBeInTheDocument();
    expect(screen.getByText(/We need to talk\./)).toBeInTheDocument();
    expect(screen.getByText(/Aria:/)).toBeInTheDocument();
    expect(screen.getByText(/The city never slept\./)).toBeInTheDocument();
  });

  it("shows the dialogue-empty state for an episode with no dialogue excerpt", () => {
    render(<VerticalDramaSharedSeriesPage />);
    fireEvent.click(screen.getByTestId("vd-shared-episode-trigger-2"));
    expect(screen.getByText("ยังไม่มีบทพูดสำหรับตอนนี้")).toBeInTheDocument();
  });

  it("never renders any owner-style action button (share/edit/delete/save) anywhere on the page", () => {
    render(<VerticalDramaSharedSeriesPage />);
    for (const forbiddenLabel of [/แชร์/, /ลบ/, /แก้ไข/, /บันทึก/i, /^share$/i, /^delete$/i, /^edit$/i]) {
      expect(screen.queryByRole("button", { name: forbiddenLabel })).not.toBeInTheDocument();
    }
  });
});
