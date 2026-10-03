import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHOP_NAME, displayShopName } from '../src/lib/shop-name';

test('previous starter name is hidden while a custom shop name remains visible', () => {
  assert.equal(displayShopName('DE TEAM'), DEFAULT_SHOP_NAME);
  assert.equal(displayShopName(' de   team '), DEFAULT_SHOP_NAME);
  assert.equal(displayShopName('ร้านตัวอย่าง'), 'ร้านตัวอย่าง');
});
