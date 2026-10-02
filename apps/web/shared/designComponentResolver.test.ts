import { describe, expect, it } from "vitest";
import {
  DESIGN_COMPONENT_CATALOG_SNAPSHOT,
  computeDesignCatalogDigest,
  resolveDesignComponent,
  type DesignComponentCatalogSnapshot,
  type DesignComponentIntent,
} from "./designComponentResolver";

const intent: DesignComponentIntent = {
  intentId: "intent-1",
  role: "text-entry",
  density: "comfortable",
  capabilities: ["keyboard", "labelled"],
  theme: "system",
  catalogSnapshotId: DESIGN_COMPONENT_CATALOG_SNAPSHOT.snapshotId,
  catalogDigest: DESIGN_COMPONENT_CATALOG_SNAPSHOT.digest,
  componentVersion: DESIGN_COMPONENT_CATALOG_SNAPSHOT.componentVersion,
  locale: "en",
  direction: "ltr",
  deviceProfile: "desktop",
  safeAreaRequired: false,
  reducedMotion: false,
  permissionScope: "member",
  props: { label: "Screen title", value: "Welcome", size: "md", className: "not-allowed" },
};

describe("deterministic design component resolver", () => {
  it("selects a stable pinned component and emits only catalog-approved properties", () => {
    const first = resolveDesignComponent(intent, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(resolveDesignComponent(intent, DESIGN_COMPONENT_CATALOG_SNAPSHOT)).toEqual(first);
    expect(first).toMatchObject({ status: "resolved", componentId: "TextInput", source: "astryx", props: { label: "Screen title", value: "Welcome", size: "md" } });
    expect(first.unsupportedProps).toEqual(["className"]);
  });

  it("applies locale/RTL, theme, device, safe-area, motion and permission constraints", () => {
    const contextual = resolveDesignComponent({
      ...intent,
      role: "form-field",
      theme: "high-contrast",
      locale: "ar",
      direction: "rtl",
      deviceProfile: "mobile",
      safeAreaRequired: true,
      reducedMotion: true,
      permissionScope: "admin",
    }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(contextual.status).toBe("resolved");
    expect(contextual.componentId).toBe("TextInput");
    expect(contextual.context).toEqual(expect.objectContaining({ direction: "rtl", deviceProfile: "mobile", safeAreaRequired: true, reducedMotion: true }));
  });

  it("fails closed when required capability or compatible component is absent", () => {
    const result = resolveDesignComponent({ ...intent, capabilities: [...intent.capabilities, "unavailable-capability"] }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(result).toMatchObject({ status: "unsupported", componentId: null });
    expect(result.missingCapabilities).toContain("unavailable-capability");
  });

  it("requires review for snapshot or component-contract drift", () => {
    const wrongSnapshot = resolveDesignComponent({ ...intent, catalogSnapshotId: "other-snapshot" }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(wrongSnapshot).toMatchObject({ status: "review-needed", componentId: null });
    expect(resolveDesignComponent(intent, DESIGN_COMPONENT_CATALOG_SNAPSHOT, "0.7.0")).toMatchObject({ status: "review-needed", componentId: null });

    const changed = structuredClone(DESIGN_COMPONENT_CATALOG_SNAPSHOT) as DesignComponentCatalogSnapshot;
    changed.components[0]!.supportedProps.push("inventedProp");
    const changedDigest = computeDesignCatalogDigest(changed);
    expect(changedDigest).not.toBe(DESIGN_COMPONENT_CATALOG_SNAPSHOT.digest);
    changed.digest = changedDigest;
    expect(resolveDesignComponent(intent, changed)).toMatchObject({ status: "review-needed", componentId: null });
  });

  it("does not trust a caller-created catalog even when it has a valid digest", () => {
    const snapshot: DesignComponentCatalogSnapshot = {
      ...DESIGN_COMPONENT_CATALOG_SNAPSHOT,
      components: [
        ...DESIGN_COMPONENT_CATALOG_SNAPSHOT.components,
        { ...DESIGN_COMPONENT_CATALOG_SNAPSHOT.components.find((item) => item.componentId === "TextInput")!, componentId: "SmartPromptInput", source: "smartspec" },
      ],
      digest: "",
    };
    snapshot.digest = computeDesignCatalogDigest(snapshot);
    const result = resolveDesignComponent({ ...intent, catalogDigest: snapshot.digest, props: { label: "Prompt", value: "Safe", size: "md", onClick: "handler-name" } }, snapshot);
    expect(result).toMatchObject({ status: "review-needed", componentId: null });
  });

  it("emits the same props regardless of caller key order", () => {
    const left = resolveDesignComponent({ ...intent, props: { value: "Welcome", label: "Screen title", size: "md" } }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    const right = resolveDesignComponent({ ...intent, props: { size: "md", label: "Screen title", value: "Welcome" } }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(left.props).toEqual(right.props);
  });

  it("canonicalizes nested JSON prop key order", () => {
    const left = resolveDesignComponent({
      ...intent,
      role: "single-select",
      capabilities: ["keyboard", "labelled", "selection"],
      props: { options: [{ value: "overview", label: "Overview" }] },
    }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    const right = resolveDesignComponent({
      ...intent,
      role: "single-select",
      capabilities: ["keyboard", "labelled", "selection"],
      props: { options: [{ label: "Overview", value: "overview" }] },
    }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(JSON.stringify(left.props)).toBe(JSON.stringify(right.props));
  });

  it("drops unsafe copy, retired destinations and component enum values", () => {
    const result = resolveDesignComponent({
      ...intent,
      role: "action",
      props: {
        label: "Open screen",
      href: "/\\evil.example",
        size: "massive",
        value: "secret=token-value",
      },
    }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(result.props).toEqual({ label: "Open screen", size: "md" });
    expect(result.unsupportedProps).toEqual(["href", "size", "value"]);
  });

  it("keeps JSON selector options only when their nested values are safe", () => {
    const result = resolveDesignComponent({
      ...intent,
      role: "single-select",
      capabilities: ["keyboard", "labelled", "selection"],
      props: {
        label: "Choose a view",
        options: [{ value: "overview", label: "Overview" }, { value: "detail", label: "Detail", className: "bad" }],
      },
    }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(result.componentId).toBe("Selector");
    expect(result.unsupportedProps).toContain("options");
    expect(result.props).toEqual({ label: "Choose a view" });
  });

  it("normalizes requested density through the pinned component map and rejects unsupported locales", () => {
    const dense = resolveDesignComponent({ ...intent, role: "text-entry", density: "spacious", props: { label: "Prompt" } }, DESIGN_COMPONENT_CATALOG_SNAPSHOT);
    expect(dense.props).toEqual({ label: "Prompt", size: "lg" });

    const snapshot = structuredClone(DESIGN_COMPONENT_CATALOG_SNAPSHOT) as DesignComponentCatalogSnapshot;
    snapshot.components.find((component) => component.componentId === "TextInput")!.locales = ["en"];
    snapshot.digest = computeDesignCatalogDigest(snapshot);
    const unsupportedLocale = resolveDesignComponent({ ...intent, catalogDigest: snapshot.digest, locale: "ar" }, snapshot);
    expect(unsupportedLocale.status).toBe("review-needed");
  });
});
