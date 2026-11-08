import { assertPayrollDatesOpen } from '@/lib/server/truck-payroll-lock';
import { assertTruckWritable } from '@/lib/server/truck-control';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getShopDocRef,
  getTruckTripsCol,
  getTruckRecordRef,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { TruckDailyRecordDoc } from '@/lib/truck/types';
import { needsLegacyPricingReview } from '@/lib/truck/pricing';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyOwner(req);
    const { id: recordId } = await params;
    const shopId = getShopId();

    const monthKey = recordId.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return createErrorResponse('INVALID_INPUT', 'รหัสใบงานไม่ถูกต้อง', 400);
    }

    const recordRef = getTruckRecordRef(monthKey, recordId, shopId);
    const snap = await recordRef.get();

    if (!snap.exists) {
      return createErrorResponse('NOT_FOUND', 'ไม่พบใบงานที่ต้องการ', 404);
    }

    const d = snap.data();
    const record: TruckDailyRecordDoc = {
      recordId: snap.id,
      dateKey: d?.dateKey,
      monthKey: d?.monthKey,
      truckId: d?.truckId,
      plateNumberSnapshot: d?.plateNumberSnapshot || '',
      driverNameSnapshot: d?.driverNameSnapshot || '',
      fuelCostSatang: d?.fuelCostSatang || 0,
      totalDriverPaySatang: d?.totalDriverPaySatang || 0,
      tripCount: d?.tripCount || 0,
      trips: d?.trips || [],
      photos: d?.photos || [],
      revision: d?.revision || 1,
      createdAt: d?.createdAt || '',
      updatedAt: d?.updatedAt || '',
      updatedBy: d?.updatedBy || ''
    };

    return createSuccessResponse(record);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const owner = await verifyOwner(req);
    const { id: recordId } = await params;
    const body = await req.json();
    const { expectedRevision, requestId } = body;

    if (!requestId || typeof requestId !== 'string') {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const monthKey = recordId.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      return createErrorResponse('INVALID_INPUT', 'รหัสใบงานไม่ถูกต้อง', 400);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();

    const payloadHash = computePayloadHash(owner.uid, 'DELETE', recordId, {
      recordId,
      expectedRevision
    });

    const requestRef = getRequestsCol(shopId).doc(requestId);
    const recordRef = getTruckRecordRef(monthKey, recordId, shopId);

    const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
      // 1. Strict Read phase (All reads must precede writes)
      const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
      if (cached) return cached;

      const snap = await tx.get(recordRef);
      if (!snap.exists) {
        return { deleted: true, recordId };
      }

      const current = snap.data();
      if (typeof expectedRevision === 'number' && current?.revision !== expectedRevision) {
        throw new Error('CONFLICT');
      }

      const months = [...new Set<string>([monthKey, ...(current?.trips || []).map((t: {accountingMonth?: string}) => t.accountingMonth || monthKey)])].filter(m => /^\d{4}-\d{2}$/.test(m));
      const locks = await tx.getAll(...months.map(m => getShopDocRef(shopId).collection('truckPayrollMonths').doc(m)));
      if (locks.some(lock => lock.data()?.state === 'CLOSED')) throw new Error('MONTH_CLOSED');
      await assertPayrollDatesOpen(tx, shopId, [current?.dateKey, ...(current?.trips || []).map((t: any) => t.departureDate || current?.dateKey)]);
      const migrated = await tx.get(getTruckTripsCol(shopId).where('legacyRecordId', '==', recordId));
      if (!migrated.empty) throw new Error('RECORD_MIGRATED');
      const trips: {tripId?: string}[] = current?.trips || [];
      if (trips.some(t => !t.tripId)) throw new Error('LEGACY_REVIEW_REQUIRED');
      const refs = trips.map(t => getTruckTripsCol(shopId).doc(t.tripId!));
      const tripSnaps = refs.length ? await tx.getAll(...refs) : [];
      if (tripSnaps.some(s => !s.exists)) throw new Error('TRIP_NOT_FOUND');
      if (tripSnaps.some(s => s.data()?.invoiceId)) throw new Error('TRIP_BILLED');
      if (tripSnaps.some(s => needsLegacyPricingReview(s.data()))) throw new Error('LEGACY_PRICING_REVIEW_REQUIRED');

      // 2. Write phase
      tx.delete(recordRef);
      for (const ref of refs) tx.delete(ref);

      recordAudit(
        tx,
        shopId,
        owner.uid,
        'DELETE_TRUCK_RECORD',
        recordId,
        current,
        null,
        requestId
      );

      const responsePayload = { deleted: true, recordId };
      recordRequestReceipt(tx, requestRef, {
        requestId,
        actorUid: owner.uid,
        method: 'DELETE',
        entityKey: recordId,
        payloadHash,
        response: responsePayload,
        createdAt: new Date().toISOString()
      });

      return responsePayload;
    });

    return createSuccessResponse(result, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    if (error.message === 'CONFLICT') {
      return createErrorResponse('CONFLICT', undefined, 409);
    }
    if (error.message === 'MONTH_CLOSED') return createErrorResponse('MONTH_CLOSED', 'รอบค่าแรงปิดแล้ว กรุณาเปิดรอบก่อนลบ', 409);
    if (error.message === 'RECORD_MIGRATED') return createErrorResponse('RECORD_MIGRATED', 'ใบงานนี้ย้ายเป็นเที่ยวแยกแล้ว ไม่สามารถลบผ่านใบงานเดิม', 409);
    if (error.message === 'TRIP_BILLED') return createErrorResponse('TRIP_BILLED', 'เที่ยวในใบงานนี้วางบิลแล้ว ไม่สามารถลบได้', 409);
    if (error.message === 'LEGACY_PRICING_REVIEW_REQUIRED') return createErrorResponse('LEGACY_PRICING_REVIEW_REQUIRED', 'ต้องตรวจราคาเดิมก่อนลบใบงาน', 409);
    if (error.message === 'REQUEST_ID_REUSED') {
      return createErrorResponse('REQUEST_ID_REUSED', undefined, 422);
    }
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
