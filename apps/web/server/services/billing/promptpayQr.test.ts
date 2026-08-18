import { describe, expect, it } from "vitest";

function crc16(input: string) {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

describe("Thai PromptPay QR payload", () => {
  it("emits a fixed amount mobile PromptPay payload with a valid CRC", async () => {
    const { buildPromptPayPayload } = await import("./promptpayQr");
    const result = buildPromptPayPayload({ recipientType: "phone", recipientId: "0812345678", amountThb: "347.07", accountDisplayName: "SmartAIHub" });
    expect(result.payload).toContain("0016A00000067701011101130066812345678");
    expect(result.payload.slice(-4)).toBe(crc16(result.payload.slice(0, -4)));
    expect(result.amountThb).toBe("347.07");
  });

  it("uses the Thai QR e-wallet subtag", async () => {
    const { buildPromptPayPayload } = await import("./promptpayQr");
    const result = buildPromptPayPayload({ recipientType: "ewallet", recipientId: "123456789012345", amountThb: 1 });
    expect(result.payload).toContain("0016A0000006770101110315123456789012345");
    expect(result.payload.slice(-4)).toBe(crc16(result.payload.slice(0, -4)));
  });
});
