import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  readiness: {
    ready: true,
    reason: null,
    pages: [{ id: 12, label: "Test Page", publishingReady: true, publishingIssue: null }],
    savedCaption: "Saved caption",
    savedHashtags: ["#saved"],
    hasAffiliateLink: true,
  } as any,
  history: [] as any[],
  historyError: false,
  photoMutate: vi.fn(),
  photoReadiness: {
    ready: true,
    featureEnabled: true,
    reason: null,
    pages: [{ id: 12, label: "Test Page", publishingReady: true, publishingIssue: null }],
    imageVariants: [
      { variant: "caption_source", status: "completed", imageUrl: "/caption.png", sourceLabel: "Caption image" },
      { variant: "character_reference", status: "completed", imageUrl: "/character.png", sourceLabel: "Character image" },
      { variant: "product_reference", status: "completed", imageUrl: "/product.png", sourceLabel: "Product image" },
    ],
    savedCaption: "Saved caption",
    savedHashtags: ["#saved"],
    hasAffiliateLink: true,
  } as any,
  photoHistory: [] as any[],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    marketplaceAutoReviewReels: {
      readiness: { useQuery: () => ({ data: mocks.readiness, isLoading: false, isError: false }) },
      history: { useQuery: () => ({ data: mocks.history, isLoading: false, isError: mocks.historyError, refetch: mocks.refetch }) },
      publish: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      reconcile: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      resume: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
    },
    marketplaceAutoReviewPhotoPosts: {
      readiness: { useQuery: () => ({ data: mocks.photoReadiness, isLoading: false, isError: false }) },
      history: { useQuery: () => ({ data: mocks.photoHistory, isLoading: false, isError: false, refetch: mocks.refetch }) },
      publish: { useMutation: () => ({ mutate: mocks.photoMutate, isPending: false }) },
      reconcile: { useMutation: () => ({ mutate: mocks.photoMutate, isPending: false }) },
    },
  },
}));

