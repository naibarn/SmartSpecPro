import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { listSeriesProfiles } from "@shared/verticalDramaSeries/seriesProfile";

vi.mock("wouter", () => ({
  Link: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <div data-testid="navbar" />,
}));
vi.mock("@/components/Footer", () => ({
  Footer: () => <div data-testid="footer" />,
}));
vi.mock("@/components/Seo", () => ({ Seo: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, asChild, ...props }: any) =>
    asChild ? children : <button {...props}>{children}</button>,
}));
vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));
vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: () => (props: any) => {
        const {
          children,
          initial,
          animate,
          whileInView,
          viewport,
          transition,
          ...rest
        } = props;
        return <div {...rest}>{children}</div>;
      },
    }
  ),
}));

import WorkflowGallery from "../WorkflowGallery";

describe("Drama Series profile gallery", () => {
  it("renders every profile from the shared registry and no workflow query surface", () => {
    render(<WorkflowGallery />);
    expect(screen.getByText("gallery.hero.title")).toBeInTheDocument();
    for (const profile of listSeriesProfiles()) {
      expect(
        screen.getByRole("heading", { level: 4, name: profile.titleEn })
      ).toBeInTheDocument();
    }
    for (const profile of listSeriesProfiles()) {
      expect(screen.getByTestId(`profile-type-${profile.profileId}`)).toHaveTextContent(
        profile.titleEn
      );
    }
    expect(screen.getAllByRole("img")).toHaveLength(13);
    expect(screen.queryByText("Workflow Gallery")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /gallery\.hero\.primaryCta/ })
    ).toHaveAttribute("href", "/drama-series");
  });
});
