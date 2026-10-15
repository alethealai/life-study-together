import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

export const usingEmulators = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const firebaseConfig = usingEmulators ? {apiKey:"demo-key",authDomain:"demo-life-study.firebaseapp.com",projectId:"demo-life-study",storageBucket:"demo-life-study.appspot.com",messagingSenderId:"123456",appId:"demo-app"} : {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseReady = Object.values(firebaseConfig).every(Boolean);
export const firebaseApp = firebaseReady
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;
let sessionAuth: Auth | null = null;
if (firebaseApp && typeof window !== "undefined") {
  try {
    sessionAuth = initializeAuth(firebaseApp, {
      persistence: browserSessionPersistence,
    });
  } catch {
    sessionAuth = getAuth(firebaseApp);
  }
}
export const auth = sessionAuth;
export const db = firebaseApp ? getFirestore(firebaseApp) : null;

export const functionsClient = firebaseApp ? getFunctions(firebaseApp, 'asia-east1') : null;
const localRuntime = globalThis as typeof globalThis & {gardenEmulatorsConnected?:boolean};
if (usingEmulators && typeof window !== 'undefined' && !localRuntime.gardenEmulatorsConnected) {
  if (auth && !auth.emulatorConfig) connectAuthEmulator(auth, `http://127.0.0.1:${process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT??'9099'}`, {disableWarnings:true});
  connectFirestoreEmulator(db!, '127.0.0.1', Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT??8080));
  connectFunctionsEmulator(functionsClient!, '127.0.0.1', Number(process.env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT??5001));
  localRuntime.gardenEmulatorsConnected = true;
}
