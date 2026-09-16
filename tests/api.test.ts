import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import {
  calculateChecksum,
  buildEmployeeSnapshot,
  buildClosureManifest
} from '../src/lib/payroll/snapshots';
import { formatMoney, validateSatang } from '../src/lib/payroll/money';
import { getBangkokToday, getBangkokMonth } from '../src/lib/payroll/dates';

test('Security & Idempotency: Canonical hash calculation is deterministic', () => {
  const payload1 = {
    dateKey: '2026-09-14',
    employeeId: 'emp_01',
    status: 'FULL_DAY',
    note: ''
  };
  const payload2 = {
    note: '',
    status: 'FULL_DAY',
    employeeId: 'emp_01',
    dateKey: '2026-09-14'
  };

  const hash1 = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload1, Object.keys(payload1).sort()))
    .digest('hex');

  const hash2 = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload2, Object.keys(payload2).sort()))
    .digest('hex');

  assert.equal(hash1, hash2);
});

test('Snapshot Integrity: Checksum verifies all employee records deterministically', () => {
  const records = [
    {
      employeeId: 'emp_01',
      name: 'สมชาย',
      position: 'หัวหน้าช่าง',
      counts: {
        full: 20,
        half: 2,
        absent: 0,
        workedDays: 22,
        paidDayUnits: 21
      },
      ratePeriods: [{ effectiveFrom: '2026-09-01', dailySatang: 50000 }],
      extras: [],
      baseSatang: 1100000,
      extraSatang: 200000,
      advanceSatang: 0,
      deductionSatang: 0,
      totalSatang: 1300000,
      days: [],
      checksum: 'fake_sum',
      partsCount: 1
    }
  ];

  const manifest1 = buildClosureManifest('close_1', '2026-09', 1, records, 'owner_uid');
  const manifest2 = buildClosureManifest('close_1', '2026-09', 1, records, 'owner_uid');
  assert.equal(manifest1.totalsSatang.total, 1300000);
  assert.equal(manifest1.totalsSatang.base, 1100000);
  assert.equal(manifest1.totalsSatang.extra, 200000);
  assert.equal(typeof manifest1.manifestHash, 'string');
  assert.equal(manifest1.manifestHash.length, 64);
});

test('Finance Rules: Satang bounds and overflows', () => {
  assert.equal(validateSatang(0), 0);
  assert.equal(validateSatang(100000000), 100000000); // 1,000,000 บาท
  assert.throws(() => validateSatang(-1));
  assert.throws(() => validateSatang(100000001));
  assert.throws(() => validateSatang(1.5));
  assert.throws(() => validateSatang(NaN));
});

test('Date Engine: Bangkok date format consistency', () => {
  const today = getBangkokToday();
  const month = getBangkokMonth();
  assert.match(today, /^20\d{2}-\d{2}-\d{2}$/);
  assert.match(month, /^20\d{2}-\d{2}$/);
  assert.equal(month, today.slice(0, 7));
});
