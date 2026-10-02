import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyEmergencyEvidenceIntegrity } from "./evidenceIntegrity";

describe("emergency evidence integrity", () => {
  const bytes = Buffer.from("evidence bytes");
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  it("accepts a complete byte sequence with its expected digest", () => {
    expect(verifyEmergencyEvidenceIntegrity({ actualByteLength: bytes.byteLength, expectedByteLength: bytes.byteLength, actualSha256: sha256, expectedSha256: sha256 })).toBe(true);
  });

  it("rejects incorrect length, digest, or malformed digest", () => {
    expect(verifyEmergencyEvidenceIntegrity({ actualByteLength: bytes.byteLength, expectedByteLength: bytes.byteLength + 1, actualSha256: sha256, expectedSha256: sha256 })).toBe(false);
    expect(verifyEmergencyEvidenceIntegrity({ actualByteLength: bytes.byteLength, expectedByteLength: bytes.byteLength, actualSha256: "0".repeat(64), expectedSha256: sha256 })).toBe(false);
    expect(verifyEmergencyEvidenceIntegrity({ actualByteLength: bytes.byteLength, expectedByteLength: bytes.byteLength, actualSha256: sha256, expectedSha256: "bad" })).toBe(false);
  });
});
