export function allocateShares(totalCents, people) {
  if (!Number.isInteger(totalCents) || totalCents < 1) {
    throw new Error('Total must be a positive whole number of cents');
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    throw new Error('People must be a whole number from 1 to 1,000');
  }

  const each = Math.floor(totalCents / people);
  const remainder = totalCents % people;
  return Array.from({ length: people }, (_, index) => each + (index < remainder ? 1 : 0));
}
