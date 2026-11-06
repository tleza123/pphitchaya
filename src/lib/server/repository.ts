import 'server-only';
import * as admin from 'firebase-admin';
import { getAdminFirestore } from '../firebase/admin';

export function getShopId(): string {
  return process.env.SHOP_ID || 'main';
}

export function getShopDocRef(shopId = getShopId()): admin.firestore.DocumentReference {
  const db = getAdminFirestore();
  return db.collection('shops').doc(shopId);
}

export function getProfileRef(shopId = getShopId()): admin.firestore.DocumentReference {
  return getShopDocRef(shopId).collection('profile').doc('main');
}

export function getFinanceControlRef(shopId = getShopId()): admin.firestore.DocumentReference {
  return getShopDocRef(shopId).collection('control').doc('finance');
}

export function getEmployeesCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('employees');
}

export function getEmployeeRef(employeeId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getEmployeesCol(shopId).doc(employeeId);
}

export function getEmployeePhotoRef(employeeId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getShopDocRef(shopId).collection('employeePhotos').doc(employeeId);
}

export function getRatesCol(employeeId: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getEmployeeRef(employeeId, shopId).collection('rates');
}

export function getExtraTemplatesCol(employeeId: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getEmployeeRef(employeeId, shopId).collection('extraTemplates');
}

export function getCalendarVersionsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('calendarVersions');
}

export function getCalendarOverridesCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('calendarOverrides');
}

export function getMonthsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('months');
}

export function getMonthRef(monthKey: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getMonthsCol(shopId).doc(monthKey);
}

export function getAttendanceCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getMonthRef(monthKey, shopId).collection('attendance');
}

export function getMonthlyExtrasCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getMonthRef(monthKey, shopId).collection('extras');
}

export function getExtraReviewsCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getMonthRef(monthKey, shopId).collection('extraReviews');
}

export function getClosuresCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getMonthRef(monthKey, shopId).collection('closures');
}

export function getCloseJobsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('closeJobs');
}

export function getRequestsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('requests');
}

export function getAuditCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('audit');
}

export function getTruckProfileRef(shopId = getShopId()): admin.firestore.DocumentReference {
  return getShopDocRef(shopId).collection('profile').doc('truck');
}

export function getLineSettingsRef(shopId = getShopId()): admin.firestore.DocumentReference {
  return getShopDocRef(shopId).collection('profile').doc('line');
}

export function getTrucksCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('trucks');
}

export function getTruckRef(truckId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTrucksCol(shopId).doc(truckId);
}

export function getTruckOriginsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckOrigins');
}

export function getTruckOriginRef(originId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTruckOriginsCol(shopId).doc(originId);
}

export function getTruckDestinationsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckDestinations');
}

export function getTruckDestinationRef(destId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTruckDestinationsCol(shopId).doc(destId);
}

export function getTruckMonthsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckMonths');
}

export function getTruckMonthRef(monthKey: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTruckMonthsCol(shopId).doc(monthKey);
}

export function getTruckRecordsCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getTruckMonthRef(monthKey, shopId).collection('records');
}

export function getTruckRecordRef(monthKey: string, recordId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTruckRecordsCol(monthKey, shopId).doc(recordId);
}

export function getTruckPhotosCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckPhotos');
}

export function getTruckDriversCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckDrivers');
}
export function getTruckCustomersCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckCustomers');
}
export function getTruckTariffsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckTariffs');
}
export function getTruckLocationsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckLocations');
}
export function getTruckWorkDaysCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getTruckMonthRef(monthKey, shopId).collection('workDays');
}
export function getTruckTripsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckTrips');
}
export function getTruckPayrollCol(monthKey: string, shopId = getShopId()): admin.firestore.CollectionReference {
  return getTruckMonthRef(monthKey, shopId).collection('payroll');
}
export function getTruckInvoicesCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckInvoices');
}
export function getTruckPaymentsCol(shopId = getShopId()): admin.firestore.CollectionReference {
  return getShopDocRef(shopId).collection('truckPayments');
}

export function getTruckPhotoRef(photoId: string, shopId = getShopId()): admin.firestore.DocumentReference {
  return getTruckPhotosCol(shopId).doc(photoId);
}


/**
 * Record an audit entry in Firestore.
 */
export function recordAudit(
  transaction: admin.firestore.Transaction,
  shopId: string,
  actorUid: string,
  action: string,
  entityKey: string,
  before: unknown,
  after: unknown,
  requestId?: string,
  reason?: string
): void {
  const auditRef = getAuditCol(shopId).doc();
  transaction.set(auditRef, {
    actorUid,
    action,
    entityKey,
    before: before ?? null,
    after: after ?? null,
    reason: reason ?? null,
    requestId: requestId ?? null,
    createdAt: new Date().toISOString()
  });
}
