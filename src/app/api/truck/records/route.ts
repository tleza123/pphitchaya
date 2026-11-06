import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getTruckRef,
  getTruckRecordRef,
  getTruckRecordsCol,
  getTruckMonthRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { getBangkokToday, getBangkokMonth } from '@/lib/payroll/dates';
import { calculateTruckRecordTotals } from '@/lib/truck/engine';
import { TruckDailyRecordDoc } from '@/lib/truck/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
    const monthParam = searchParams.get('month');
    const truckIdParam = searchParams.get('truckId');

    const shopId = getShopId();
    const monthKey = monthParam
      ? monthParam
      : (dateParam ? dateParam.slice(0, 7) : getBangkokMonth());

    let query: any = getTruckRecordsCol(monthKey, shopId);
    if (dateParam) {
      query = query.where('dateKey', '==', dateParam);
    }
    if (truckIdParam) {
      query = query.where('truckId', '==', truckIdParam);
    }

    const snap = await query.get();
    const docs = snap?.docs || [];
    const records: TruckDailyRecordDoc[] = docs.map((doc: any) => {
      const d = doc.data();
      return {
        recordId: doc.id,
        dateKey: d.dateKey,
        monthKey: d.monthKey,
        truckId: d.truckId,
        plateNumberSnapshot: d.plateNumberSnapshot || '',
        driverNameSnapshot: d.driverNameSnapshot || '',
        fuelCostSatang: d.fuelCostSatang || 0,
        totalDriverPaySatang: d.totalDriverPaySatang || 0,
        tripCount: d.tripCount || 0,
        trips: d.trips || [],
        photos: d.photos || [],
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || '',
        updatedBy: d.updatedBy || ''
      };
    });

    return createSuccessResponse({
      monthKey,
      records
    });
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await verifyOwner(req);
    const body = await req.json();
    const {
      dateKey,
      truckId,
      trips,
      fuelCostSatang,
      photos,
      expectedRevision,
      requestId
    } = body;

    if (!requestId || typeof requestId !== 'string' || requestId.length < 5) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }
    if (typeof expectedRevision !== 'number' || expectedRevision < 0) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ expectedRevision ให้ถูกต้อง', 422);
    }
    if (!dateKey || typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return createErrorResponse('INVALID_DATE', 'รูปแบบวันที่ไม่ถูกต้อง', 422);
    }
    if (!truckId || typeof truckId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุเลือกรถสิบล้อ', 422);
    }
    if (!Array.isArray(trips)) {
      return createErrorResponse('INVALID_INPUT', 'รายการเที่ยววิ่งไม่ถูกต้อง', 422);
    }
    if (photos !== undefined && !Array.isArray(photos)) {
      return createErrorResponse('INVALID_INPUT', 'ข้อมูลรูปภาพไม่ถูกต้อง', 422);
    }
    if (Array.isArray(photos) && photos.length > 5) {
      return createErrorResponse('INVALID_INPUT', 'สามารถแนบรูปภาพได้ไม่เกิน 5 รูป', 422);
    }

    let totals: { totalDriverPaySatang: number; tripCount: number };
    try {
      totals = calculateTruckRecordTotals(trips, Number(fuelCostSatang ?? 0));
    } catch {
      return createErrorResponse('INVALID_MONEY', 'ยอดเงินค่าน้ำมันหรือค่าเที่ยวคนขับไม่ถูกต้อง', 422);
    }

    const monthKey = dateKey.slice(0, 7);
    const recordId = `${dateKey}_${truckId}`;
    const shopId = getShopId();
    const db = getAdminFirestore();

    const payloadHash = computePayloadHash(owner.uid, 'POST', recordId, {
      dateKey,
      truckId,
      trips,
      fuelCostSatang: Number(fuelCostSatang ?? 0),
      expectedRevision,
      photos: photos || []
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const recordRef = getTruckRecordRef(monthKey, recordId, shopId);
    const truckRef = getTruckRef(truckId, shopId);
    const monthRef = getTruckMonthRef(monthKey, shopId);

    const result = await db.runTransaction(async tx => {
      // 1. Strict Read phase (All reads must precede writes)
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const [recSnap, truckSnap, monthSnap] = await tx.getAll(recordRef, truckRef, monthRef);

      const exists = recSnap.exists;
      const current = exists ? recSnap.data() : null;
      const currentRevision = exists ? (current?.revision || 0) : 0;

      if (currentRevision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const truckData = truckSnap.exists ? truckSnap.data() : null;
      const plateNumberSnapshot = truckData?.plateNumber || current?.plateNumberSnapshot || truckId;
      const driverNameSnapshot = truckData?.driverName || current?.driverNameSnapshot || '';

      // 2. Write phase
      const now = new Date().toISOString();
      const newRevision = currentRevision + 1;
      const finalPhotos = Array.isArray(photos) ? photos : (current?.photos || []);

      const recordData: TruckDailyRecordDoc = {
        recordId,
        dateKey,
        monthKey,
        truckId,
        plateNumberSnapshot,
        driverNameSnapshot,
        fuelCostSatang: Number(fuelCostSatang ?? 0),
        totalDriverPaySatang: totals.totalDriverPaySatang,
        tripCount: totals.tripCount,
        trips,
        photos: finalPhotos,
        revision: newRevision,
        createdAt: current?.createdAt || now,
        updatedAt: now,
        updatedBy: owner.uid
      };

      tx.set(recordRef, recordData);
      tx.set(monthRef, { monthKey, updatedAt: now }, { merge: true });

      recordAudit(
        tx,
        shopId,
        owner.uid,
        exists ? 'UPDATE_TRUCK_RECORD' : 'CREATE_TRUCK_RECORD',
        recordId,
        current,
        recordData,
        requestId
      );

      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'POST',
        entityKey: recordId,
        payloadHash,
        response: recordData,
        createdAt: now
      });

      return recordData;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
