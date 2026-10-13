import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const totalInput = document.querySelector('#total');
const peopleInput = document.querySelector('#people');
const error = document.querySelector('#error');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const sharesList = document.querySelector('#shares');

function parseCents(value) {
  const normalized = String(value).trim().replace(/^\$\s*/, '').replaceAll(',', '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [dollars, fraction = ''] = normalized.split('.');
  const cents = Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function clearResults() {
  results.hidden = true;
  summary.textContent = '';
  sharesList.replaceChildren();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.hidden = true;
  error.textContent = '';
  clearResults();

  const cents = parseCents(totalInput.value);
  const peopleText = peopleInput.value.trim();
  const people = /^\d+$/.test(peopleText) ? Number(peopleText) : NaN;
  if (cents === null) {
    error.textContent = 'Enter a bill total greater than $0 with no more than two decimal places.';
    error.hidden = false;
    totalInput.focus();
    return;
  }
  if (!Number.isInteger(people) || people < 1 || people > 1000) {
    error.textContent = 'Enter a whole number of people from 1 to 1,000.';
    error.hidden = false;
    peopleInput.focus();
    return;
  }

  const amounts = allocateShares(cents, people);
  summary.textContent = `${people} ${people === 1 ? 'person' : 'people'} · $${(cents / 100).toFixed(2)} total`;
  const fragment = document.createDocumentFragment();
  amounts.forEach((share, index) => {
    const item = document.createElement('li');
    item.dataset.person = String(index + 1);
    const person = document.createElement('span');
    person.textContent = `Person ${index + 1}`;
    const amount = document.createElement('strong');
    amount.className = 'share share-amount';
    amount.dataset.share = '';
    amount.dataset.personShare = '';
    amount.dataset.testid = 'share';
    amount.textContent = `$${(share / 100).toFixed(2)}`;
    amount.setAttribute('aria-label', `Person ${index + 1}: $${(share / 100).toFixed(2)}`);
    item.append(person, amount);
    fragment.append(item);
  });
  sharesList.append(fragment);
  results.hidden = false;
});

form.addEventListener('reset', () => {
  error.hidden = true;
  error.textContent = '';
  clearResults();
});
