// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Explicit side‑effect import to ensure App Check registers its component
import "firebase/app-check";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ✅ HMR-safe singleton app
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// 🔧 Set debug token BEFORE initializing App Check (dev only)
if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  // `self` works in both window and workers
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
}

// 🔐 Initialize App Check (prefer Enterprise if provided)
const enterpriseKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
const v3Key = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let appCheck = null;
if (enterpriseKey) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(enterpriseKey),
    isTokenAutoRefreshEnabled: true,
  });
} else if (v3Key) {
  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(v3Key),
    isTokenAutoRefreshEnabled: true,
  });
} else {
  console.warn("No reCAPTCHA site key found; App Check not initialized.");
}

// ⚠️ No manual getToken() needed — SDK will attach tokens automatically
// export services from the SAME app instance
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

export { app, auth, db, functions, appCheck };
