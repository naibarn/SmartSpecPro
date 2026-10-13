import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const billInput = document.querySelector('#bill');
const peopleInput = document.querySelector('#people');
const error = document.querySelector('#error');
const results = document.querySelector('#results');
const totalLabel = document.querySelector('#total');
const shareList = document.querySelector('#share-list');
const resetButton = document.querySelector('#reset');

function clearResults() {
  results.hidden = true;
  shareList.replaceChildren();
  totalLabel.textContent = '';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  error.hidden = true;
  error.textContent = '';
  clearResults();

  const amount = Number(billInput.value);
  const people = Number(peopleInput.value);
  if (!billInput.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    error.textContent = 'Enter a bill total greater than $0.00.';
    error.hidden = false;
    billInput.focus();
    return;
  }
  if (!peopleInput.value.trim() || !Number.isInteger(people) || people < 1 || people > 1000) {
    error.textContent = 'Enter a whole number of people from 1 to 1,000.';
    error.hidden = false;
    peopleInput.focus();
    return;
  }

  const totalCents = Math.round(amount * 100);
  const shares = allocateShares(totalCents, people);
  totalLabel.textContent = `Total: $${(totalCents / 100).toFixed(2)}`;
  const items = shares.map((cents, index) => {
    const item = document.createElement('li');
    const person = document.createElement('span');
    const share = document.createElement('strong');
    person.textContent = `Person ${index + 1}`;
    share.textContent = `$${(cents / 100).toFixed(2)}`;
    item.append(person, share);
    return item;
  });
  shareList.replaceChildren(...items);
  results.hidden = false;
});

resetButton.addEventListener('click', () => {
  HTMLFormElement.prototype.reset.call(form);
  error.hidden = true;
  error.textContent = '';
  clearResults();
  billInput.focus();
});
