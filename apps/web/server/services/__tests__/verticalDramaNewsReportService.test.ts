import { describe, expect, it } from "vitest";
import { evaluateNewsReadiness, extractNanFloodClaims } from "../verticalDramaNewsReportService";

describe("verticalDramaNewsReportService", () => {
  it("extracts the Nan flood fixture into bounded, unverified claims", () => {
    const claims = extractNanFloodClaims(`สถานการณ์น้ำท่วมและดินสไลด์ในพื้นที่ จ.น่าน ยังคงน่าเป็นห่วง ส่งผลกระทบครอบคลุม 7 อำเภอ 34 ตำบล 223 หมู่บ้าน และสร้างความเดือดร้อนให้แก่ประชาชนแล้วมากกว่า 20,000 ครอบครัว โดยในช่วงวันที่ 19-21 ส.ค.นี้ พื้นที่ตอนล่างของจังหวัดยังต้องเฝ้าระวังอย่างใกล้ชิด จุดวัดน้ำ N.1 ปี 2567 ระดับน้ำพุ่งสูงถึง 8.72 เมตร แม้กำแพงรับน้ำได้ 8.40-8.50 เมตร แต่น้ำล้นเข้าพื้นที่ 22 - 32 เซนติเมตร`);
    expect(claims.map(claim => claim.claimId)).toEqual([
      "nan-impact-scope",
      "nan-watch-window",
      "nan-n1-record",
      "nan-wall-overflow",
    ]);
    expect(claims.every(claim => claim.status === "needs_verification")).toBe(true);
    expect(evaluateNewsReadiness(claims).ready).toBe(false);
  });
});
