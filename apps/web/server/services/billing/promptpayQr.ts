function tag(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(input, "utf8")) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePromptPayRecipient(params: {
  type: "phone" | "national_id" | "tax_id" | "ewallet";
  value: string;
}) {
  const digits = normalizeDigits(params.value);
  if (params.type === "phone") {
    if (!/^0\d{9}$/.test(digits)) throw new Error("PromptPay phone must be a Thai 10-digit number");
    return { type: params.type, value: `0066${digits.slice(1)}`, displayValue: digits };
  }
  if (params.type === "ewallet") {
    if (!/^\d{1,15}$/.test(digits)) throw new Error("PromptPay e-wallet ID must contain up to 15 digits");
    return { type: params.type, value: digits, displayValue: digits };
  }
  if (!/^\d{13}$/.test(digits)) throw new Error("PromptPay recipient ID must contain 13 digits");
  return { type: params.type, value: digits, displayValue: digits };
}

export function buildPromptPayPayload(params: {
  recipientType: "phone" | "national_id" | "tax_id" | "ewallet";
  recipientId: string;
  amountThb: number | string;
  accountDisplayName?: string | null;
}) {
  const recipient = normalizePromptPayRecipient({ type: params.recipientType, value: params.recipientId });
  const amount = Number(params.amountThb);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("PromptPay amount must be positive");
  const amountText = amount.toFixed(2);
  const accountTag = params.recipientType === "phone" ? "01" : params.recipientType === "ewallet" ? "03" : "02";
  const aid = "A000000677010111";
  const merchantAccount = tag("00", aid) + tag(accountTag, recipient.value);
  const fields = [
    tag("00", "01"),
    tag("01", "12"),
    tag("29", merchantAccount),
    tag("53", "764"),
    tag("54", amountText),
    tag("58", "TH"),
  ];
  if (params.accountDisplayName?.trim()) {
    fields.push(tag("59", params.accountDisplayName.trim().slice(0, 25)));
  }
  fields.push(tag("60", "Bangkok"));
  const withoutCrc = `${fields.join("")}6304`;
  return {
    payload: `${withoutCrc}${crc16Ccitt(withoutCrc)}`,
    recipient,
    amountThb: amountText,
  };
}
