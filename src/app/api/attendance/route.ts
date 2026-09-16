import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getMonthRef,
  getAttendanceCol,
  getEmployeesCol,
  getEmployeeRef,
  getFinanceControlRef,
  getCalendarVersionsCol,
  getCalendarOverridesCol,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { dateKey, getBangkokToday } from '@/lib/payroll/dates';
import { isWorkday, resolveWeekdaysForDate } from '@/lib/payroll/calendar';
import { employedOn } from '@/lib/payroll/engine';
import { validateSatang } from '@/lib/payroll/money';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { verifyFinanceGate } from '@/lib/server/finance-gate';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    if (!dateParam) {
      return createErrorResponse('INVALID_DATE', 'กรุณาระบุวันที่ที่ต้องการดู', 400);
    }
    const targetDate = dateKey(dateParam);
    const monthKey = targetDate.slice(0, 7);
    const shopId = getShopId();

    const monthSnap = await getMonthRef(monthKey, shopId).get();
    const monthData = monthSnap.exists ? monthSnap.data() : { state: 'OPEN', revision: 0 };
    const isClosed = monthData?.state === 'CLOSED';

    const employeesSnap = await getEmployeesCol(shopId).get();
    const eligibleEmployees = employeesSnap.docs
      .map(doc => ({
        employeeId: doc.id,
        ...doc.data()
      }))
      .filter((emp: any) => employedOn(emp, targetDate));

    // Calendar
    const calendarVersionsSnap = await getCalendarVersionsCol(shopId).get();
    const calendarVersions = calendarVersionsSnap.docs.map(doc => ({
      versionId: doc.id,
      ...doc.data()
    })) as any[];

    const overridesSnap = await getCalendarOverridesCol(shopId).get();
    const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
    overridesSnap.docs.forEach(doc => {
      overrides[doc.id] = doc.data().kind;
    });

    const activeWeekdays = resolveWeekdaysForDate(targetDate, calendarVersions);
    const workday = isWorkday(targetDate, activeWeekdays, overrides);

    // Attendance
    const attendanceSnap = await getAttendanceCol(monthKey, shopId)
      .where('dateKey', '==', targetDate)
      .get();
    const attendanceMap = new Map<string, any>();
    attendanceSnap.docs.forEach(doc => {
      const d = doc.data();
      attendanceMap.set(d.employeeId, {
        docId: doc.id,
        status: d.status,
        advanceSatang: typeof d.advanceSatang === 'number' ? d.advanceSatang : 0,
        deductionSatang: typeof d.deductionSatang === 'number' ? d.deductionSatang : 0,
        revision: d.revision,
        updatedAt: d.updatedAt,
        notes: d.notes || ''
      });
    });

    const items = eligibleEmployees.map((emp: any) => {
      const record = attendanceMap.get(emp.employeeId);
      return {
        employee: {
          employeeId: emp.employeeId,
          name: emp.name,
          nickname: emp.nickname || '',
          position: emp.position,
          photo: emp.photo ? { version: emp.photo.version } : null
        },
        attendance: record
          ? {
              status: record.status,
              advanceSatang: record.advanceSatang || 0,
              deductionSatang: record.deductionSatang || 0,
              revision: record.revision,
              updatedAt: record.updatedAt,
              notes: record.notes
            }
          : {
              status: 'UNMARKED',
              advanceSatang: 0,
              deductionSatang: 0,
              revision: 0,
              updatedAt: null,
              notes: ''
            }
      };
    });

    return createSuccessResponse({
      dateKey: targetDate,
      monthKey,
      isWorkday: workday,
      isClosed,
      items
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

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const { dateKey: rawDate, employeeId, status, expectedRevision, requestId, notes, advanceSatang, deductionSatang } = body;

    if (!requestId || typeof requestId !== 'string' || requestId.length < 10) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number' || expectedRevision < 0) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ให้ถูกต้อง', 422);
    }
    if (!employeeId || typeof employeeId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ employeeId', 422);
    }
    if (!['FULL', 'HALF', 'ABSENT', 'UNMARKED'].includes(status)) {
      return createErrorResponse('INVALID_INPUT', 'สถานะการเช็คชื่อไม่ถูกต้อง', 422);
    }

    let parsedAdvance: number | undefined = undefined;
    if (advanceSatang !== undefined && advanceSatang !== null) {
      const num = Number(advanceSatang);
      try {
        parsedAdvance = validateSatang(num);
      } catch {
        return createErrorResponse('INVALID_INPUT', 'จำนวนเงินเบิกล่วงหน้าไม่ถูกต้อง', 422);
      }
    }

    let parsedDeduction: number | undefined = undefined;
    if (deductionSatang !== undefined && deductionSatang !== null) {
      const num = Number(deductionSatang);
      try {
        parsedDeduction = validateSatang(num);
      } catch {
        return createErrorResponse('INVALID_INPUT', 'จำนวนเงินหักไม่ถูกต้อง', 422);
      }
    }

    const targetDate = dateKey(rawDate);
    const today = getBangkokToday();
    if (targetDate > today && status !== 'UNMARKED') {
      return createErrorResponse('INVALID_INPUT', 'ไม่สามารถเช็คชื่อวันอนาคตได้', 422);
    }

    const monthKey = targetDate.slice(0, 7);
    const shopId = getShopId();
    const db = getAdminFirestore();
    const entityKey = `${targetDate}|${employeeId}`;
    const payloadHash = computePayloadHash(owner.uid, 'POST', entityKey, {
      targetDate,
      employeeId,
      status,
      expectedRevision,
      advanceSatang: parsedAdvance !== undefined ? parsedAdvance : undefined,
      deductionSatang: parsedDeduction !== undefined ? parsedDeduction : undefined,
      notes: notes || ''
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const controlRef = getFinanceControlRef(shopId);
    const monthRef = getMonthRef(monthKey, shopId);
    const employeeRef = getEmployeeRef(employeeId, shopId);
    const attendanceDocId = `${targetDate}_${employeeId}`;
    const attendanceDocRef = getAttendanceCol(monthKey, shopId).doc(attendanceDocId);

    // Execute in Firestore transaction
    const result = await db.runTransaction(async tx => {
      // 1. Check idempotency receipt
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) {
        return cached;
      }

      // 2. Finance gate
      await verifyFinanceGate(tx, controlRef, monthRef, monthKey);

      // 3. Check employee employment bounds
      const empSnap = await tx.get(employeeRef);
      if (!empSnap.exists) {
        throw new Error('NOT_FOUND');
      }
      const emp = empSnap.data() as any;
      if (!employedOn({ ...emp, employeeId }, targetDate)) {
        throw new Error('OUTSIDE_EMPLOYMENT');
      }

      // 4. Check calendar: cannot mark FULL/HALF/ABSENT on HOLIDAY
      if (status !== 'UNMARKED') {
        const calendarVersionsSnap = await tx.get(getCalendarVersionsCol(shopId));
        const calendarVersions = calendarVersionsSnap.docs.map(d => ({
          versionId: d.id,
          ...d.data()
        })) as any[];
        const overrideSnap = await tx.get(getCalendarOverridesCol(shopId).doc(targetDate));
        const overrides: Record<string, 'WORKDAY' | 'HOLIDAY'> = {};
        if (overrideSnap.exists) {
          overrides[targetDate] = overrideSnap.data()?.kind;
        }
        const activeWeekdays = resolveWeekdaysForDate(targetDate, calendarVersions);
        if (!isWorkday(targetDate, activeWeekdays, overrides)) {
          throw new Error('ATTENDANCE_ON_HOLIDAY');
        }
      }

      // 5. Check attendance revision
      const attSnap = await tx.get(attendanceDocRef);
      const currentRevision = attSnap.exists ? attSnap.data()?.revision || 0 : 0;
      if (currentRevision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const newRevision = currentRevision + 1;
      const now = new Date().toISOString();
      const currentAdvance = attSnap.exists ? (typeof attSnap.data()?.advanceSatang === 'number' ? attSnap.data()?.advanceSatang : 0) : 0;
      const finalAdvance = parsedAdvance !== undefined ? parsedAdvance : currentAdvance;

      const currentDeduction = attSnap.exists ? (typeof attSnap.data()?.deductionSatang === 'number' ? attSnap.data()?.deductionSatang : 0) : 0;
      const finalDeduction = parsedDeduction !== undefined ? parsedDeduction : currentDeduction;

      const attendanceData = {
        dateKey: targetDate,
        employeeId,
        status,
        advanceSatang: finalAdvance,
        deductionSatang: finalDeduction,
        revision: newRevision,
        updatedAt: now,
        updatedBy: owner.uid,
        requestId,
        notes: notes ? String(notes).slice(0, 200) : ''
      };

      // Write attendance
      tx.set(attendanceDocRef, attendanceData);

      // Record audit
      recordAudit(
        tx,
        shopId,
        owner.uid,
        'SAVE_ATTENDANCE',
        entityKey,
        attSnap.exists ? attSnap.data() : null,
        attendanceData,
        requestId
      );

      // Record receipt
      const responsePayload = {
        dateKey: targetDate,
        employeeId,
        status,
        advanceSatang: finalAdvance,
        deductionSatang: finalDeduction,
        revision: newRevision,
        updatedAt: now
      };


      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey,
        payloadHash,
        response: responsePayload,
        createdAt: now
      });

      return responsePayload;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'MONTH_CLOSED') {
      return createErrorResponse('MONTH_CLOSED', undefined, 409);
    }
    if (error.message === 'MONTH_CLOSING') {
      return createErrorResponse('MONTH_CLOSING', undefined, 409);
    }
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
    if (error.message === 'OUTSIDE_EMPLOYMENT') {
      return createErrorResponse('INVALID_INPUT', 'วันที่นี้อยู่นอกช่วงการจ้างงานของพนักงาน', 422);
    }
    if (error.message === 'ATTENDANCE_ON_HOLIDAY') {
      return createErrorResponse('INVALID_INPUT', 'วันดังกล่าวเป็นวันหยุดตามตาราง กรุณาเพิ่มวันทำงานพิเศษก่อนเช็คชื่อ', 422);
    }
    return createErrorResponse(
      error.code || 'INTERNAL_ERROR',
      error.message,
      error.statusCode || 500
    );
  }
}
