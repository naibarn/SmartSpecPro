import { describe, expect, it } from "vitest";

import {
  buildDesktopTrustedSignerSet,
  verifyDesktopUpdateDescriptor,
} from "../desktopUpdateService";

describe("desktopUpdateService", () => {
  it("keeps rotated signers but drops revoked ones from the trust set", () => {
    const signers = buildDesktopTrustedSignerSet([
      { signerId: "trusted", keyVersion: "2026-04", status: "trusted" },
      { signerId: "rotated", keyVersion: "2026-05", status: "rotated" },
      { signerId: "revoked", keyVersion: "2026-03", status: "revoked" },
    ]);

    expect(signers.map((signer) => signer.signerId)).toEqual([
      "trusted",
      "rotated",
    ]);
  });

  it("verifies signed update descriptors and blocks downgrade", () => {
    const result = verifyDesktopUpdateDescriptor({
      descriptor: {
        currentVersion: "1.0.0",
        bundleVersion: "1.1.0",
        signerId: "trusted",
        signatureSha256: "a".repeat(64),
      },
      trustedSigners: [
        { signerId: "trusted", keyVersion: "2026-04", status: "trusted" },
      ],
    });

    expect(result.accepted).toBe(true);

    expect(() =>
      verifyDesktopUpdateDescriptor({
        descriptor: {
          currentVersion: "1.1.0",
          bundleVersion: "1.0.0",
          signerId: "trusted",
          signatureSha256: "a".repeat(64),
        },
        trustedSigners: [
          { signerId: "trusted", keyVersion: "2026-04", status: "trusted" },
        ],
      }),
    ).toThrow(/downgrade/i);
  });

  it("compares semantic-like versions instead of raw string ordering", () => {
    const result = verifyDesktopUpdateDescriptor({
      descriptor: {
        currentVersion: "1.2.0",
        bundleVersion: "1.10.0",
        signerId: "trusted",
        signatureSha256: "a".repeat(64),
      },
      trustedSigners: [
        { signerId: "trusted", keyVersion: "2026-04", status: "trusted" },
      ],
    });

    expect(result.accepted).toBe(true);
  });
});
