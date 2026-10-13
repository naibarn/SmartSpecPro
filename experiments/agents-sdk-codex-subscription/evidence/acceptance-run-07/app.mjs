import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const amountInput = document.querySelector('#amount');
const peopleInput = document.querySelector('#people');
const message = document.querySelector('#message');
const results = document.querySelector('#results');
const shareList = document.querySelector('#share-list');
const totalLabel = document.querySelector('#total-label');
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function parseCents(value) {
  const match = /^(?:\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  message.textContent = '';
  results.hidden = true;
  const cents = parseCents(amountInput.value);
  const people = Number(peopleInput.value);
  if (cents === null) {
    message.textContent = 'Enter a valid bill amount greater than $0.00, with up to two decimal places.';
    amountInput.focus();
    return;
  }
  if (!Number.isSafeInteger(people) || people < 1 || people > 10000) {
    message.textContent = 'Enter a whole number of people between 1 and 10,000.';
    peopleInput.focus();
    return;
  }

  const shares = allocateShares(cents, people);
  shareList.replaceChildren(...shares.map((share, index) => {
    const row = document.createElement('li');
    const person = document.createElement('span');
    const amount = document.createElement('strong');
    person.textContent = `Person ${index + 1}`;
    amount.textContent = money.format(share / 100);
    row.append(person, amount);
    return row;
  }));
  totalLabel.textContent = `${people} people · ${money.format(cents / 100)} total`;
  results.hidden = false;
});

form.addEventListener('reset', () => {
  message.textContent = '';
  results.hidden = true;
  shareList.replaceChildren();
  totalLabel.textContent = '';
});
