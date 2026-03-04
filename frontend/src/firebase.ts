import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// Replace these with actual values from your Firebase console
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyPlaceholderAPIKeyForFirebase12345",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "prj-devpost-athon-adf.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "prj-devpost-athon-adf",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "prj-devpost-athon-adf.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789012",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890abcdef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

export { app, db, storage, auth };
