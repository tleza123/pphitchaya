import 'server-only';
import * as admin from 'firebase-admin';

interface GlobalFirebaseAdmin {
  adminApp?: admin.app.App;
  adminDb?: admin.firestore.Firestore;
  adminAuth?: admin.auth.Auth;
  adminStorage?: admin.storage.Storage;
}

const globalFirebase = globalThis as unknown as GlobalFirebaseAdmin;

export function getAdminApp(): admin.app.App {
  if (globalFirebase.adminApp) return globalFirebase.adminApp;

  if (admin.apps.length > 0 && admin.apps[0]) {
    globalFirebase.adminApp = admin.apps[0];
    return globalFirebase.adminApp;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GCP_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    privateKey = privateKey.trim();
    if (
      (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
      (privateKey.startsWith("'") && privateKey.endsWith("'"))
    ) {
      privateKey = privateKey.slice(1, -1);
    }
    // Replace escaped newlines if passed in environment variable
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const bucket = process.env.FIREBASE_STORAGE_BUCKET;

  let app: admin.app.App;

  if (projectId && clientEmail && privateKey) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      }),
      storageBucket: bucket
    });
  } else {
    if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.NODE_ENV !== 'test') {
      console.warn(
        '[Firebase Admin] ยังไม่ได้กำหนดค่าตัวแปร FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL หรือ FIREBASE_PRIVATE_KEY ใน .env.local หรือบน Vercel กรุณาตั้งค่า Service Account ก่อนเชื่อมต่อ Cloud Firestore'
      );
    }
    // Fallback to application default credentials (ADC) or emulator with guaranteed fallback ID
    const effectiveProjectId = projectId || 'de-team-attendance';
    app = admin.initializeApp({
      projectId: effectiveProjectId,
      storageBucket: bucket
    });
  }

  globalFirebase.adminApp = app;
  return app;
}

export function getAdminAuth(): admin.auth.Auth {
  if (globalFirebase.adminAuth) return globalFirebase.adminAuth;
  globalFirebase.adminAuth = getAdminApp().auth();
  return globalFirebase.adminAuth;
}

export function getAdminFirestore(): admin.firestore.Firestore {
  if (globalFirebase.adminDb) return globalFirebase.adminDb;

  const db = getAdminApp().firestore();
  try {
    // Ignore undefined properties to avoid Firestore errors
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Silently ignore if settings() was already invoked on this instance
  }

  globalFirebase.adminDb = db;
  return db;
}

export function getAdminStorage(): admin.storage.Storage {
  if (globalFirebase.adminStorage) return globalFirebase.adminStorage;
  globalFirebase.adminStorage = getAdminApp().storage();
  return globalFirebase.adminStorage;
}
