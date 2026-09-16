import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getCloseJobsCol,
  getClosuresCol,
  getMonthRef,
  getFinanceControlRef,
  getEmployeeRef,
  getRatesCol,
  getAttendanceCol,
  getMonthlyExtrasCol,
  getExtraReviewsCol,
  getCalendarVersionsCol,
  getCalendarOverridesCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { getBangkokToday } from '@/lib/payroll/dates';
import { calculateEmployeeMonth, EmployeeRecord, RateRecord } from '@/lib/payroll/engine';
import { buildEmployeeSnapshot, buildClosureManifest, EmployeeSnapshot } from '@/lib/payroll/snapshots';

export const dynamic = 'force-dynamic';

const CHUNK_SIZE = 5;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { id: jobId } = await params;
    const shopId = getShopId();
    const db = getAdminFirestore();

    const jobRef = getCloseJobsCol(shopId).doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบงานปิดเดือน', 404);
    }

    const job = jobSnap.data() as any;
    if (job.status !== 'IN_PROGRESS') {
      return createSuccessResponse({
        status: job.status,
        cursor: job.cursor,
        totalEmployees: job.totalEmployees,
        errors: job.errors || []
      });
    }

    const { monthKey, closureId, employeeIds, cursor } = job;
    const today = getBangkokToday();

    // Check finance gate is still active for this job
    const controlSnap = await getFinanceControlRef(shopId).get();
    const control = controlSnap.data();
    if (control?.activeCloseJobId !== jobId || control?.closingMonth !== monthKey) {
      return createErrorResponse('CONFLICT', 'งานปิดเดือนนี้ถูกยกเลิกหรือหมดอายุแล้ว', 409);
    }

    const nextCursor = Math.min(cursor + CHUNK_SIZE, employeeIds.length);
    const currentBatchIds = employeeIds.slice(cursor, nextCursor);

    // Shared calendar
    const calendarVersionsSnap = await getCalendarVersionsCol(shopId).get();
    const calendarVersions = calendarVersionsSnap.docs.map(d => ({
      versionId: d.id,
      ...d.data()
    })) as any[];
    const overridesSnap = await getCalendarOverridesCol(shopId).get();
    const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
    overridesSnap.docs.forEach(doc => {
      overrides[doc.id] = doc.data().kind;
    });

    // Attendance
    const attendanceSnap = await getAttendanceCol(monthKey, shopId).get();
    const attendanceRecords = attendanceSnap.docs.map(d => d.data()) as any[];

    // Extras
    const extrasSnap = await getMonthlyExtrasCol(monthKey, shopId).get();
    const monthlyExtras = extrasSnap.docs
      .map(d => ({ extraId: d.id, ...d.data() }))
      .filter((x: any) => !x.deletedAt) as any[];

    const errors: string[] = [...(job.errors || [])];
    const snapshotsCol = getClosuresCol(monthKey, shopId)
      .doc(closureId)
      .collection('employees');

    for (const empId of currentBatchIds) {
      const empSnap = await getEmployeeRef(empId, shopId).get();
      if (!empSnap.exists) continue;
      const emp = { employeeId: empId, ...empSnap.data() } as EmployeeRecord;

      const ratesSnap = await getRatesCol(empId, shopId).get();
      const rates = ratesSnap.docs.map(d => ({
        rateId: d.id,
        employeeId: empId,
        ...d.data()
      })) as RateRecord[];

      // Check extra review
      const reviewSnap = await getExtraReviewsCol(monthKey, shopId).doc(empId).get();
      const review = reviewSnap.exists ? reviewSnap.data() : null;
      const isReviewed = review && review.confirmedAt && review.reviewedExtrasRevision === review.extrasRevision;
      if (!isReviewed) {
        errors.push(`${emp.name}: ยังไม่ได้ตรวจสอบเงินพิเศษของเดือนนี้`);
      }

      try {
        const calc = calculateEmployeeMonth({
          month: monthKey,
          today,
          systemStartDate: '2026-08-01',
          employee: emp,
          rates,
          attendance: attendanceRecords,
          extras: monthlyExtras,
          calendarVersions,
          calendar: overrides
        });

        if (calc.pending > 0) {
          errors.push(`${emp.name}: ยังมีวันที่ค้างการเช็คชื่อ ${calc.pending} วัน`);
        }

        const snapshot = buildEmployeeSnapshot(emp.name, emp.position, calc);
        await snapshotsCol.doc(empId).set(snapshot);
      } catch (err: any) {
        errors.push(`${emp.name}: ${err.message}`);
      }
    }

    // If errors encountered, mark job FAILED
    if (errors.length > 0) {
      await jobRef.update({
        status: 'FAILED',
        errors,
        updatedAt: new Date().toISOString()
      });

      return createSuccessResponse({
        status: 'FAILED',
        cursor: nextCursor,
        totalEmployees: employeeIds.length,
        errors
      });
    }

    // If more employees remain, update cursor and return
    if (nextCursor < employeeIds.length) {
      await jobRef.update({
        cursor: nextCursor,
        updatedAt: new Date().toISOString()
      });

      return createSuccessResponse({
        status: 'IN_PROGRESS',
        cursor: nextCursor,
        totalEmployees: employeeIds.length,
        errors: []
      });
    }

    // FINALIZE: All employees processed with 0 errors!
    const allSnapshotsDocs = await snapshotsCol.get();
    const allSnapshots = allSnapshotsDocs.docs.map(d => d.data() as EmployeeSnapshot);
    const manifest = buildClosureManifest(
      closureId,
      monthKey,
      job.sourceRevision,
      allSnapshots,
      owner.uid
    );

    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(monthKey, shopId);
    const closureRef = getClosuresCol(monthKey, shopId).doc(closureId);

    await db.runTransaction(async tx => {
      // Set closure manifest READY
      tx.set(closureRef, manifest);

      const now = new Date().toISOString();
      // Set month CLOSED
      tx.set(
        monthRef,
        {
          state: 'CLOSED',
          currentClosureId: closureId,
          closedAt: now,
          closedBy: owner.uid,
          revision: job.sourceRevision + 1,
          updatedAt: now
        },
        { merge: true }
      );

      // Release finance gate
      tx.set(
        controlRef,
        {
          closingMonth: null,
          activeCloseJobId: null,
          updatedAt: now
        },
        { merge: true }
      );

      // Update job to COMPLETED
      tx.update(jobRef, {
        status: 'COMPLETED',
        cursor: nextCursor,
        updatedAt: now
      });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'FINALIZE_CLOSE_MONTH',
        monthKey,
        { state: 'CLOSING' },
        { state: 'CLOSED', closureId, totals: manifest.totalsSatang }
      );
    });

    return createSuccessResponse({
      status: 'COMPLETED',
      cursor: nextCursor,
      totalEmployees: employeeIds.length,
      closureId,
      totals: manifest.totalsSatang,
      errors: []
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
