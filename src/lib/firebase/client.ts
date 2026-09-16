import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  Auth,
  User
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

function getClientApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApp();
  }
  return initializeApp(firebaseConfig);
}

let clientAuth: Auth | null = null;

export function getClientAuth(): Auth {
  if (!clientAuth) {
    const app = getClientApp();
    clientAuth = getAuth(app);
    // Use session persistence by default (does not leak to localStorage permanently)
    if (typeof window !== 'undefined') {
      setPersistence(clientAuth, browserSessionPersistence).catch(() => {
        // Fallback gracefully if browser restricts storage
      });
    }
  }
  return clientAuth;
}

export async function signInWithGoogle(): Promise<User> {
  const auth = getClientAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOut(): Promise<void> {
  const auth = getClientAuth();
  await firebaseSignOut(auth);
}

export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getClientAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}
