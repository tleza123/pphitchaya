import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTruckPayroll, type PayrollTrip } from '../src/lib/truck/payroll';

test('cross-month trip stays in departure month while daily wages follow confirmed dates',()=>{
  const trip:PayrollTrip={tripId:'t1',driverId:'d1',driverName:'สมชาย',departureDate:'2026-11-30',arrivalDate:'2026-12-02',status:'COMPLETED',driverPaySatang:15000,driverExtraSatang:0,origin:'A',destination:'B',plate:'1'};
  const days=['2026-11-30','2026-12-01','2026-12-02'].map(date=>({date,driverId:'d1',driverName:'สมชาย',baseSatang:30000}));
  assert.equal(calculateTruckPayroll('2026-11',days,[trip]).drivers[0].totalSatang,45000);
  assert.equal(calculateTruckPayroll('2026-12',days,[trip]).drivers[0].totalSatang,60000);
  assert.equal(calculateTruckPayroll('2026-11',days,[{...trip,status:'OPEN',arrivalDate:null}]).canClose,false);
  assert.throws(()=>calculateTruckPayroll('2026-11',[days[0],days[0]],[trip]),/DUPLICATE_WORKDAY/);
});
