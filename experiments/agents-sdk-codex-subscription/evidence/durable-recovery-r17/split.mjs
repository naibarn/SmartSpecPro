export function allocateShares(totalCents, people) {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error('invalid total');
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    throw new Error('invalid people');
  }

  const each = Math.floor(totalCents / people);
  const remainder = totalCents % people;
  return Array.from({ length: people }, (_, index) => each + (index < remainder ? 1 : 0));
}
