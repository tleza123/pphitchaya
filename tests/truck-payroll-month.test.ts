import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTruckPayroll, type PayrollTrip } from '../src/lib/truck/payroll';

test('payroll uses departure dates and never adds legacy confirmed daily wages',()=>{
  const trip:PayrollTrip={tripId:'t1',driverId:'d1',driverName:'สมชาย',departureDate:'2026-11-30',arrivalDate:'2026-12-02',status:'COMPLETED',driverPaySatang:15000,driverExtraSatang:0,origin:'A',destination:'B',plate:'1'};
  const days=['2026-11-30','2026-12-01','2026-12-02'].map(date=>({date,driverId:'d1',driverName:'สมชาย',baseSatang:30000}));
  assert.equal(calculateTruckPayroll('2026-11',days,[trip]).drivers[0].totalSatang,15000);
  assert.equal(calculateTruckPayroll('2026-12',days,[trip]).drivers.length,0);
  const withoutArrival=calculateTruckPayroll('2026-11',days,[{...trip,status:'OPEN',arrivalDate:null}]);
  assert.equal(withoutArrival.canClose,true); assert.equal(withoutArrival.drivers[0].totalSatang,15000); assert.deepEqual(withoutArrival.pending,[]);
  assert.equal(calculateTruckPayroll('2026-11',days,[{...trip,status:'OPEN',arrivalDate:null,driverPaySatang:null}]).canClose,false,'Missing wages still need review before closing');
  const result=calculateTruckPayroll('2026-11',[days[0],days[0]],[trip,{...trip,tripId:'t2'},{...trip,tripId:'t3',departureDate:'2026-11-29'}, {...trip,tripId:'cancelled',departureDate:'2026-11-28',status:'CANCELLED'}]);
  assert.equal(result.payBasis,'TRIPS_ONLY');
  assert.equal(result.drivers[0].totalSatang,45000);
  assert.equal(result.drivers[0].baseSatang,0);
  assert.deepEqual(result.drivers[0].days,[]);
  assert.deepEqual(result.drivers[0].departureDates,['2026-11-29','2026-11-30']);
});

test('arrival and the next departure on the same date never add a second workday or daily wage',()=>{
  const first:PayrollTrip={tripId:'first',driverId:'d1',driverName:'สมชาย',departureDate:'2026-11-30',arrivalDate:'2026-12-01',status:'COMPLETED',driverPaySatang:15000,origin:'A',destination:'B',plate:'1'};
  const onward:PayrollTrip={...first,tripId:'onward',departureDate:'2026-12-01',arrivalDate:'2026-12-01',origin:'B',destination:'C',driverPaySatang:20000};
  const third:PayrollTrip={...onward,tripId:'third',arrivalDate:'2026-12-02',origin:'C',destination:'D',driverPaySatang:10000};
  const trips=[first,onward,third];
  const combined=calculateTruckPayroll('2026-11',[],trips,{start:'2026-11-30',end:'2026-12-02'}).drivers[0];
  assert.deepEqual(combined.departureDates,['2026-11-30','2026-12-01']);
  assert.equal(combined.trips.length,3);
  assert.equal(combined.totalSatang,45000);
  assert.equal(combined.baseSatang,0);
  const december=calculateTruckPayroll('2026-12',[],trips).drivers[0];
  assert.deepEqual(december.departureDates,['2026-12-01']);
  assert.equal(december.totalSatang,30000,'Only December departures are paid in December');
  const noArrival=calculateTruckPayroll('2026-12',[],trips.map(trip=>({...trip,arrivalDate:null}))).drivers[0];
  assert.deepEqual(noArrival, {...december,trips:december.trips.map(trip=>({...trip,arrivalDate:null}))},'Adding arrival dates cannot change days or money');
});

test('v3 payroll rejects new driver extras but retains explicitly migrated historic entitlements',()=>{
  const trip:PayrollTrip={tripId:'v3',pricingVersion:3,driverId:'d1',driverName:'สมชาย',departureDate:'2026-11-30',arrivalDate:'2026-12-02',status:'COMPLETED',driverPaySatang:15000,origin:'A',destination:'B',plate:'1'};
  const days=[{date:'2026-11-30',driverId:'d1',driverName:'สมชาย',baseSatang:30000}];
  assert.throws(()=>calculateTruckPayroll('2026-11',days,[{...trip,driverExtraSatang:10000}]),/UNSUPPORTED_PRICING_FIELDS/);
  const result=calculateTruckPayroll('2026-11',days,[{...trip,legacyDriverExtraSatang:5000}]);
  assert.equal(result.drivers[0].tripSatang,15000);
  assert.equal(result.drivers[0].extraSatang,5000);
  assert.equal(result.drivers[0].totalSatang,20000);
  assert.equal(result.pricingVersion,3);
});
