export function verifyEmergencyEvidenceIntegrity(input: {
  actualByteLength: number;
  expectedByteLength: number;
  actualSha256: string;
  expectedSha256: string;
}): boolean {
  return Number.isSafeInteger(input.expectedByteLength) && input.expectedByteLength > 0 && input.actualByteLength === input.expectedByteLength &&
    /^[a-f0-9]{64}$/.test(input.expectedSha256) && input.actualSha256 === input.expectedSha256;
}
