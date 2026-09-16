import { getAdminFirestore } from '../src/lib/firebase/admin';
import { getShopId, getProfileRef, getFinanceControlRef } from '../src/lib/server/repository';

try {
  (process as any).loadEnvFile?.('.env.local');
} catch {}

async function main() {
  const shopId = getShopId();
  console.log(`--- เริ่มการตั้งค่าเริ่มต้น Firestore สำหรับ ${shopId} ---`);

  const db = getAdminFirestore();
  const batch = db.batch();

  // 1. Shop Profile
  const profileRef = getProfileRef(shopId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    batch.set(profileRef, {
      name: 'DE TEAM',
      currency: 'THB',
      timezone: 'Asia/Bangkok',
      workDays: [1, 2, 3, 4, 5, 6], // Mon - Sat
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    console.log('[OK] เพิ่มเอกสารร้านค้า profile/main');
  } else {
    console.log('[SKIP] เอกสาร profile/main มีอยู่แล้ว');
  }

  // 2. Finance Control
  const controlRef = getFinanceControlRef(shopId);
  const controlSnap = await controlRef.get();
  if (!controlSnap.exists) {
    batch.set(controlRef, {
      lockState: 'IDLE',
      currentClosedMonth: null,
      activeJobId: null,
      revision: 1,
      updatedAt: new Date().toISOString()
    });
    console.log('[OK] เพิ่มเอกสารการเงิน control/finance');
  } else {
    console.log('[SKIP] เอกสาร control/finance มีอยู่แล้ว');
  }

  // 3. Calendar Settings
  const calendarRef = db.collection('shops').doc(shopId).collection('calendarVersions').doc('v1');
  const calendarSnap = await calendarRef.get();
  if (!calendarSnap.exists) {
    batch.set(calendarRef, {
      workDays: [1, 2, 3, 4, 5, 6],
      effectiveDate: '2026-01-01',
      revision: 1,
      updatedAt: new Date().toISOString()
    });
    console.log('[OK] เพิ่มเอกสารปฏิทิน calendarVersions/v1');
  } else {
    console.log('[SKIP] เอกสาร calendarVersions/v1 มีอยู่แล้ว');
  }

  await batch.commit();
  console.log('--- ตั้งค่าเริ่มต้น Firestore สำเร็จเรียบร้อย 100% ---');
}

main().catch((err) => {
  console.error('ตั้งค่าเริ่มต้นล้มเหลว:', err);
  process.exit(1);
});
