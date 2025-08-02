
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions"; 
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyBuF0ODjI_-s0qEKA4prbwVMAiyiDYTj6U",
    authDomain: "thoughtify-web-bb1ea.firebaseapp.com",
    projectId: "thoughtify-web-bb1ea",
    storageBucket: "thoughtify-web-bb1ea.firebasestorage.app",
    messagingSenderId: "314305883722",
    appId: "1:314305883722:web:c904fc406a458c84df80b3",
    measurementId: "G-18M1BPL5F3"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const functions = getFunctions(app);
const auth = getAuth(app);

export { app, db, functions, auth };
