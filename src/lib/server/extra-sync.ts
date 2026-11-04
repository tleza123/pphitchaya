import 'server-only';
import crypto from 'node:crypto';
import * as admin from 'firebase-admin';
import {
  getMonthRef,
  getEmployeesCol,
  getExtraTemplatesCol,
  getMonthlyExtrasCol,
  getExtraReviewsCol,
  getFinanceControlRef
} from './repository';
import { monthKey } from '../payroll/dates';

export interface EnsureExtrasResult {
  month: string;
  createdCount: number;
  updatedCount: number;
}

/**
 * Ensures all regular allowance templates (เงินพิเศษประจำ) for active employees
 * are synchronized into the monthly extras collection for the given open month.
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
    // 1. Check month state
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

    const employeesSnap = await tx.get(getEmployeesCol(shopId));
    if (!employeesSnap || !Array.isArray(employeesSnap.docs)) {
      return { month: targetMonth, createdCount: 0, updatedCount: 0 };
    }

    const monthlyExtrasCol = getMonthlyExtrasCol(targetMonth, shopId);
    const existingExtrasSnap = await tx.get(monthlyExtrasCol);

    // Map existing extras by employeeId and templateId
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

    for (const empDoc of employeesSnap.docs) {
      const empId = empDoc.id;
      const emp = empDoc.data();
      if (!emp) continue;

      // Skip employees outside their active employment range for this month
      if (emp.endDate && emp.endDate < `${targetMonth}-01`) continue;
      if (emp.startDate && emp.startDate > `${targetMonth}-31`) continue;
      if (emp.suspended || emp.status === 'SUSPENDED') continue;

      const templatesSnap = await tx.get(getExtraTemplatesCol(empId, shopId));
      if (templatesSnap && Array.isArray(templatesSnap.docs)) {
        for (const tDoc of templatesSnap.docs) {
          const t = tDoc.data();
          if (!t) continue;
          if (t.effectiveFromMonth && t.effectiveFromMonth > targetMonth) continue;
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
      const reviewRef = getExtraReviewsCol(targetMonth, shopId).doc(empId);
      const reviewSnap = await tx.get(reviewRef);
      if (!reviewSnap?.exists) {
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
