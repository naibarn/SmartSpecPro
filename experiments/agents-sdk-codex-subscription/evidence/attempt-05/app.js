import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const amountInput = document.querySelector('#amount');
const peopleInput = document.querySelector('#people');
const results = document.querySelector('#results');
const fields = [
  { input: amountInput, error: document.querySelector('#amount-error'), label: 'Bill total' },
  { input: peopleInput, error: document.querySelector('#people-error'), label: 'Number of people' },
];

function setError(input, error, message) {
  error.textContent = message;
  error.hidden = !message;
  input.setAttribute('aria-invalid', String(Boolean(message)));
}

function parseAmount(value) {
  const trimmed = value.trim();
  if (!trimmed || !/^(?:\d+)(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  results.hidden = true;
  results.replaceChildren();

  const total = parseAmount(amountInput.value);
  const rawPeople = peopleInput.value.trim();
  const people = /^\d+$/.test(rawPeople) ? Number(rawPeople) : NaN;
  const amountError = total === null ? 'Enter a positive dollar amount with up to two decimal places.' : '';
  const peopleError = !Number.isSafeInteger(people) || people < 1 || people > 1000
    ? 'Enter a whole number of people from 1 to 1000.' : '';
  setError(amountInput, fields[0].error, amountError);
  setError(peopleInput, fields[1].error, peopleError);
  if (amountError || peopleError) {
    (amountError ? amountInput : peopleInput).focus();
    return;
  }

  const shares = allocateShares(total, people);
  const heading = document.createElement('h2');
  heading.textContent = 'Everyone’s share';
  const summary = document.createElement('p');
  summary.className = 'summary';
  summary.textContent = `${formatMoney(total)} total · ${people} ${people === 1 ? 'person' : 'people'}`;
  const list = document.createElement('ol');
  list.className = 'share-list';
  list.setAttribute('aria-label', 'Per-person shares');
  shares.forEach((share, index) => {
    const item = document.createElement('li');
    const person = document.createElement('span');
    person.textContent = `Person ${index + 1}`;
    const value = document.createElement('span');
    value.textContent = formatMoney(share);
    item.append(person, value);
    list.append(item);
  });
  results.append(heading, summary, list);
  results.hidden = false;
});

form.addEventListener('reset', () => {
  queueMicrotask(() => {
    results.replaceChildren();
    results.hidden = true;
    fields.forEach(({ input, error }) => setError(input, error, ''));
  });
});
