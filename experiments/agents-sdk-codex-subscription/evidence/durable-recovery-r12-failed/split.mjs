export function allocateShares(totalCents, people) {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('Bill total must be greater than $0.');
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    throw new Error('Number of people must be a whole number from 1 to 1,000.');
  }

  const each = Math.floor(totalCents / people);
  const remainder = totalCents % people;
  return Array.from({ length: people }, (_, index) => each + (index < remainder ? 1 : 0));
}
