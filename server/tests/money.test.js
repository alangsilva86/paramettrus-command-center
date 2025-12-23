import test from 'node:test';
import assert from 'node:assert/strict';
import { toReais } from '../src/utils/money.js';

test('toReais converte centavos para reais', () => {
  assert.strictEqual(toReais(12345), 123.45);
});
