// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD0z7X60MfM6n4gDjg6VAkYKbIPz5gdcic",
  authDomain: "attendance-tracker-3091f.firebaseapp.com",
  projectId: "attendance-tracker-3091f",
  storageBucket: "attendance-tracker-3091f.appspot.com", 
  messagingSenderId: "488809231478",
  appId: "1:488809231478:web:bc0a2f732896236ba21b57",
  measurementId: "G-CEHEL1HJ1J"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
