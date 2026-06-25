const gallons = document.getElementById('gallons');
const liters = document.getElementById('liters');
const type = document.getElementById('gallonType');
const formula = document.getElementById('formula');
const swap = document.getElementById('swap');
const clear = document.getElementById('clear');

const units = {
  us: { factor: 3.785411784, text: '1 galón US = 3,785411784 litros' },
  imperial: { factor: 4.54609, text: '1 galón imperial = 4,54609 litros' }
};

let source = 'gallons';

function tidy(number) {
  return Number(number.toFixed(8)).toString();
}

function fromGallons() {
  source = 'gallons';
  const value = Number(gallons.value);
  liters.value = gallons.value !== '' && Number.isFinite(value)
    ? tidy(value * units[type.value].factor)
    : '';
}

function fromLiters() {
  source = 'liters';
  const value = Number(liters.value);
  gallons.value = liters.value !== '' && Number.isFinite(value)
    ? tidy(value / units[type.value].factor)
    : '';
}

gallons.addEventListener('input', fromGallons);
liters.addEventListener('input', fromLiters);

type.addEventListener('change', () => {
  formula.textContent = units[type.value].text;
  source === 'liters' ? fromLiters() : fromGallons();
});

swap.addEventListener('click', () => {
  const oldGallons = gallons.value;
  gallons.value = liters.value;
  liters.value = oldGallons;
  fromGallons();
  gallons.focus();
});

clear.addEventListener('click', () => {
  gallons.value = '';
  liters.value = '';
  source = 'gallons';
  gallons.focus();
});

gallons.focus();
