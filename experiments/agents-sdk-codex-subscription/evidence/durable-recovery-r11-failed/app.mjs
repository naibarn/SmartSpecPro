import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const billInput = document.querySelector('#bill-total');
const peopleInput = document.querySelector('#people-count');
const billError = document.querySelector('#bill-error');
const peopleError = document.querySelector('#people-error');
const results = document.querySelector('#results');

function dollarsToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const [whole, fraction = ''] = String(value).trim().split('.');
  if (!/^\d+$/.test(whole) || !/^\d{1,2}$/.test(fraction)) return null;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function clearErrors() {
  billError.textContent = '';
  peopleError.textContent = '';
  billInput.removeAttribute('aria-invalid');
  peopleInput.removeAttribute('aria-invalid');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearErrors();
  results.hidden = true;
  results.replaceChildren();
  const totalCents = dollarsToCents(billInput.value);
  const people = Number(peopleInput.value);
  let valid = true;
  if (totalCents === null) {
    billError.textContent = 'Enter a bill total greater than $0, with up to two decimal places.';
    billInput.setAttribute('aria-invalid', 'true');
    valid = false;
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    peopleError.textContent = 'Enter a whole number of people from 1 to 1,000.';
    peopleInput.setAttribute('aria-invalid', 'true');
    valid = false;
  }
  if (!valid) return;

  const shares = allocateShares(totalCents, people);
  const heading = document.createElement('h2');
  heading.id = 'results-title';
  heading.textContent = "Each person's share";
  const summary = document.createElement('p');
  summary.className = 'results-summary';
  summary.textContent = `${people} ${people === 1 ? 'person' : 'people'} · $${(totalCents / 100).toFixed(2)} total`;
  const list = document.createElement('ol');
  list.className = 'share-list';
  shares.forEach((cents, index) => {
    const item = document.createElement('li');
    item.innerHTML = `<span>Person ${index + 1}</span><strong>$${(cents / 100).toFixed(2)}</strong>`;
    list.append(item);
  });
  results.append(heading, summary, list);
  results.hidden = false;
});

form.addEventListener('reset', () => {
  clearErrors();
  results.hidden = true;
  results.replaceChildren();
});
