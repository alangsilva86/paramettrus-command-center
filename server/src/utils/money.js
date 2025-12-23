export const toReais = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (Number.isNaN(number)) return 0;
  return number / 100;
};

export const toReaisNullable = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (Number.isNaN(number)) return null;
  return number / 100;
};
