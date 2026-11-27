import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  refetch: vi.fn(),
  readiness: {
    ready: true,
    reason: null,
    pages: [{ id: 12, label: "Test Page", publishingReady: true, firstCommentReady: true, publishingIssue: null }],
    savedCaption: "Saved caption",
    savedHashtags: ["#saved"],
    hasAffiliateLink: true,
    firstCommentReady: true,
  } as any,
  history: [] as any[],
  historyError: false,
  photoMutate: vi.fn(),
  confirmPhotoMutate: vi.fn(),
  refetchPhotos: vi.fn(),
  photoReadiness: {
    ready: true,
    featureEnabled: true,
    reason: null,
    pages: [{ id: 12, label: "Test Page", publishingReady: true, firstCommentReady: true, publishingIssue: null }],
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
    marketplaceCapture: {
      advanceAutoReviewRun: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    marketplaceAutoReviewReels: {
      readiness: { useQuery: () => ({ data: mocks.readiness, isLoading: false, isError: false }) },
      history: { useQuery: () => ({ data: mocks.history, isLoading: false, isError: mocks.historyError, refetch: mocks.refetch }) },
      publish: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      reconcile: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      resume: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
      postAffiliateComment: { useMutation: () => ({ mutate: mocks.mutate, isPending: false }) },
    },
    marketplaceAutoReviewPhotoPosts: {
      readiness: { useQuery: () => ({ data: mocks.photoReadiness, isLoading: false, isError: false, refetch: mocks.refetchPhotos }) },
      history: { useQuery: () => ({ data: mocks.photoHistory, isLoading: false, isError: false, refetch: mocks.refetch }) },
      publish: { useMutation: () => ({ mutate: mocks.photoMutate, isPending: false }) },
      reconcile: { useMutation: () => ({ mutate: mocks.photoMutate, isPending: false }) },
      confirmAbsentAndAllowRetry: { useMutation: () => ({ mutate: mocks.confirmPhotoMutate, isPending: false }) },
      postAffiliateComment: { useMutation: () => ({ mutate: mocks.photoMutate, isPending: false }) },
    },
  },
}));

