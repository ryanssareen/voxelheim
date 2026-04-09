import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  type Auth,
  type User,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigured = !!firebaseConfig.apiKey;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _firestore: Firestore | null = null;
let _microsoftProvider: OAuthProvider | null = null;
let _googleProvider: GoogleAuthProvider | null = null;

function getApp(): FirebaseApp {
  if (!_app) {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return _app;
}

function getFirebaseAuth(): Auth | null {
  if (!isConfigured) return null;
  if (!_auth) {
    _auth = getAuth(getApp());
  }
  return _auth;
}

function getFirestoreDb(): Firestore | null {
  if (!isConfigured) return null;
  if (!_firestore) {
    _firestore = getFirestore(getApp());
  }
  return _firestore;
}

function getMicrosoftProvider(): OAuthProvider | null {
  if (!isConfigured) return null;
  if (!_microsoftProvider) {
    _microsoftProvider = new OAuthProvider("microsoft.com");
    _microsoftProvider.addScope("XboxLive.signin");
  }
  return _microsoftProvider;
}

function getGoogleProvider(): GoogleAuthProvider | null {
  if (!isConfigured) return null;
  if (!_googleProvider) {
    _googleProvider = new GoogleAuthProvider();
  }
  return _googleProvider;
}

export {
  isConfigured as firebaseConfigured,
  getFirebaseAuth as auth,
  getFirestoreDb as firestore,
  getMicrosoftProvider as microsoftProvider,
  getGoogleProvider as googleProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  EmailAuthProvider,
  type User,
};
