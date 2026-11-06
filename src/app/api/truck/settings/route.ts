import { assertTruckWritable } from '@/lib/server/truck-control';
import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getTruckProfileRef,
  getLineSettingsRef,
  getTrucksCol,
  getTruckRef,
  getTruckOriginsCol,
  getTruckOriginRef,
  getTruckDestinationsCol,
  getTruckDestinationRef,
  getTruckDriversCol,
  getTruckCustomersCol,
  getTruckTariffsCol,
  getTruckLocationsCol,
  getRequestsCol,
  recordAudit
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { computePayloadHash, checkRequestReceipt, recordRequestReceipt } from '@/lib/server/idempotency';
import { validateSatang } from '@/lib/payroll/money';
import { TruckDoc, TruckOriginDoc, TruckDestinationDoc } from '@/lib/truck/types';

export const dynamic = 'force-dynamic';

function maskToken(token?: string): string {
  if (!token) return '';
  const clean = token.trim();
  if (clean.length === 0) return '';
  if (clean.length <= 4) return '••••';
  return '••••' + clean.slice(-4);
}

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();

    const [profileSnap, lineSnap, trucksSnap, originsSnap, destinationsSnap, driversSnap, customersSnap, tariffsSnap, locationsSnap] = await Promise.all([
      getTruckProfileRef(shopId).get(),
      getLineSettingsRef(shopId).get(),
      getTrucksCol(shopId).get(),
      getTruckOriginsCol(shopId).get(),
      getTruckDestinationsCol(shopId).get(), getTruckDriversCol(shopId).get(), getTruckCustomersCol(shopId).get(), getTruckTariffsCol(shopId).get(), getTruckLocationsCol(shopId).get()
    ]);

    const rawProfile = profileSnap.exists ? profileSnap.data() : null;
    const truckProfile = {
      companyName: rawProfile?.companyName || 'ระบบบันทึกงานรถสิบล้อ',
      address: rawProfile?.address || '', phone:rawProfile?.phone || '', taxId:rawProfile?.taxId || '',
      revision: rawProfile?.revision || 1
    };

    const lineData = lineSnap.exists ? lineSnap.data() : null;
    const rawToken = lineData?.channelAccessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
    const lineSettings = {
      channelAccessTokenMasked: maskToken(rawToken),
      defaultTargetId: lineData?.defaultTargetId ?? process.env.LINE_DEFAULT_TARGET_ID ?? '',
      attendanceTargetId: lineData?.attendanceTargetId ?? process.env.LINE_ATTENDANCE_TARGET_ID ?? '',
      truckTargetId: lineData?.truckTargetId ?? process.env.LINE_TRUCK_TARGET_ID ?? '',
      dailySummaryEnabled: typeof lineData?.dailySummaryEnabled === 'boolean'
        ? lineData.dailySummaryEnabled
        : (process.env.LINE_DAILY_SUMMARY_ENABLED !== 'false'),
      dailySummaryHour: typeof lineData?.dailySummaryHour === 'number'
        ? lineData.dailySummaryHour
        : 19,
      revision: lineData?.revision || 1
    };

    const trucksDocs = trucksSnap?.docs || [];
    const trucks: TruckDoc[] = trucksDocs.map(doc => {
      const d = doc.data();
      return {
        truckId: doc.id,
        plateNumber: d.plateNumber || '',
        driverName: d.driverName || '',
        notes: d.notes || '',
        status: d.status || 'ACTIVE',
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    const originsDocs = originsSnap?.docs || [];
    const truckOrigins: TruckOriginDoc[] = originsDocs.map(doc => {
      const d = doc.data();
      return {
        originId: doc.id,
        name: d.name || '',
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    const destinationsDocs = destinationsSnap?.docs || [];
    const truckDestinations: TruckDestinationDoc[] = destinationsDocs.map(doc => {
      const d = doc.data();
      return {
        destinationId: doc.id,
        name: d.name || '',
        driverPaySatang: typeof d.driverPaySatang === 'number' ? d.driverPaySatang : 0,
        revision: d.revision || 1,
        createdAt: d.createdAt || '',
        updatedAt: d.updatedAt || ''
      };
    });

    return createSuccessResponse({
      truckProfile,
      lineSettings,
      trucks,
      truckOrigins,
      truckDestinations
      , truckDrivers: driversSnap.docs.map(d=>({driverId:d.id,...d.data()})), truckCustomers: customersSnap.docs.map(d=>({customerId:d.id,...d.data()})), truckTariffs: tariffsSnap.docs.map(d=>({tariffId:d.id,...d.data()})), truckLocations: locationsSnap.docs.map(d=>({locationId:d.id,...d.data()}))
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
    const action = body.action || (body.companyName ? 'UPDATE_PROFILE' : '');
    const requestId = body.requestId;

    if (!requestId || typeof requestId !== 'string' || requestId.length < 5) {
      return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ requestId ให้ถูกต้อง', 422);
    }

    const shopId = getShopId();
    const db = getAdminFirestore();
    const requestRef = getRequestsCol(shopId).doc(requestId);

    if (['UPSERT_LOCATION','DISABLE_LOCATION','UPSERT_TARIFF','DISABLE_TARIFF'].includes(action)) {
      const location = action.endsWith('LOCATION'); const disable = action.startsWith('DISABLE');
      const input = location ? body.location : body.tariff;
      const id = disable ? body.id : input?.id;
      if (id != null && (typeof id !== 'string' || !id || id.includes('/'))) return createErrorResponse('INVALID_INPUT', undefined, 422);
      const ref = id ? (location ? getTruckLocationsCol(shopId) : getTruckTariffsCol(shopId)).doc(id) : (location ? getTruckLocationsCol(shopId) : getTruckTariffsCol(shopId)).doc();
      if (!disable && location && (!input?.code?.trim() || !input?.name?.trim())) return createErrorResponse('INVALID_INPUT', 'ระบุรหัสและชื่อจุด', 422);
      if (!disable && !location) {
        if (!input?.originId || !input?.destinationId || input.originId === input.destinationId) return createErrorResponse('INVALID_INPUT', 'เลือกต้นทางและปลายทาง', 422);
        try { validateSatang(input.driverPaySatang); if (input.customerRateSatang != null) validateSatang(input.customerRateSatang); } catch { return createErrorResponse('INVALID_MONEY', undefined, 422); }
      }
      const hash = computePayloadHash(owner.uid, 'POST', action, body);
      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        const cached = await checkRequestReceipt(tx, requestRef, hash); if (cached) return cached;
        const snap = await tx.get(ref); const current = snap.exists ? snap.data() : null;
        if (disable && !current) throw new Error('NOT_FOUND');
        if ((current?.revision || 0) !== body.expectedRevision) throw new Error('CONFLICT');
        if (!disable) {
          const peers = await tx.get(location ? getTruckLocationsCol(shopId) : getTruckTariffsCol(shopId));
          const duplicate = peers.docs.some(d => { const x=d.data(); return d.id!==ref.id && x.status==='ACTIVE' && (location ? x.code.toUpperCase()===input.code.trim().toUpperCase() : x.originId===input.originId && x.destinationId===input.destinationId && (x.customerId||null)===(input.customerId||null)); });
          if (duplicate) throw new Error('DUPLICATE_MASTER');
          if (!location) {
            const refs = [getTruckLocationsCol(shopId).doc(input.originId),getTruckLocationsCol(shopId).doc(input.destinationId),...(input.customerId?[getTruckCustomersCol(shopId).doc(input.customerId)]:[])];
            const linked = await tx.getAll(...refs);
            if (linked.some(s=>!s.exists || s.data()?.status!=='ACTIVE')) throw new Error('INVALID_REFERENCE');
          }
        }
        const now = new Date().toISOString();
        const data = disable ? { ...current, status:'SUSPENDED', revision:current!.revision+1, updatedAt:now } : location ? { locationId:ref.id, code:input.code.trim(), name:input.name.trim(), detail:String(input.detail || '').trim(), status:'ACTIVE', revision:(current?.revision||0)+1, createdAt:current?.createdAt||now, updatedAt:now } : { tariffId:ref.id, originId:input.originId, destinationId:input.destinationId, customerId:input.customerId || null, driverPaySatang:input.driverPaySatang, customerRateSatang:input.customerRateSatang ?? null, status:'ACTIVE', revision:(current?.revision||0)+1, createdAt:current?.createdAt||now, updatedAt:now };
        tx.set(ref,data); recordAudit(tx,shopId,owner.uid,action,ref.id,current,data,requestId); recordRequestReceipt(tx,requestRef,{requestId,actorUid:owner.uid,method:'POST',entityKey:ref.id,payloadHash:hash,response:data,createdAt:now}); return data;
      });
      return createSuccessResponse(result, requestId);
    }

    if (['UPSERT_DRIVER', 'DELETE_DRIVER', 'UPSERT_CUSTOMER', 'DELETE_CUSTOMER'].includes(action)) {
      const isDriver = action.endsWith('DRIVER');
      const deleting = action.startsWith('DELETE');
      const item = isDriver ? body.driver : body.customer;
      const key = isDriver ? 'driverId' : 'customerId';
      const collection = isDriver ? getTruckDriversCol(shopId) : getTruckCustomersCol(shopId);
      const id = deleting ? body[key] : item?.[key];
      if (id !== undefined && (typeof id !== 'string' || !id || id.includes('/'))) return createErrorResponse('INVALID_INPUT', undefined, 422);
      const ref = id ? collection.doc(id) : collection.doc();
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!deleting && (!name || name.length > 100)) return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อ', 422);
      if (isDriver && !deleting) { try { validateSatang(item.baseWageSatang); } catch { return createErrorResponse('INVALID_MONEY', undefined, 422); } }
      const payloadHash = computePayloadHash(owner.uid, 'POST', action, body);
      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash); if (cached) return cached;
        const snap = await tx.get(ref); const current = snap.exists ? snap.data() : null;
        if (deleting && !current) throw new Error('NOT_FOUND');
        if (current && body.expectedRevision !== current.revision) throw new Error('CONFLICT');
        const now = new Date().toISOString();
        const value = deleting ? { ...current, status: 'SUSPENDED', revision: current!.revision + 1, updatedAt: now } : { [key]: ref.id, name, ...(isDriver ? { baseWageSatang: item.baseWageSatang } : {}), status: 'ACTIVE', revision: (current?.revision || 0) + 1, createdAt: current?.createdAt || now, updatedAt: now };
        tx.set(ref, value); recordAudit(tx, shopId, owner.uid, action, ref.id, current, value, requestId);
        recordRequestReceipt(tx, requestRef, { requestId, actorUid: owner.uid, method: 'POST', entityKey: ref.id, payloadHash, response: value, createdAt: now }); return value;
      });
      return createSuccessResponse(result, requestId);
    }

    // 1. UPDATE_PROFILE
    if (action === 'UPDATE_PROFILE' || body.companyName) {
      const targetName = String(body.companyName || '').trim();
      if (!targetName || targetName.length > 100) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อกิจการให้ถูกต้อง', 422);
      }
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined;

      const payloadHash = computePayloadHash(owner.uid, 'POST', 'truckProfile', {
        companyName: targetName,
        address:body.address||'', phone:body.phone||'', taxId:body.taxId||'',
        expectedRevision
      });

      const profileRef = getTruckProfileRef(shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(profileRef);
        const current = snap.exists ? snap.data() : { companyName: 'ระบบบันทึกงานรถสิบล้อ', revision: 1 };
        if (expectedRevision !== undefined && current?.revision !== expectedRevision) {
          throw new Error('CONFLICT');
        }

        // Write phase
        const now = new Date().toISOString();
        const newRevision = (current?.revision || 1) + 1;
        const updated = {
          companyName: targetName,
          address:String(body.address ?? current?.address ?? '').slice(0,1000), phone:String(body.phone ?? current?.phone ?? '').slice(0,100), taxId:String(body.taxId ?? current?.taxId ?? '').slice(0,50),
          revision: newRevision,
          updatedAt: now
        };

        tx.set(profileRef, updated, { merge: true });

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'UPDATE_TRUCK_PROFILE',
          'truckProfile',
          current,
          updated,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: 'truckProfile',
          payloadHash,
          response: updated,
          createdAt: now
        });

        return updated;
      });

      return createSuccessResponse(result, requestId);
    }

    // 2. UPSERT_TRUCK
    if (action === 'UPSERT_TRUCK') {
      const truck = body.truck;
      if (!truck || typeof truck !== 'object' || !truck.plateNumber) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุข้อมูลรถและทะเบียนรถ', 422);
      }

      const truckId = String(truck.truckId || `truck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim();
      const plateNumber = String(truck.plateNumber).trim();
      const driverName = String(truck.driverName || '').trim();
      const notes = String(truck.notes || '').trim();
      const status = truck.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined;

      const payloadHash = computePayloadHash(owner.uid, 'POST', `truck:${truckId}`, {
        truckId,
        plateNumber,
        driverName,
        status,
        expectedRevision
      });

      const truckRef = getTruckRef(truckId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(truckRef);
        const exists = snap.exists;
        const current = exists ? snap.data() : null;

        if (expectedRevision !== undefined && exists && current?.revision !== expectedRevision) {
          throw new Error('CONFLICT');
        }

        // Write phase
        const now = new Date().toISOString();
        const newRevision = (current?.revision || 0) + 1;
        const data: TruckDoc = {
          truckId,
          plateNumber,
          driverName,
          notes,
          status,
          revision: newRevision,
          createdAt: current?.createdAt || now,
          updatedAt: now
        };

        tx.set(truckRef, data);

        recordAudit(
          tx,
          shopId,
          owner.uid,
          exists ? 'UPDATE_TRUCK' : 'CREATE_TRUCK',
          `truck:${truckId}`,
          current,
          data,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `truck:${truckId}`,
          payloadHash,
          response: data,
          createdAt: now
        });

        return data;
      });

      return createSuccessResponse(result, requestId);
    }

    // 3. DELETE_TRUCK
    if (action === 'DELETE_TRUCK') {
      const truckId = String(body.truckId || '').trim();
      if (!truckId) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ truckId', 422);
      }

      const payloadHash = computePayloadHash(owner.uid, 'POST', `delete:truck:${truckId}`, { truckId });
      const truckRef = getTruckRef(truckId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(truckRef);
        if (!snap.exists) {
          return { deleted: true, truckId };
        }
        const current = snap.data();

        // Write phase
        tx.set(truckRef, { ...current, status:'SUSPENDED', revision:(current?.revision||0)+1, updatedAt:new Date().toISOString() });

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'DELETE_TRUCK',
          `truck:${truckId}`,
          current,
          null,
          requestId
        );

        const responsePayload = { deleted: true, truckId };
        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `delete:truck:${truckId}`,
          payloadHash,
          response: responsePayload,
          createdAt: new Date().toISOString()
        });

        return responsePayload;
      });

      return createSuccessResponse(result, requestId);
    }

    // 4. UPSERT_ORIGIN
    if (action === 'UPSERT_ORIGIN') {
      const origin = body.origin;
      if (!origin || typeof origin !== 'object' || !origin.name) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุชื่อสถานที่ต้นทาง', 422);
      }

      const originId = String(origin.originId || `orig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim();
      const name = String(origin.name).trim();
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined;

      const payloadHash = computePayloadHash(owner.uid, 'POST', `origin:${originId}`, {
        originId,
        name,
        expectedRevision
      });

      const originRef = getTruckOriginRef(originId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(originRef);
        const exists = snap.exists;
        const current = exists ? snap.data() : null;

        if (expectedRevision !== undefined && exists && current?.revision !== expectedRevision) {
          throw new Error('CONFLICT');
        }

        // Write phase
        const now = new Date().toISOString();
        const newRevision = (current?.revision || 0) + 1;
        const data: TruckOriginDoc = {
          originId,
          name,
          revision: newRevision,
          createdAt: current?.createdAt || now,
          updatedAt: now
        };

        tx.set(originRef, data);

        recordAudit(
          tx,
          shopId,
          owner.uid,
          exists ? 'UPDATE_TRUCK_ORIGIN' : 'CREATE_TRUCK_ORIGIN',
          `origin:${originId}`,
          current,
          data,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `origin:${originId}`,
          payloadHash,
          response: data,
          createdAt: now
        });

        return data;
      });

      return createSuccessResponse(result, requestId);
    }

    // 5. DELETE_ORIGIN
    if (action === 'DELETE_ORIGIN') {
      const originId = String(body.originId || '').trim();
      if (!originId) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ originId', 422);
      }

      const payloadHash = computePayloadHash(owner.uid, 'POST', `delete:origin:${originId}`, { originId });
      const originRef = getTruckOriginRef(originId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(originRef);
        if (!snap.exists) {
          return { deleted: true, originId };
        }
        const current = snap.data();

        // Write phase
        tx.set(originRef, { ...current, status:'SUSPENDED', revision:(current?.revision||0)+1, updatedAt:new Date().toISOString() });

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'DELETE_TRUCK_ORIGIN',
          `origin:${originId}`,
          current,
          null,
          requestId
        );

        const responsePayload = { deleted: true, originId };
        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `delete:origin:${originId}`,
          payloadHash,
          response: responsePayload,
          createdAt: new Date().toISOString()
        });

        return responsePayload;
      });

      return createSuccessResponse(result, requestId);
    }

    // 6. UPSERT_DESTINATION
    if (action === 'UPSERT_DESTINATION') {
      const destination = body.destination;
      if (!destination || typeof destination !== 'object' || !destination.name) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุข้อมูลสถานที่ปลายทาง', 422);
      }

      let driverPaySatang = 0;
      try {
        driverPaySatang = validateSatang(Number(destination.driverPaySatang ?? 0));
      } catch {
        return createErrorResponse('INVALID_MONEY', 'จำนวนเงินค่าเที่ยวคนขับไม่ถูกต้อง', 422);
      }

      const destinationId = String(destination.destinationId || `dest_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim();
      const name = String(destination.name).trim();
      const expectedRevision = typeof body.expectedRevision === 'number' ? body.expectedRevision : undefined;

      const payloadHash = computePayloadHash(owner.uid, 'POST', `destination:${destinationId}`, {
        destinationId,
        name,
        driverPaySatang,
        expectedRevision
      });

      const destRef = getTruckDestinationRef(destinationId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(destRef);
        const exists = snap.exists;
        const current = exists ? snap.data() : null;

        if (expectedRevision !== undefined && exists && current?.revision !== expectedRevision) {
          throw new Error('CONFLICT');
        }

        // Write phase
        const now = new Date().toISOString();
        const newRevision = (current?.revision || 0) + 1;
        const data: TruckDestinationDoc = {
          destinationId,
          name,
          driverPaySatang,
          revision: newRevision,
          createdAt: current?.createdAt || now,
          updatedAt: now
        };

        tx.set(destRef, data);

        recordAudit(
          tx,
          shopId,
          owner.uid,
          exists ? 'UPDATE_TRUCK_DESTINATION' : 'CREATE_TRUCK_DESTINATION',
          `destination:${destinationId}`,
          current,
          data,
          requestId
        );

        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `destination:${destinationId}`,
          payloadHash,
          response: data,
          createdAt: now
        });

        return data;
      });

      return createSuccessResponse(result, requestId);
    }

    // 7. DELETE_DESTINATION
    if (action === 'DELETE_DESTINATION') {
      const destinationId = String(body.destinationId || '').trim();
      if (!destinationId) {
        return createErrorResponse('INVALID_INPUT', 'กรุณาระบุ destinationId', 422);
      }

      const payloadHash = computePayloadHash(owner.uid, 'POST', `delete:destination:${destinationId}`, { destinationId });
      const destRef = getTruckDestinationRef(destinationId, shopId);

      const result = await db.runTransaction(async tx => {
      await assertTruckWritable(tx, shopId);
        // Read phase
        const cached = await checkRequestReceipt(tx, requestRef, payloadHash);
        if (cached) return cached;

        const snap = await tx.get(destRef);
        if (!snap.exists) {
          return { deleted: true, destinationId };
        }
        const current = snap.data();

        // Write phase
        tx.set(destRef, { ...current, status:'SUSPENDED', revision:(current?.revision||0)+1, updatedAt:new Date().toISOString() });

        recordAudit(
          tx,
          shopId,
          owner.uid,
          'DELETE_TRUCK_DESTINATION',
          `destination:${destinationId}`,
          current,
          null,
          requestId
        );

        const responsePayload = { deleted: true, destinationId };
        recordRequestReceipt(tx, requestRef, {
          requestId,
          actorUid: owner.uid,
          method: 'POST',
          entityKey: `delete:destination:${destinationId}`,
          payloadHash,
          response: responsePayload,
          createdAt: new Date().toISOString()
        });

        return responsePayload;
      });

      return createSuccessResponse(result, requestId);
    }

    return createErrorResponse('INVALID_INPUT', 'ไม่ระบุ action ที่ถูกต้อง', 422);
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

export async function PATCH(req: NextRequest) {
  return POST(req);
}
