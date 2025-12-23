import test from 'node:test';
import assert from 'node:assert/strict';
import { toDbMoney, toReais } from '../src/utils/money.js';

test('toReais converte centavos para reais', () => {
  assert.strictEqual(toReais(12345), 123.45);
});

test('toDbMoney converte reais para centavos', () => {
  assert.strictEqual(toDbMoney(123.45), 12345);
});
