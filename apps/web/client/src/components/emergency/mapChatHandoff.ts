import { parseMapContextEnvelope, type MapContextEnvelope } from "@smartspec/shared/src/emergency/mapContext";

export const EMERGENCY_MAP_CHAT_EVENT = "smartspec:emergency-map:ask-ai";

export function parseEmergencyMapChatRequest(value: unknown): { prompt: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prompt = (value as Record<string, unknown>).prompt;
  return typeof prompt === "string" && prompt.trim().length > 0 && prompt.length <= 2_000
    ? { prompt: prompt.trim() }
    : undefined;
}

export function formatMapContextPrompt(value: unknown): string | undefined {
  const context = parseMapContextEnvelope(value);
  if (!context) return undefined;
  const [west, south, east, north] = context.viewport.bounds;
  const [longitude, latitude] = context.viewport.center;
  const summary = context.visibleSummary;
  return [
    "ช่วยอธิบายข้อมูลแผนที่ภัยฉุกเฉินสาธารณะที่กำลังเปิดอยู่ โดยยึดเฉพาะข้อมูลสรุปที่แสดงด้านล่างนี้",
    `พื้นที่แผนที่: พิกัดกลาง ${latitude.toFixed(3)}, ${longitude.toFixed(3)}; ขอบเขต ${south.toFixed(3)} ถึง ${north.toFixed(3)} ละติจูด และ ${west.toFixed(3)} ถึง ${east.toFixed(3)} ลองจิจูด; ระดับซูม ${context.viewport.zoom.toFixed(1)}`,
    `ชั้นข้อมูลที่เปิด: ${context.activeLayers.join(", ") || "ไม่มี"}`,
    summary ? `ข้อมูลในพื้นที่: เหตุ ${summary.incidents}, จุดเสี่ยง ${summary.hazards}, ทรัพยากร ${summary.resources}, งาน ${summary.tasks}, บริการ ${summary.services ?? 0}` : "",
    "โปรดระบุข้อจำกัดว่าข้อมูลนี้เป็นภาพรวมสาธารณะ และอย่าอนุมานว่าพื้นที่ที่ไม่มีหมุดปลอดภัย",
  ].filter(Boolean).join("\n");
}

export function dispatchEmergencyMapChat(context: MapContextEnvelope): void {
  const prompt = formatMapContextPrompt(context);
  if (!prompt || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EMERGENCY_MAP_CHAT_EVENT, { detail: { prompt } }));
}
