import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const amountInput = document.querySelector('#bill-total');
const peopleInput = document.querySelector('#people-count');
const message = document.querySelector('#form-message');
const results = document.querySelector('#results');
const shareList = document.querySelector('#share-list');
const resultCount = document.querySelector('#result-count');
const resultTotal = document.querySelector('#result-total');
const money = cents => `$${(cents / 100).toFixed(2)}`;

function parseCents(value) {
  const text = value.trim();
  // Accept ordinary dollar input with at most two decimal places. Parse the
  // digits directly so binary floating point cannot lose or invent a cent.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(2, '0'));
  const cents = whole * 100 + fraction;
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function clearResults() {
  results.classList.remove('visible');
  shareList.replaceChildren();
  resultCount.textContent = '';
  resultTotal.textContent = '';
}

form.addEventListener('submit', event => {
  event.preventDefault();
  message.textContent = '';
  amountInput.removeAttribute('aria-invalid');
  peopleInput.removeAttribute('aria-invalid');
  clearResults();

  const totalCents = parseCents(amountInput.value);
  const peopleText = peopleInput.value.trim();
  const people = Number(peopleText);
  const amountValid = totalCents !== null;
  const peopleValid = /^\d+$/.test(peopleText) && Number.isInteger(people) && people >= 1 && people <= 1000;

  if (!amountValid || !peopleValid) {
    if (!amountValid) amountInput.setAttribute('aria-invalid', 'true');
    if (!peopleValid) peopleInput.setAttribute('aria-invalid', 'true');
    message.textContent = [
      !amountValid ? 'Enter a bill total greater than $0 with no more than two decimal places.' : '',
      !peopleValid ? 'Enter a whole number of people from 1 to 1,000.' : ''
    ].filter(Boolean).join(' ');
    return;
  }

  const shares = allocateShares(totalCents, people);
  const fragment = document.createDocumentFragment();
  shares.forEach((share, index) => {
    const row = document.createElement('div');
    row.className = 'share-row';
    const person = document.createElement('span');
    person.textContent = `Person ${index + 1}`;
    const shareAmount = document.createElement('strong');
    shareAmount.textContent = money(share);
    row.append(person, shareAmount);
    fragment.append(row);
  });
  shareList.append(fragment);
  resultCount.textContent = `${people} ${people === 1 ? 'person' : 'people'}`;
  resultTotal.textContent = money(totalCents);
  results.classList.add('visible');
});

form.addEventListener('reset', () => {
  message.textContent = '';
  amountInput.removeAttribute('aria-invalid');
  peopleInput.removeAttribute('aria-invalid');
  clearResults();
});
