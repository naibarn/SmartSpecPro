import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const billInput = document.querySelector('#bill-total');
const peopleInput = document.querySelector('#people-count');
const results = document.querySelector('#results');
const shareList = document.querySelector('#share-list');
const summary = document.querySelector('#result-summary');
const foot = document.querySelector('#result-foot');
const error = document.querySelector('#error-message');

function parseCents(value) {
  // Convert decimal dollars directly to cents to avoid floating point rounding.
  const amount = value.trim().replace(/^\$\s*/, '').replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function clearResults() {
  results.hidden = true;
  shareList.replaceChildren();
  summary.textContent = '';
  foot.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  clearResults();
  error.hidden = true;
  error.textContent = '';

  const totalCents = parseCents(billInput.value);
  const rawPeople = peopleInput.value.trim();
  const people = Number(rawPeople);
  if (totalCents === null) {
    error.textContent = 'Enter a bill total greater than $0 with no more than two decimal places.';
  } else if (!/^\d+$/.test(rawPeople) || !Number.isInteger(people) || people < 1 || people > 1000) {
    error.textContent = 'Enter a whole number of people from 1 to 1,000.';
  } else {
    const shares = allocateShares(totalCents, people);
    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    for (let index = 0; index < shares.length; index += 1) {
      const row = document.createElement('div');
      row.className = 'share';
      const person = document.createElement('span');
      person.textContent = `Person ${index + 1}`;
      const amount = document.createElement('strong');
      amount.textContent = formatter.format(shares[index] / 100);
      row.append(person, amount);
      shareList.append(row);
    }
    summary.textContent = `${people} ${people === 1 ? 'person' : 'people'} · ${formatter.format(totalCents / 100)} total`;
    foot.textContent = 'Shares include every cent of the bill.';
    results.hidden = false;
    return;
  }
  error.hidden = false;
});

form.addEventListener('reset', () => {
  error.hidden = true;
  error.textContent = '';
  clearResults();
});
