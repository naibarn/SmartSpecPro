/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router, useLocation } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { LinkProvider } from "@astryxdesign/core/Link";
import EmergencyPublicSearch from "../EmergencyPublicSearch";

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function MemoryWouterLink({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [, setLocation] = useLocation();
  return <a {...props} href={href} onClick={event => { event.preventDefault(); setLocation(href); }} />;
}

describe("emergency geographic place search", () => {
  it("returns facility search results to the map with the search context intact", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [
        { kind: "facility", publicRef: "clinic-1", title: "Bangkok General Hospital" },
      ] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [
        { kind: "facility", publicRef: "clinic-1", title: "Bangkok General Hospital" },
      ] }) });
    vi.stubGlobal("fetch", fetchMock);
    const location = memoryLocation({ path: "/disaster/map" });
    render(<Router hook={location.hook}><LinkProvider component={MemoryWouterLink}><EmergencyPublicSearch /></LinkProvider></Router>);
    fireEvent.change(screen.getByLabelText("search.label"), { target: { value: "Bangkok General Hospital" } });
    fireEvent.click(screen.getByRole("button", { name: "search.submit" }));

    const resultLink = await screen.findByRole("link", { name: "Bangkok General Hospital" });
    expect(resultLink.getAttribute("href")).toBe("/disaster/map?q=Bangkok+General+Hospital");
    fireEvent.click(resultLink);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/public/emergency/search?q=Bangkok%20General%20Hospital");
    expect((screen.getByLabelText("search.label") as HTMLInputElement).value).toBe("Bangkok General Hospital");
  });

  it("uses the public route and explains the curated, coordinate-free result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [{
      canonicalRef: "TH-PLACE-BANGKOK", kind: "province", names: { en: "Bangkok", th: "กรุงเทพมหานคร" },
      jurisdiction: { countryCode: "TH", admin1Code: "TH-10" },
    }] }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<EmergencyPublicSearch />);

    fireEvent.change(screen.getByLabelText("geoSearch.label"), { target: { value: "Bangkok" } });
    fireEvent.click(screen.getByRole("button", { name: "geoSearch.submit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/public/emergency/geo/places/search?q=Bangkok");
    expect(await screen.findByText(/Bangkok · TH \/ TH-10 · geoSearch\.limited/)).toBeTruthy();
    expect(screen.getByText("geoSearch.description")).toBeTruthy();
  });

  it("shows unavailable state without implying that no places exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<EmergencyPublicSearch />);
    fireEvent.change(screen.getByLabelText("geoSearch.label"), { target: { value: "Bangkok" } });
    fireEvent.click(screen.getByRole("button", { name: "geoSearch.submit" }));
    expect(await screen.findByText("geoSearch.unavailable")).toBeTruthy();
  });
});
