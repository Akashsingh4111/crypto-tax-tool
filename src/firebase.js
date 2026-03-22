// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBO1qolqQ5z7RVsVXTEqT1DIsgeY3ugPqE",
  authDomain: "crypto-tax-tool.firebaseapp.com",
  projectId: "crypto-tax-tool",
  storageBucket: "crypto-tax-tool.firebasestorage.app",
  messagingSenderId: "170561116358",
  appId: "1:170561116358:web:933fdc7b70e870874b1fc7",
  measurementId: "G-YYGSL4TGGK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Export app
export default app;