import { allocateShares } from './split.mjs';

const form = document.querySelector('#split-form');
const billInput = document.querySelector('#bill-total');
const peopleInput = document.querySelector('#people-count');
const billError = document.querySelector('#bill-error');
const peopleError = document.querySelector('#people-error');
const results = document.querySelector('#results');
const shareList = document.querySelector('#share-list');
const summary = document.querySelector('#results-summary');
const totalOutput = document.querySelector('#share-total');
const resetButton = document.querySelector('#reset-button');
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function clearErrors() { billError.textContent = ''; peopleError.textContent = ''; billInput.removeAttribute('aria-invalid'); peopleInput.removeAttribute('aria-invalid'); }
function hideResults() { results.hidden = true; shareList.replaceChildren(); summary.textContent = ''; totalOutput.textContent = ''; }
function parseCents(value) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}
form.addEventListener('submit', (event) => {
  event.preventDefault(); clearErrors(); hideResults();
  const cents = parseCents(billInput.value);
  const people = Number(peopleInput.value);
  let valid = true;
  if (cents === null || cents <= 0) { billError.textContent = 'Enter an amount greater than $0, with up to two decimal places.'; billInput.setAttribute('aria-invalid', 'true'); valid = false; }
  if (!Number.isInteger(people) || people < 1 || people > 1000 || peopleInput.value.trim() === '') { peopleError.textContent = 'Enter a whole number from 1 to 1,000.'; peopleInput.setAttribute('aria-invalid', 'true'); valid = false; }
  if (!valid) return;
  const shares = allocateShares(cents, people);
  summary.textContent = `${dollars.format(cents / 100)} split between ${people} ${people === 1 ? 'person' : 'people'}`;
  const fragment = document.createDocumentFragment();
  shares.forEach((share, index) => {
    const item = document.createElement('li'); item.className = 'share-item';
    const who = document.createElement('span'); who.textContent = `Person ${index + 1}`;
    const amount = document.createElement('strong'); amount.className = 'share-amount'; amount.textContent = dollars.format(share / 100);
    item.append(who, amount); fragment.append(item);
  });
  shareList.replaceChildren(fragment); totalOutput.textContent = dollars.format(cents / 100); results.hidden = false;
});
resetButton.addEventListener('click', () => { form.reset(); clearErrors(); hideResults(); billInput.focus(); });
form.addEventListener('input', clearErrors);
