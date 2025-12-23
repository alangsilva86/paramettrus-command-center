import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMoney, normalizeMoneyToDb } from '../src/utils/normalize.js';

test('normalizeMoney converte formato pt-BR', () => {
  assert.strictEqual(normalizeMoney('R$ 1.234,56'), 1234.56);
});

test('normalizeMoneyToDb converte reais para centavos', () => {
  assert.strictEqual(
    normalizeMoneyToDb('1.234,56', { sourceUnit: 'reais', dbUnit: 'centavos' }),
    123456
  );
});
