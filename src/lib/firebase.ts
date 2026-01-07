import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration - replace with your own config
// These values should be set in environment variables for production
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'your-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'your-project.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-project-id',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'your-project.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export function initializeFirebase(): FirebaseApp {
  if (!app) {
    console.log('[Firebase] Initializing with config:', {
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      hasApiKey: !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'your-api-key',
    });
    app = initializeApp(firebaseConfig);
    console.log('[Firebase] App initialized successfully');
  }
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    console.log('[Firebase] Getting Firestore instance...');
    const firebaseApp = initializeFirebase();
    db = getFirestore(firebaseApp);
    console.log('[Firebase] Firestore instance created');
  }
  return db;
}

// Generate a random room ID (6 uppercase alphanumeric characters)
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (I, O, 0, 1)
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate a unique client ID for this session
export function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}
