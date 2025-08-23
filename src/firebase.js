// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
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

let appCheck = null;

// 🔐 Initialize App Check in the browser only
if (typeof window !== "undefined") {
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    // `self` works in both window and workers
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }

  const enterpriseKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const v3Key = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  if (enterpriseKey || v3Key) {
    const provider = enterpriseKey
      ? new ReCaptchaEnterpriseProvider(enterpriseKey)
      : new ReCaptchaV3Provider(v3Key);

    appCheck = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } else {
    console.warn("No reCAPTCHA site key found; App Check not initialized.");
  }
}

// ⚠️ No manual getToken() needed — SDK will attach tokens automatically
// export services from the SAME app instance
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, "us-central1");

export { app, auth, db, functions, appCheck };
