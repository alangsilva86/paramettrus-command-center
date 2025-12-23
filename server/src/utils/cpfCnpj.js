const isRepeatedDigits = (value) => /^(\d)\1+$/.test(value);

const calcCpfDigit = (digits, factor) => {
  let sum = 0;
  for (let i = 0; i < factor - 1; i += 1) {
    sum += Number(digits[i]) * (factor - i);
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
};

const isValidCpf = (digits) => {
  if (digits.length !== 11) return false;
  if (isRepeatedDigits(digits)) return false;
  const first = calcCpfDigit(digits, 10);
  const second = calcCpfDigit(`${digits.slice(0, 9)}${first}`, 11);
  return digits === `${digits.slice(0, 9)}${first}${second}`;
};

const calcCnpjDigit = (digits, weights) => {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
};

const isValidCnpj = (digits) => {
  if (digits.length !== 14) return false;
  if (isRepeatedDigits(digits)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const first = calcCnpjDigit(digits, weights1);
  const second = calcCnpjDigit(`${digits.slice(0, 12)}${first}`, weights2);
  return digits === `${digits.slice(0, 12)}${first}${second}`;
};

export const isValidCpfCnpj = (value) => {
  if (!value) return false;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
};
