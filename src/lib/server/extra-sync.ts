import 'server-only';
import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import {
  getMonthRef,
  getMonthsCol,
  getEmployeesCol,
  getExtraTemplatesCol,
  getMonthlyExtrasCol,
  getExtraReviewsCol,
  getFinanceControlRef
} from './repository';
import { monthKey, getBangkokMonth } from '../payroll/dates';

export interface EnsureExtrasResult {
  month: string;
  createdCount: number;
  updatedCount: number;
}

/**
 * Ensures all regular allowance templates (เงินพิเศษประจำ) for active employees
 * are synchronized into the monthly extras collection for the given open month.
 *
 * Adheres strictly to the Firestore rule:
 * All transaction reads MUST be executed before any transaction writes.
 */
export async function ensureMonthExtrasPrepared(
  db: admin.firestore.Firestore,
  shopId: string,
  rawMonth: string,
  actorUid = 'system'
): Promise<EnsureExtrasResult> {
  const targetMonth = monthKey(rawMonth);
  const monthRef = getMonthRef(targetMonth, shopId);
  const controlRef = getFinanceControlRef(shopId);

  const executeSync = async (tx: {
    get: (ref: any) => Promise<any>;
    set: (ref: any, data: any, opts?: any) => any;
    update: (ref: any, data: any) => any;
  }) => {
    // ==========================================
    // 1. ALL READS (Phase 1)
    // ==========================================

    const [monthSnap, controlSnap] = await Promise.all([
      tx.get(monthRef),
      tx.get(controlRef)
    ]);

    const monthData = monthSnap?.exists ? monthSnap.data() : null;
    // Never modify closed months
    if (monthData?.state === 'CLOSED') {
      return { month: targetMonth, createdCount: 0, updatedCount: 0 };
    }

    const controlData = controlSnap?.exists ? controlSnap.data() : null;
    // If month is currently being closed by an active job, skip concurrent modification
    if (controlData?.closingMonth === targetMonth && controlData?.activeCloseJobId) {
      return { month: targetMonth, createdCount: 0, updatedCount: 0 };
    }

    const monthlyExtrasCol = getMonthlyExtrasCol(targetMonth, shopId);
    const [employeesSnap, existingExtrasSnap] = await Promise.all([
      tx.get(getEmployeesCol(shopId)),
      tx.get(monthlyExtrasCol)
    ]);

    if (!employeesSnap || !Array.isArray(employeesSnap.docs)) {
      return { month: targetMonth, createdCount: 0, updatedCount: 0 };
    }

    // Filter relevant active employees
    const activeEmployees = employeesSnap.docs.filter((empDoc: any) => {
      const emp = empDoc.data();
      if (!emp) return false;
      if (emp.endDate && emp.endDate < `${targetMonth}-01`) return false;
      if (emp.startDate && emp.startDate > `${targetMonth}-31`) return false;
      if (emp.suspended || emp.status === 'SUSPENDED') return false;
      return true;
    });

    // Fetch all extra templates and reviews for all active employees (ALL READS)
    const [allTemplatesSnaps, allReviewSnaps] = await Promise.all([
      Promise.all(activeEmployees.map((empDoc: any) => tx.get(getExtraTemplatesCol(empDoc.id, shopId)))),
      Promise.all(activeEmployees.map((empDoc: any) => tx.get(getExtraReviewsCol(targetMonth, shopId).doc(empDoc.id))))
    ]);

    // ==========================================
    // 2. ALL WRITES (Phase 2)
    // No more tx.get() calls after this point!
    // ==========================================

    const existingByTemplate = new Map<string, any>();
    if (existingExtrasSnap && Array.isArray(existingExtrasSnap.docs)) {
      existingExtrasSnap.docs.forEach((doc: any) => {
        const d = doc.data();
        if (d?.sourceTemplateId) {
          existingByTemplate.set(`${d.employeeId}:${d.sourceTemplateId}`, doc);
        }
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    const now = new Date().toISOString();

    for (let i = 0; i < activeEmployees.length; i++) {
      const empDoc = activeEmployees[i];
      const empId = empDoc.id;
      const templatesSnap = allTemplatesSnaps[i];
      const reviewSnap = allReviewSnaps[i];

      if (templatesSnap && Array.isArray(templatesSnap.docs)) {
        for (const tDoc of templatesSnap.docs) {
          const t = tDoc.data();
          if (!t) continue;
          // Regular allowances apply to all months the employee is active.
          // Do not skip past months even if the template's effectiveFromMonth was stamped with a later month.
          // Only skip if the template was explicitly marked to end before this month.
          if (t.effectiveToMonth && t.effectiveToMonth < targetMonth) continue;

          const key = `${empId}:${t.templateId}`;
          const existingDoc = existingByTemplate.get(key);

          if (!existingDoc) {
            const extraId = 'extra_' + crypto.randomUUID();
            const extraRef = monthlyExtrasCol.doc(extraId);
            const extraData = {
              extraId,
              employeeId: empId,
              monthKey: targetMonth,
              label: t.label || t.name,
              amountSatang: t.amountSatang,
              type: 'BONUS',
              sourceTemplateId: t.templateId,
              sourceTemplateVersion: t.version || 1,
              manuallyOverridden: false,
              revision: 1,
              createdAt: now,
              updatedAt: now
            };
            tx.set(extraRef, extraData);
            createdCount++;
          } else {
            const exData = existingDoc.data();
            // If not soft-deleted and not manually overridden, sync latest changes from template
            if (exData && !exData.deletedAt && !exData.manuallyOverridden) {
              const expectedLabel = t.label || t.name;
              const labelChanged = exData.label !== expectedLabel;
              const amountChanged = exData.amountSatang !== t.amountSatang;
              if (labelChanged || amountChanged) {
                tx.update(existingDoc.ref, {
                  label: expectedLabel,
                  amountSatang: t.amountSatang,
                  sourceTemplateVersion: t.version || 1,
                  revision: (exData.revision || 1) + 1,
                  updatedAt: now
                });
                updatedCount++;
              }
            }
          }
        }
      }

      // Ensure review tracking exists for this employee
      if (!reviewSnap?.exists) {
        const reviewRef = getExtraReviewsCol(targetMonth, shopId).doc(empId);
        tx.set(reviewRef, {
          employeeId: empId,
          extrasRevision: 1,
          reviewedExtrasRevision: 1,
          autoConfirmed: true,
          confirmedAt: now,
          confirmedBy: actorUid
        });
      }
    }

    return {
      month: targetMonth,
      createdCount,
      updatedCount
    };
  };

  if (typeof db?.runTransaction === 'function') {
    return await db.runTransaction(executeSync);
  }

  // Fallback for mock environments without runTransaction
  const directTx = {
    get: async (ref: any) => ref.get(),
    set: (ref: any, data: any, opts?: any) => {
      if (typeof ref.set === 'function') return ref.set(data, opts);
    },
    update: (ref: any, data: any) => {
      if (typeof ref.update === 'function') return ref.update(data);
    }
  };
  return await executeSync(directTx);
}

/**
 * Automatically synchronizes regular extra templates across all open months
 * (both current month and past open months) from the earliest active employee
 * start date up to the current Bangkok month.
 */
export async function syncAllActiveOpenMonths(
  db: admin.firestore.Firestore,
  shopId: string,
  actorUid = 'system'
): Promise<EnsureExtrasResult[]> {
  const currentMonth = getBangkokMonth();
  const employeesCol = getEmployeesCol(shopId);
  const monthsCol = getMonthsCol(shopId);

  const [employeesSnap, monthsSnap] = await Promise.all([
    employeesCol.get(),
    monthsCol.get()
  ]);

  if (!employeesSnap || !Array.isArray(employeesSnap.docs) || employeesSnap.docs.length === 0) {
    return [];
  }

  // Find the earliest start month among active employees
  let earliestMonth = currentMonth;
  employeesSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    if (data?.startDate && typeof data.startDate === 'string') {
      const startM = data.startDate.slice(0, 7);
      if (startM < earliestMonth) {
        earliestMonth = startM;
      }
    }
  });

  // Bound by system start boundary ('2026-08')
  if (earliestMonth < '2026-08') {
    earliestMonth = '2026-08';
  }

  const closedMonths = new Set<string>();
  if (monthsSnap && Array.isArray(monthsSnap.docs)) {
    monthsSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data?.state === 'CLOSED') {
        closedMonths.add(doc.id);
      }
      if (doc.id < earliestMonth && doc.id >= '2026-08') {
        earliestMonth = doc.id;
      }
    });
  }

  const [startYear, startMonthNum] = earliestMonth.split('-').map(Number);
  const [currentYear, currentMonthNum] = currentMonth.split('-').map(Number);

  const monthsToSync: string[] = [];
  let y = startYear;
  let m = startMonthNum;
  while (y < currentYear || (y === currentYear && m <= currentMonthNum)) {
    const mStr = `${y}-${String(m).padStart(2, '0')}`;
    if (!closedMonths.has(mStr)) {
      monthsToSync.push(mStr);
    }
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  const results: EnsureExtrasResult[] = [];
  for (const mStr of monthsToSync) {
    const res = await ensureMonthExtrasPrepared(db, shopId, mStr, actorUid);
    results.push(res);
  }

  return results;
}