vi.mock("@astryxdesign/core/Banner", () => ({ Banner: ({ title, children }: any) => <section><strong>{title}</strong>{children}</section> }));
vi.mock("@astryxdesign/core/Button", () => ({ Button: ({ label, isDisabled, isLoading, onClick }: any) => <button disabled={isDisabled || isLoading} onClick={onClick}>{label}</button> }));
vi.mock("@astryxdesign/core/Card", () => ({ Card: ({ children }: any) => <section>{children}</section> }));
vi.mock("@astryxdesign/core/Collapsible", async () => {
  const React = await import("react");
  return { Collapsible: ({ trigger, children }: any) => {
    const [open, setOpen] = React.useState(true);
    return <section><button aria-expanded={open} onClick={() => setOpen(!open)}>{trigger}</button>{open ? children : null}</section>;
  } };
});
vi.mock("@astryxdesign/core/CheckboxInput", () => ({ CheckboxInput: ({ label, value, onChange }: any) => <label><input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} />{label}</label> }));
vi.mock("@astryxdesign/core/DateTimeInput", () => ({ DateTimeInput: ({ label, value, onChange }: any) => <label>{label}<input type="datetime-local" value={value ?? ""} onChange={event => onChange(event.target.value)} /></label> }));
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
    mocks.confirmPhotoMutate.mockReset();
    mocks.refetchPhotos.mockReset();
    mocks.photoHistory = [];
    mocks.readiness = {
      ready: true,
      reason: null,
      pages: [{ id: 12, label: "Test Page", publishingReady: true, firstCommentReady: true, publishingIssue: null }],
      savedCaption: "Saved caption",
      savedHashtags: ["#saved"],
      hasAffiliateLink: true,
      firstCommentReady: true,
    };
    mocks.photoReadiness = {
      ready: true,
      featureEnabled: true,
      reason: null,
      pages: [{ id: 12, label: "Test Page", publishingReady: true, firstCommentReady: true, publishingIssue: null }],
      imageVariants: [
        { variant: "caption_source", status: "completed", imageUrl: "/caption.png", sourceLabel: "Caption image" },
        { variant: "character_reference", status: "completed", imageUrl: "/character.png", sourceLabel: "Character image" },
        { variant: "product_reference", status: "completed", imageUrl: "/product.png", sourceLabel: "Product image" },
      ],
      savedCaption: "Saved caption",
      savedHashtags: ["#saved"],
      hasAffiliateLink: true,
      firstCommentReady: true,
    };
  });

  it("uses the existing Auto Review caption and hashtags without duplicate publishing fields", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    expect(screen.queryByLabelText("Caption สำหรับ Reel")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hashtag")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์ (ถ้ามี)"), { target: { value: "Affiliate disclosure" } });
    expect(screen.getByLabelText("วิดีโอนี้สร้างหรือดัดแปลงด้วย AI")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่ Reel" }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      runId: "run-1", pageId: 12,
      snapshot: { caption: "Saved caption", hashtags: ["#saved"], affiliateMode: "description", aiGenerated: true, commercialDisclosure: "Affiliate disclosure" },
    });
  });

  it("sends the selected local schedule instant as an ISO timestamp", () => {
    const localSchedule = "2099-11-26T16:05";
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.click(screen.getByLabelText("ตั้งเวลาโพสต์"));
    fireEvent.change(screen.getByLabelText("วันและเวลาเผยแพร่"), { target: { value: localSchedule } });
    fireEvent.click(screen.getByRole("button", { name: "ตั้งเวลา Reel" }));
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      scheduledAt: new Date(localSchedule).toISOString(),
    }));
  });

  it("requires explicit confirmation to publish without an affiliate link", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "none" } });
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
    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "manual_native" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์ (ถ้ามี)"), { target: { value: "โฆษณา" } });
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
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์ (ถ้ามี)"), { target: { value: "Affiliate disclosure" } });
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeDisabled();
    expect(screen.getByText(/Facebook อาจได้รับคำขอแล้ว/)).toBeInTheDocument();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("allows retry after an expired publication is reported as failed", () => {
    mocks.history = [{ id: 9, status: "failed", affiliateLinkStatus: "pending", commercialDisclosureStatus: "not_provided", attributionVerificationStatus: "unverified", providerPostId: null, permalink: null, errorMessage: "The queued worker expired before it started." }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeEnabled();
  });

  it("selects a ready Facebook Page automatically and can publish the affiliate URL as the first comment", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    expect((screen.getByLabelText("Facebook Page") as HTMLSelectElement).value).toBe("12");
    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "first_comment" } });
    const publish = screen.getByRole("button", { name: "เผยแพร่ Reel" });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 12,
      snapshot: expect.objectContaining({ affiliateMode: "first_comment" }),
    }));
  });

  it("does not guess a Page when multiple ready Facebook Pages are available", () => {
    mocks.readiness.pages.push({ id: 13, label: "Second Page", publishingReady: true, firstCommentReady: true, publishingIssue: null });
    render(<FacebookReelsPublishCard runId="run-1" />);
    expect((screen.getByLabelText("Facebook Page") as HTMLSelectElement).value).toBe("");
  });

  it("supports placing the Photo Post affiliate URL in the first comment", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect((screen.getByLabelText("Facebook Page") as HTMLSelectElement).value).toBe("12");
    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "first_comment" } });
    const publish = screen.getByRole("button", { name: "เผยแพร่ Photo Post" });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.photoMutate).toHaveBeenCalledWith(expect.objectContaining({
      pageId: 12,
      snapshot: expect.objectContaining({ affiliateMode: "first_comment" }),
    }));
  });

  it("keeps publishing disabled when history cannot be checked", () => {
    mocks.historyError = true;
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์ (ถ้ามี)"), { target: { value: "Affiliate disclosure" } });
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeDisabled();
  });

  it("allows the Reel and keeps its first comment pending when the selected Page lacks the permission", () => {
    mocks.readiness.pages[0].firstCommentReady = false;
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "first_comment" } });
    expect(screen.getByRole("option", { name: /ความคิดเห็นแรก/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "เผยแพร่ Reel" })).toBeEnabled();
    expect(screen.getByText(/หลังโพสต์สำเร็จจะมีปุ่มให้ยืนยันส่งอีกครั้ง/)).toBeInTheDocument();
  });

  it("uses the safe Facebook post-ID fallback when the permalink is unavailable", () => {
    mocks.history = [{ id: 8, status: "published", affiliateLinkStatus: "included_unverified", commercialDisclosureStatus: "included", attributionVerificationStatus: "unverified", providerPostId: "123", permalink: "https://attacker.example/video", errorMessage: null }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    expect(screen.getByText("Facebook ยืนยันเผยแพร่แล้ว")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ดู Reel บน Facebook" })).toHaveAttribute("href", "https://www.facebook.com/123");
  });

  it("requires explicit confirmation that Facebook has no post before unlocking a retry", () => {
    mocks.photoHistory = [{
      id: 42,
      status: "needs_user_action",
      selectedVariant: "caption_source",
      affiliateLinkStatus: "none",
      commercialDisclosureStatus: "not_provided",
      attributionVerificationStatus: "unverified",
      canConfirmNoPhotoExists: true,
      errorMessage: "Facebook may have received this photo.",
    }];
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));

    fireEvent.click(screen.getByRole("button", { name: "ตรวจแล้วไม่พบโพสต์ · อนุญาตให้ส่งใหม่" }));

    expect(mocks.confirmPhotoMutate).toHaveBeenCalledWith({ postId: 42, confirmNoExistingPost: true });
  });

  it("lets the user select exactly one generated image and publishes it as a Photo Post", () => {
    render(<FacebookReelsPublishCard runId="run-1" initialHashtags={["บํารุงผม", "ออยล์เซรั่ม", "จัดทรงผม"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.queryByLabelText("Caption สำหรับ Photo Post")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hashtag")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Character image" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Caption image" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Product image" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "ภาพอ้างอิงสินค้า" }));
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    const publish = screen.getByRole("button", { name: "เผยแพร่ Photo Post" });
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.photoMutate).toHaveBeenCalledWith({
      runId: "run-1", pageId: 12,
      snapshot: { variant: "product_reference", caption: "Saved caption", hashtags: ["#บํารุงผม", "#ออยล์เซรั่ม", "#จัดทรงผม"], affiliateMode: "description", commercialDisclosure: "" },
    });
    expect(screen.getAllByRole("radio").filter((radio: HTMLElement) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  });

  it("allows a different generated image after a Photo Post succeeded while preventing that image from being posted again", () => {
    mocks.photoHistory = [{
      id: 41,
      status: "published",
      selectedVariant: "caption_source",
      affiliateLinkStatus: "included_unverified",
      commercialDisclosureStatus: "not_provided",
      attributionVerificationStatus: "unverified",
      providerPostId: "facebook-post-41",
    }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));

    const publish = screen.getByRole("button", { name: "เผยแพร่ Photo Post" });
    expect(publish).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "ภาพอ้างอิงสินค้า" }));
    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.photoMutate).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ variant: "product_reference" }),
    }));

    fireEvent.click(screen.getByRole("radio", { name: "ภาพจาก Caption" }));
    expect(publish).toBeDisabled();
  });

  it("keeps the selected image while collapsing the panel and switching formats", () => {
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    fireEvent.click(screen.getByRole("radio", { name: "ภาพอ้างอิงสินค้า" }));
    const disclosure = screen.getByRole("button", { name: "เผยแพร่บน Facebook · Marketplace Auto Review" });
    fireEvent.click(disclosure);
    expect(screen.queryByLabelText("Caption สำหรับ Photo Post")).not.toBeInTheDocument();
    fireEvent.click(disclosure);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Reel" }));
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.queryByLabelText("Caption สำหรับ Photo Post")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "ภาพอ้างอิงสินค้า" })).toBeChecked();
  });

  it("enables Photo Post without disclosure after confirming no affiliate link", () => {
    render(<FacebookReelsPublishCard runId="run-1" initialHashtags={["ออยล์เซรั่ม"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    const publish = screen.getByRole("button", { name: "เผยแพร่ Photo Post" });
    expect(publish).toBeEnabled();

    fireEvent.change(screen.getByLabelText("ตำแหน่ง Affiliate Link เดิม"), { target: { value: "none" } });
    expect(publish).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "ยืนยันเผยแพร่โดยไม่ใส่ Affiliate link" }));

    expect(publish).toBeEnabled();
    fireEvent.click(publish);
    expect(mocks.photoMutate).toHaveBeenCalledWith(expect.objectContaining({
      snapshot: expect.objectContaining({ affiliateMode: "none", allowNoAffiliate: true, commercialDisclosure: "" }),
    }));
  });

  it("refreshes Photo Post choices on tab entry and when the gallery changes", () => {
    const { rerender } = render(<FacebookReelsPublishCard runId="run-1" photoImagesRevision="queued" />);
    expect(mocks.refetchPhotos).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(mocks.refetchPhotos).toHaveBeenCalledTimes(1);

    rerender(<FacebookReelsPublishCard runId="run-1" photoImagesRevision="completed" />);
    expect(mocks.refetchPhotos).toHaveBeenCalledTimes(2);
    rerender(<FacebookReelsPublishCard runId="run-1" photoImagesRevision="completed" />);
    expect(mocks.refetchPhotos).toHaveBeenCalledTimes(2);
  });

  it("keeps Photo Post disabled when no generated image is completed", () => {
    mocks.photoReadiness.imageVariants = [{ variant: "caption_source", status: "pending", imageUrl: null, sourceLabel: "Caption image" }];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.getByRole("button", { name: "เผยแพร่ Photo Post" })).toBeDisabled();
  });

  it("uses saved caption and hashtags from Photo readiness when Reel readiness is unavailable", () => {
    mocks.readiness = null;
    mocks.photoReadiness.savedCaption = "Photo saved caption";
    mocks.photoReadiness.savedHashtags = ["#photo", "#review"];
    render(<FacebookReelsPublishCard runId="run-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Facebook Photo Post" }));
    expect(screen.queryByLabelText("Caption สำหรับ Photo Post")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hashtag")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Facebook Page"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("ข้อความเปิดเผยความสัมพันธ์เชิงพาณิชย์ (ถ้ามี)"), { target: { value: "โฆษณา" } });
    fireEvent.click(screen.getByRole("button", { name: "เผยแพร่ Photo Post" }));
    expect(mocks.photoMutate).toHaveBeenCalledWith(expect.objectContaining({ snapshot: expect.objectContaining({ caption: "Photo saved caption", hashtags: ["#photo", "#review"] }) }));
  });
});