vi.mock("@astryxdesign/core/Banner", () => ({ Banner: ({ title, children }: any) => <section><strong>{title}</strong>{children}</section> }));
vi.mock("@astryxdesign/core/Button", () => ({ Button: ({ label, isDisabled, isLoading, onClick }: any) => <button disabled={isDisabled || isLoading} onClick={onClick}>{label}</button> }));
vi.mock("@astryxdesign/core/Card", () => ({ Card: ({ children }: any) => <section>{children}</section> }));
vi.mock("@astryxdesign/core/Collapsible", () => ({ Collapsible: ({ trigger, children }: any) => <section><button>{trigger}</button>{children}</section> }));
vi.mock("@astryxdesign/core/CheckboxInput", () => ({ CheckboxInput: ({ label, value, onChange }: any) => <label><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />{label}</label> }));
vi.mock("@astryxdesign/core/Heading", () => ({ Heading: ({ children }: any) => <h3>{children}</h3> }));
vi.mock("@astryxdesign/core/HStack", () => ({ HStack: ({ children }: any) => <section>{children}</section> }));
vi.mock("@astryxdesign/core/Link", () => ({ Link: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock("@astryxdesign/core/RadioList", async () => {
  const React = await import("react");
  const Context = React.createContext({ value: "", onChange: (_value: string) => {} });
  return {
    RadioList: ({ label, value, onChange, children }: any) => <Context.Provider value={{ value, onChange }}><fieldset aria-label={label}>{children}</fieldset></Context.Provider>,
    RadioListItem: ({ value, label, description }: any) => {
      const group = React.useContext(Context);
      return <label><input type="radio" name="photo-variant" value={value} checked={group.value === value} onChange={() => group.onChange(value)} aria-label={typeof label === "string" ? label : value} />{label}{description}</label>;
    },
  };
});
vi.mock("@astryxdesign/core/Selector", () => ({ Selector: ({ label, options, value, onChange, isDisabled }: any) => <label>{label}<select value={value} onChange={event => onChange(event.target.value)} disabled={isDisabled}><option value="">เลือก</option>{options.map((option: any) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}</select></label> }));
vi.mock("@astryxdesign/core/Text", () => ({ Text: ({ children }: any) => <p>{children}</p> }));
vi.mock("@astryxdesign/core/TextArea", () => ({ TextArea: ({ label, value, onChange }: any) => <label>{label}<textarea value={value} onChange={event => onChange(event.target.value)} /></label> }));
vi.mock("@astryxdesign/core/VStack", () => ({ VStack: ({ children }: any) => <section>{children}</section> }));
vi.mock("@/components/media/AuthenticatedMediaImage", () => ({ AuthenticatedMediaImage: ({ src, alt }: any) => <img src={src} alt={alt} /> }));

import { FacebookReelsPublishCard } from "../FacebookReelsPublishCard";

describe("FacebookReelsPublishCard", () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.history = [];
    mocks.historyError = false;
    mocks.photoMutate.mockReset();
    mocks.photoHistory = [];
    mocks.readiness = {
      ready: true,
      reason: null,
      pages: [{ id: 12, label: "Test Page", publishingReady: true, publishingIssue: null }],
      savedCaption: "Saved caption",
      savedHashtags: ["#saved"],
      hasAffiliateLink: true,
    };
    mocks.photoReadiness = {
      ready: true,
      featureEnabled: true,
      reason: null,
      pages: [{ id: 12, label: "Test Page", publishingReady: true, publishingIssue: null }],
      imageVariants: [
        { variant: "caption_source", status: "completed", imageUrl: "/caption.png", sourceLabel: "Caption image" },
        { variant: "character_reference", status: "completed", imageUrl: "/character.png", sourceLabel: "Character image" },
        { variant: "product_reference", status: "completed", imageUrl: "/product.png", sourceLabel: "Product image" },
      ],
      savedCaption: "Saved caption",
      savedHashtags: ["#saved"],
      hasAffiliateLink: true,
    };
  });

  it("sends the edited snapshot, disclosure and chosen Page", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Caption สำหรับ Reel"), { target: { value: "Edited caption" } });
    fireEvent.change(screen.getByLabelText("Hashtag"), { target: { value: "#first second" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "Affiliate disclosure" } });
    fireEvent.click(screen.getByLabelText("วิดีโอนี้สร้างหรือดัดแปลงด้วย AI"));
    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่ Reel" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      runId: "run-1", pageId: 12,
      snapshot: { caption: "Edited caption", hashtags: ["#first", "#second"], affiliateMode: "description", aiGenerated: true, commercialDisclosure: "Affiliate disclosure" },
    });
  });

  it("requires explicit confirmation to publish without an affiliate link", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("วิธีใส่ Affiliate link"), { target: { value: "none" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "โฆษณา" } });
    const publish = screen.getByRole("button", { name: "เผยแพร่ Reel" });
    expect(publish).toBeDisabled();
    fireEvent.click(screen.getByLabelText("ยืนยันเผยแพร่โดยไม่ใส่ Affiliate link"));
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ snapshot: expect.objectContaining({ affiliateMode: "none", allowNoAffiliate: true }) }));
  });

  it("prepares a manual native product tagging handoff without submitting to Meta", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("วิธีใส่ Affiliate link"), { target: { value: "manual_native" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "โฆษณา" } });
    const handoff = screen.getByRole("button", { name: "เตรียมส่งต่อให้ติดแท็กใน Facebook" });
    expect(handoff).toBeEnabled();
    fireEvent.click(handoff);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ affiliateMode: "manual_native" }),
    }));
  });

  it("prevents a new publication when the previous result is uncertain", () => {
    mocks.history = [{ id: 7, status: "needs_user_action", affiliateLinkStatus: "pending", commercialDisclosureStatus: "included", attributionVerificationStatus: "unverified", providerPostId: null, permalink: null, errorMessage: null }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "Affiliate disclosure" } });
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeDisabled();
    expect(screen.getByText(/Facebook อาจได้รับคำขอแล้ว/)).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("does not publish when history cannot be checked and never enables first comment", () => {
    mocks.historyError = true;
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "Affiliate disclosure" } });
    expect(screen.getByRole("option", { name: /ความคิดเห็นแรก/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeDisabled();
  });

  it("shows only a verified Facebook permalink", () => {
    mocks.history = [{ id: 8, status: "published", affiliateLinkStatus: "included_unverified", commercialDisclosureStatus: "included", attributionVerificationStatus: "unverified", providerPostId: "123", permalink: "https://attacker.example/video", errorMessage: null }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    expect(screen.getByText("Facebook ยืนยันเผยแพร่แล้ว")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ดู Reel บน Facebook" })).not.toBeInTheDocument();
  });

  it("lets the user select exactly one generated image and publishes it as a Photo Post", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.getByRole("img", { name: "Character image" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "ภาพอ้างอิงสินค้า" }));
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์"), { target: { value: "โฆษณา" } });
    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่ Photo Post" }));
    expect(mocks.photoMutate).toHaveBeenCalledWith({
      runId: "run-1", pageId: 12,
      snapshot: { variant: "product_reference", caption: "Saved caption", hashtags: ["#saved"], affiliateMode: "description", commercialDisclosure: "โฆษณา" },
    });
    expect(screen.getAllByRole("radio").filter((radio: HTMLElement) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  });

  it("keeps Photo Post disabled when no generated image is completed", () => {
    mocks.photoReadiness.imageVariants = [{ variant: "caption_source", status: "pending", imageUrl: null, sourceLabel: "Caption image" }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.getByRole("button", { name: "เผยแพร่ Photo Post" })).toBeDisabled();
  });
});
