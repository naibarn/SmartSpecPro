import { allocateShares, dollarsToCents } from './split.mjs';

const form = document.querySelector('#split-form');
const billInput = document.querySelector('#bill-total');
const peopleInput = document.querySelector('#people');
const billError = document.querySelector('#bill-error');
const peopleError = document.querySelector('#people-error');
const results = document.querySelector('#results');
const resultSummary = document.querySelector('#result-summary');
const shareList = document.querySelector('#share-list');
const reconcile = document.querySelector('#reconcile');

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function clearErrors() {
  billError.textContent = '';
  peopleError.textContent = '';
  billInput.removeAttribute('aria-invalid');
  peopleInput.removeAttribute('aria-invalid');
  billInput.setCustomValidity('');
  peopleInput.setCustomValidity('');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors();
  const totalCents = dollarsToCents(billInput.value);
  const people = Number(peopleInput.value);
  let valid = true;

  if (totalCents === null) {
    const message = 'Enter an amount greater than $0.';
    billError.textContent = message;
    billInput.setAttribute('aria-invalid', 'true');
    billInput.setCustomValidity(message);
    valid = false;
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    const message = 'Enter a whole number from 1 to 1,000.';
    peopleError.textContent = message;
    peopleInput.setAttribute('aria-invalid', 'true');
    peopleInput.setCustomValidity(message);
    valid = false;
  }
  if (!valid) {
    results.hidden = true;
    return;
  }

  const shares = totalCents === 0
    ? Array.from({ length: people }, () => 0)
    : allocateShares(totalCents, people);
  resultSummary.textContent = `${formatMoney(totalCents)} split between ${people} ${people === 1 ? 'person' : 'people'}`;
  shareList.replaceChildren(...shares.map((share, index) => {
    const item = document.createElement('li');
    const person = document.createElement('span');
    const amount = document.createElement('strong');
    person.textContent = `Person ${index + 1}`;
    amount.textContent = formatMoney(share);
    item.append(person, amount);
    return item;
  }));
  reconcile.textContent = `Total: ${formatMoney(shares.reduce((sum, share) => sum + share, 0))}`;
  results.hidden = false;
});

form.addEventListener('reset', () => {
  clearErrors();
  results.hidden = true;
  resultSummary.textContent = '';
  shareList.replaceChildren();
  reconcile.textContent = '';
});
