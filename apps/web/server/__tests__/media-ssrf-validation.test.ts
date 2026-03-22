import { describe, it, expect } from "vitest";
import { validateExtraParamsNoSsrf } from "../services/ssrfValidation";

describe("validateExtraParamsNoSsrf", () => {
  // --- Blocked URLs (must reject) ---

  it("rejects http://localhost:8000/api/admin", () => {
    const errors = validateExtraParamsNoSsrf({ image_url: "http://localhost:8000/api/admin" });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("image_url");
  });

  it("rejects http://127.0.0.1:3000/internal", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://127.0.0.1:3000/internal" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://127.0.0.2/probe (full 127.0.0.0/8)", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://127.0.0.2/probe" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://host.docker.internal:8000/api", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://host.docker.internal:8000/api" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://0.0.0.0:3000", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://0.0.0.0:3000" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://10.0.0.1/private", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://10.0.0.1/private" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://10.255.255.255/end", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://10.255.255.255/end" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://172.16.0.1/private", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://172.16.0.1/private" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://172.31.255.255/end", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://172.31.255.255/end" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("allows http://172.15.0.1/ok (not private)", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://172.15.0.1/ok" });
    expect(errors).toHaveLength(0);
  });

  it("allows http://172.32.0.1/ok (not private)", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://172.32.0.1/ok" });
    expect(errors).toHaveLength(0);
  });

  it("rejects http://192.168.1.1/private", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://192.168.1.1/private" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://169.254.169.254/latest/meta-data (AWS metadata)", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://169.254.169.254/latest/meta-data" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects http://[::1]:8000/internal (IPv6 loopback)", () => {
    const errors = validateExtraParamsNoSsrf({ url: "http://[::1]:8000/internal" });
    expect(errors.length).toBeGreaterThan(0);
  });

  // --- Allowed URLs (must pass) ---

  it("allows https://example.com/image.png", () => {
    const errors = validateExtraParamsNoSsrf({ url: "https://example.com/image.png" });
    expect(errors).toHaveLength(0);
  });

  it("allows https://v3b.fal.media/files/example.mp4", () => {
    const errors = validateExtraParamsNoSsrf({ url: "https://v3b.fal.media/files/example.mp4" });
    expect(errors).toHaveLength(0);
  });

  it("allows https://storage.googleapis.com/bucket/file.wav", () => {
    const errors = validateExtraParamsNoSsrf({ url: "https://storage.googleapis.com/bucket/file.wav" });
    expect(errors).toHaveLength(0);
  });

  // --- Non-URL values (must pass without checking) ---

  it("allows non-URL string '1080p'", () => {
    const errors = validateExtraParamsNoSsrf({ resolution: "1080p" });
    expect(errors).toHaveLength(0);
  });

  it("allows non-URL string 'hello world'", () => {
    const errors = validateExtraParamsNoSsrf({ text: "hello world" });
    expect(errors).toHaveLength(0);
  });

  it("allows number value", () => {
    const errors = validateExtraParamsNoSsrf({ width: 42 });
    expect(errors).toHaveLength(0);
  });

  it("allows boolean value", () => {
    const errors = validateExtraParamsNoSsrf({ loop: true });
    expect(errors).toHaveLength(0);
  });

  // --- Edge cases ---

  it("allows empty extraParams", () => {
    const errors = validateExtraParamsNoSsrf({});
    expect(errors).toHaveLength(0);
  });

  it("allows undefined extraParams", () => {
    const errors = validateExtraParamsNoSsrf(undefined);
    expect(errors).toHaveLength(0);
  });

  it("allows nested object containing URL (only validates top-level)", () => {
    const errors = validateExtraParamsNoSsrf({
      nested: { url: "http://localhost:8000" },
    });
    expect(errors).toHaveLength(0);
  });

  it("rejects when multiple values with one bad URL", () => {
    const errors = validateExtraParamsNoSsrf({
      good: "https://example.com/ok",
      bad: "http://10.0.0.1/ssrf",
    });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("bad");
  });

  it("rejects image_url targeting internal host", () => {
    const errors = validateExtraParamsNoSsrf({ image_url: "http://10.0.0.1/ssrf" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("image_url");
  });

  it("rejects audio_url targeting docker internal", () => {
    const errors = validateExtraParamsNoSsrf({ audio_url: "http://host.docker.internal:8000" });
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("audio_url");
  });

  it("rejects uppercase scheme HTTP://localhost", () => {
    const errors = validateExtraParamsNoSsrf({ url: "HTTP://localhost/test" });
    expect(errors.length).toBeGreaterThan(0);
  });
});
