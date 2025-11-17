// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, increment } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDn609sNiSGgE9d1EzXrz0nkAfpy8--z0Y",
  authDomain: "my-study-timer.firebaseapp.com",
  projectId: "my-study-timer",
  storageBucket: "my-study-timer.firebasestorage.app",
  messagingSenderId: "1062897265598",
  appId: "1:1062897265598:web:26c3e9b66b23d61887e7ef"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.log('Multiple tabs open - only one can use persistence');
  } else if (err.code == 'unimplemented') {
    console.log('Browser does not support persistence');
  }
});

export { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut };
export { collection, addDoc, query, where, getDocs, updateDoc, doc, getDoc, increment };
