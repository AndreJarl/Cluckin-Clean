import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC11SU5V9r1uAzoi5Hc3MADr6w09uiUAz8",
  authDomain: "loctrack-552df.firebaseapp.com",
  projectId: "loctrack-552df",
  storageBucket: "loctrack-552df.firebasestorage.app",
  messagingSenderId: "7496005809",
  appId: "1:7496005809:web:5ae9f8f1078d3faa7e0a90",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);