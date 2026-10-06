import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNavigationDetail, matchesReportSelection } from '../src/lib/client/navigation';
import { optionalMoney, employeeExtraTemplates } from '../src/lib/client/form-money';
import { MutationIntent } from '../src/lib/client/mutation-intent';

test('Retry after a lost response reuses its receipt id, while a new confirmed action gets a new id', () => {
  const intent = new MutationIntent();
  const payload = { employee: 'a', amount: '100', month: '2026-10' };
  const first = intent.requestId(payload);
  assert.equal(intent.requestId({ ...payload }), first);
  assert.notEqual(intent.requestId({ ...payload, employee: 'b' }), first);
  intent.complete();
  assert.notEqual(intent.requestId(payload), first);
});

test('Base navigation states do not create extra Back entries, nested forms and dialogs do', () => {
  assert.equal(hasNavigationDetail(null), false);
  assert.equal(hasNavigationDetail({ attendanceNavigation: { person: 'all', view: 'list', modal: false } }), false);
  assert.equal(hasNavigationDetail({ attendanceNavigation: { person: 'employee-a' } }), true);
  assert.equal(hasNavigationDetail({ attendanceNavigation: { modal: true } }), true);
});

test('A completed request for an old employee or month cannot replace the current report', () => {
  const current = { employeeId: 'employee-b', month: '2026-10' };
  assert.equal(matchesReportSelection(current, 'employee-a', '2026-10'), false);
  assert.equal(matchesReportSelection(current, 'employee-b', '2026-09'), false);
  assert.equal(matchesReportSelection({ ...current, employeeId: null }, 'employee-b', '2026-10'), false);
  assert.equal(matchesReportSelection(current, 'employee-b', '2026-10'), true);
});

test('Money forms reject partial numbers, rounding, overflow and incomplete extra rows', () => {
  assert.equal(optionalMoney(' '), 0);
  assert.equal(optionalMoney('450.25'), 45025);
  for (const input of ['12abc', '1e3', '0.001', '-1', '1000001', 'Infinity']) assert.throws(() => optionalMoney(input));
  assert.deepEqual(employeeExtraTemplates([{ name: '', amount: '' }, { name: ' ค่าล้างรถ ', amount: '50.50' }]),
    [{ name: 'ค่าล้างรถ', label: 'ค่าล้างรถ', amountSatang: 5050 }]);
  assert.throws(() => employeeExtraTemplates([{ name: 'ค่าล้างรถ', amount: '' }]));
  assert.throws(() => employeeExtraTemplates([{ name: '', amount: '100' }]));
});
