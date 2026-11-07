import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatWeightTons, parseTonsToKg, validateWeightKg } from '../src/lib/truck/weight';

test('weight preserves unknown, zero and exact thousandths of a ton', () => {
  assert.equal(parseTonsToKg(''), null);
  assert.equal(parseTonsToKg('0'), 0);
  assert.equal(formatWeightTons(0), '0.000');
  assert.equal(parseTonsToKg('12.345'), 12345);
  assert.equal(formatWeightTons(null), 'ยังไม่ระบุ');
});

test('weight rejects imprecise, negative and unsafe values', () => {
  for (const value of ['1.0001', '-1', 'NaN', 'Infinity', '9007199254741']) {
    assert.throws(() => parseTonsToKg(value), /INVALID_WEIGHT/);
  }
  for (const value of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateWeightKg(value), /INVALID_WEIGHT/);
  }
});
