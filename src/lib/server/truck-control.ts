import type { firestore } from 'firebase-admin';
import { getShopDocRef } from './repository';

/** Every online mutation reads the same document used by restore/cutover. */
export async function assertTruckWritable(tx: firestore.Transaction, shopId: string) {
  const control = await tx.get(getShopDocRef(shopId).collection('truckControl').doc('main'));
  if (control.data()?.maintenance) throw new Error('TRUCK_MAINTENANCE');
}
