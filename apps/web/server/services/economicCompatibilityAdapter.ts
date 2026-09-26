export type LegacyCreditTransactionFact = {
  tenantId: string | null;
  userId: number;
  amount: number;
  referenceId: string | null;
};

export type EconomicCompatibilityFact = {
  tenantId: string;
  actorId: string;
  amountMinorUnits: number;
  currency: "USD";
  sourceReference: string | null;
  compatibilityVersion: "feature-207-v1";
};

export function createEconomicCompatibilityAdapter(input: {
  enabled: boolean;
}) {
  return {
    enabled: input.enabled,
    mapLegacyCreditTransaction(
      source: LegacyCreditTransactionFact
    ): EconomicCompatibilityFact | null {
      if (!input.enabled) return null;
      if (
        !source.tenantId ||
        !Number.isSafeInteger(source.amount) ||
        source.amount < 0
      )
        return null;
      return {
        tenantId: source.tenantId,
        actorId: String(source.userId),
        amountMinorUnits: source.amount,
        currency: "USD",
        sourceReference: source.referenceId,
        compatibilityVersion: "feature-207-v1",
      };
    },
  };
}
