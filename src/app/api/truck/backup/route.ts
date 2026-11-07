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
  ,getShopDocRef
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
      : null;

    const trucks = trucksSnap.docs.map(doc => ({ truckId: doc.id, ...doc.data() }));
    const truckOrigins = originsSnap.docs.map(doc => ({ originId: doc.id, ...doc.data() }));
    const truckDestinations = destinationsSnap.docs.map(doc => ({ destinationId: doc.id, ...doc.data() }));

    // Gather records across all month collections
    const monthDocs = monthsSnap.docs;
    const recordsPromises = monthDocs.map(async mDoc => {
      const recordsSnap = await mDoc.ref.collection('records').get();
      return recordsSnap.docs.map(d => ({ ...d.data(), recordId: d.id, monthKey: mDoc.id }));
    });

    const monthRecordArrays = await Promise.all(recordsPromises);
    const records: TruckDailyRecordDoc[] = monthRecordArrays.flat() as any[];

    const extraNames = ['truckLocations','truckDrivers','truckCustomers','truckTariffs','truckTrips','truckRuns','truckPayrollMonths','truckInvoices','truckPayments','truckPhotos','requests','audit'];
    const shopRef = getShopDocRef(shopId);
    const extraSnaps = await Promise.all(extraNames.map(name => shopRef.collection(name).get()));
    const extraDocuments: {path:string;data:FirebaseFirestore.DocumentData}[] = [];
    for (let i=0;i<extraNames.length;i++) for (const doc of extraSnaps[i].docs) {
      extraDocuments.push({path:`${extraNames[i]}/${doc.id}`,data:doc.data()});
      const sub = extraNames[i] === 'truckInvoices' ? 'payments' : extraNames[i] === 'truckPayrollMonths' ? 'versions' : null;
      if (sub) { const children=await doc.ref.collection(sub).get(); for (const child of children.docs) extraDocuments.push({path:`${extraNames[i]}/${doc.id}/${sub}/${child.id}`,data:child.data()}); }
    }
    for (const month of monthDocs) extraDocuments.push({path:`truckMonths/${month.id}`,data:month.data()});
    for (const month of monthDocs) for (const sub of ['workDays','payroll']) {
      const children=await month.ref.collection(sub).get();
      for (const child of children.docs) extraDocuments.push({path:`truckMonths/${month.id}/${sub}/${child.id}`,data:child.data()});
    }

    const backupPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      shopId,
      truckProfile,
      trucks,
      truckOrigins,
      truckDestinations,
      records,
      extraDocuments
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
    return createErrorResponse('RESTORE_OFFLINE_ONLY', 'Restore must use the maintenance-gated truck:restore command.', 409);
  } catch (err: unknown) {
    const error = err as { code?: string; message?: string; statusCode?: number };
    return createErrorResponse(error.code || 'INTERNAL_ERROR', error.message, error.statusCode || 500);
  }
}
