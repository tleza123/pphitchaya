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
