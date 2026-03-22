import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC11SU5V9r1uAzoi5Hc3MADr6w09uiUAz8",
  authDomain: "loctrack-552df.firebaseapp.com",
  databaseURL:
    "https://loctrack-552df-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "loctrack-552df",
  storageBucket: "loctrack-552df.firebasestorage.app",
  messagingSenderId: "7496005809",
  appId: "1:7496005809:web:5ae9f8f1078d3faa7e0a90",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firestoreDb = getFirestore(app);
export const db = getDatabase(app);