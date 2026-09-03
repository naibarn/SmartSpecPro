export const WHITE_LABEL_MIN_TOPUP_USD = 300;

export function isWhiteLabelEligibleTopUp(pkg: {
  packageType: string;
  priceUsd: number;
}): boolean {
  return (
    pkg.packageType === "one_time" &&
    Number.isFinite(pkg.priceUsd) &&
    pkg.priceUsd >= WHITE_LABEL_MIN_TOPUP_USD
  );
}
