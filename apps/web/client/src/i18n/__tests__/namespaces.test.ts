import { describe, expect, it } from "vitest";
import { ROUTE_NAMESPACES, getRouteNamespaces } from "../namespaces";
import { ALL_NAMESPACES } from "../config";

describe("i18n/namespaces", () => {
  it("/chat maps to chat namespace", () => {
    expect(getRouteNamespaces("/chat")).toEqual(["chat"]);
  });

  it("/agencies/123/edit maps to agency namespace", () => {
    expect(getRouteNamespaces("/agencies/123/edit")).toEqual(["agency"]);
  });

  it("/admin/providers maps to admin namespace", () => {
    expect(getRouteNamespaces("/admin/providers")).toEqual(["admin"]);
  });

  it("/social/inbox maps to social namespace", () => {
    expect(getRouteNamespaces("/social/inbox")).toEqual(["social"]);
  });

  it("/unknown-path returns undefined", () => {
    expect(getRouteNamespaces("/unknown-path")).toBeUndefined();
  });

  it("/ root returns undefined", () => {
    expect(getRouteNamespaces("/")).toBeUndefined();
  });

  it("every namespace referenced in ROUTE_NAMESPACES exists in ALL_NAMESPACES", () => {
    const allNsSet = new Set(ALL_NAMESPACES);
    for (const entry of ROUTE_NAMESPACES) {
      for (const ns of entry.namespaces) {
        expect(allNsSet).toContain(ns);
      }
    }
  });

  it("/dashboard maps to dashboard namespace", () => {
    expect(getRouteNamespaces("/dashboard")).toEqual(["dashboard"]);
  });

  it("/presentation/123 maps to presentation namespace", () => {
    expect(getRouteNamespaces("/presentation/123")).toEqual(["presentation"]);
  });

  it("/video-editor maps to presentation namespace", () => {
    expect(getRouteNamespaces("/video-editor")).toEqual(["presentation"]);
  });

  it("/generate maps to media namespace", () => {
    expect(getRouteNamespaces("/generate")).toEqual(["media"]);
  });

  it("/gallery maps to media namespace", () => {
    expect(getRouteNamespaces("/gallery")).toEqual(["media"]);
  });

  it("/storyboard-review maps to media and common namespaces", () => {
    expect(getRouteNamespaces("/storyboard-review")).toEqual(["media", "common"]);
    expect(getRouteNamespaces("/storyboard-review/91")).toEqual(["media", "common"]);
  });

  it("/credits maps to billing namespace", () => {
    expect(getRouteNamespaces("/credits")).toEqual(["billing"]);
  });

  it("/usage maps to billing namespace", () => {
    expect(getRouteNamespaces("/usage")).toEqual(["billing"]);
  });

  it("/help maps to help namespace", () => {
    expect(getRouteNamespaces("/help")).toEqual(["help"]);
  });

  it("/domain-admin maps to settings namespace", () => {
    expect(getRouteNamespaces("/domain-admin")).toEqual(["settings"]);
  });

  it("/automation maps to social namespace", () => {
    expect(getRouteNamespaces("/automation")).toEqual(["social"]);
  });
});
