import { NextRequest } from 'next/server';
import { verifyOwner } from '@/lib/server/auth';
import { createSuccessResponse, createErrorResponse } from '@/lib/server/errors';
import {
  getShopId,
  getTruckProfileRef,
  getTrucksCol,
  getTruckRef,
  getTruckOriginsCol,
  getTruckOriginRef,
  getTruckDestinationsCol,
  getTruckDestinationRef,
  getTruckMonthsCol,
  getTruckMonthRef,
  getTruckRecordRef,
  getRequestsCol
} from '@/lib/server/repository';
import { getAdminFirestore } from '@/lib/firebase/admin';
import { TruckDailyRecordDoc } from '@/lib/truck/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await verifyOwner(req);
    const shopId = getShopId();

    const [profileSnap, trucksSnap, originsSnap, destinationsSnap, monthsSnap] = await Promise.all([
      getTruckProfileRef(shopId).get(),
      getTrucksCol(shopId).get(),
      getTruckOriginsCol(shopId).get(),
      getTruckDestinationsCol(shopId).get(),
      getTruckMonthsCol(shopId).get()
    ]);

    const truckProfile = profileSnap.exists
      ? profileSnap.data()
      : { companyName: 'ระบบบันทึกงานรถสิบล้อ', revision: 1 };

    const trucks = trucksSnap.docs.map(doc => ({ truckId: doc.id, ...doc.data() }));
    const truckOrigins = originsSnap.docs.map(doc => ({ originId: doc.id, ...doc.data() }));
    const truckDestinations = destinationsSnap.docs.map(doc => ({ destinationId: doc.id, ...doc.data() }));

    // Gather records across all month collections
    const monthDocs = monthsSnap.docs;
    const recordsPromises = monthDocs.map(async mDoc => {
      const recordsSnap = await mDoc.ref.collection('records').get();
      return recordsSnap.docs.map(d => ({ recordId: d.id, ...d.data() }));
    });

    const monthRecordArrays = await Promise.all(recordsPromises);
    const records: TruckDailyRecordDoc[] = monthRecordArrays.flat() as any[];

    const backupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      shopId,
      truckProfile,
      trucks,
      truckOrigins,
      truckDestinations,
      records
    };

    return createSuccessResponse(backupPayload);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await verifyOwner(req);
    const body = await req.json();
    const { truckProfile, trucks, truckOrigins, truckDestinations, records, requestId } = body;

    const shopId = getShopId();
    const db = getAdminFirestore();
    const now = new Date().toISOString();

    if (truckProfile && typeof truckProfile.companyName === 'string') {
      await getTruckProfileRef(shopId).set(
        {
          companyName: truckProfile.companyName,
          revision: (truckProfile.revision || 1) + 1,
          updatedAt: now
        },
        { merge: true }
      );
    }

    if (Array.isArray(trucks)) {
      for (const t of trucks) {
        if (t.truckId && t.plateNumber) {
          await getTruckRef(t.truckId, shopId).set({
            truckId: t.truckId,
            plateNumber: t.plateNumber,
            driverName: t.driverName || '',
            notes: t.notes || '',
            status: t.status || 'ACTIVE',
            revision: t.revision || 1,
            createdAt: t.createdAt || now,
            updatedAt: now
          });
        }
      }
    }

    if (Array.isArray(truckOrigins)) {
      for (const o of truckOrigins) {
        if (o.originId && o.name) {
          await getTruckOriginRef(o.originId, shopId).set({
            originId: o.originId,
            name: o.name,
            revision: o.revision || 1,
            createdAt: o.createdAt || now,
            updatedAt: now
          });
        }
      }
    }

    if (Array.isArray(truckDestinations)) {
      for (const d of truckDestinations) {
        if (d.destinationId && d.name) {
          await getTruckDestinationRef(d.destinationId, shopId).set({
            destinationId: d.destinationId,
            name: d.name,
            driverPaySatang: typeof d.driverPaySatang === 'number' ? d.driverPaySatang : 0,
            revision: d.revision || 1,
            createdAt: d.createdAt || now,
            updatedAt: now
          });
        }
      }
    }

    if (Array.isArray(records)) {
      for (const r of records) {
        if (r.dateKey && r.truckId) {
          const mKey = r.monthKey || r.dateKey.slice(0, 7);
          const rId = r.recordId || `${r.dateKey}_${r.truckId}`;
          await getTruckMonthRef(mKey, shopId).set(
            { monthKey: mKey, updatedAt: now },
            { merge: true }
          );
          await getTruckRecordRef(mKey, rId, shopId).set({
            ...r,
            recordId: rId,
            monthKey: mKey,
            updatedAt: now
          });
        }
      }
    }

    return createSuccessResponse({ restored: true }, requestId);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
