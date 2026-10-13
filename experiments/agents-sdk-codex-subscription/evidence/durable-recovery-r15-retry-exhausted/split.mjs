export function dollarsToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // Round to the nearest cent while compensating for binary floating point noise.
  const scaled = amount * 100;
  const cents = Math.round(scaled + Number.EPSILON * Math.abs(scaled) * 2);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function allocateShares(totalCents, people) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error('Bill total must be a positive whole number of cents');
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    throw new Error('Number of people must be a whole number from 1 to 1,000');
  }

  const each = Math.floor(totalCents / people);
  const remainder = totalCents % people;
  return Array.from({ length: people }, (_, index) => each + (index < remainder ? 1 : 0));
}
