
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getAuth } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken,
} from "firebase/app-check";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };

const app = initializeApp(firebaseConfig);

if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
}

const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

let appCheckPromise = Promise.resolve();
if (siteKey) {
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckPromise = getToken(appCheck);
} else {
  console.warn("VITE_RECAPTCHA_SITE_KEY is not set; App Check disabled");
}

const functions = appCheckPromise.then(() => getFunctions(app, "us-central1"));
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, functions, auth };
