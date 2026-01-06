import { initializeFirebase } from './firebase.ts';
import {
  getAuth,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  Auth,
  User,
} from 'firebase/auth';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

// Initialize Google Auth
export async function initGoogleAuth(): Promise<void> {
  const app = initializeFirebase();
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  console.log('[Auth] Google Auth initialized');
}

// Sign in with Google
export async function signInWithGoogle(): Promise<AuthUser | null> {
  if (!auth || !googleProvider) {
    throw new Error('Auth not initialized');
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    console.log('[Auth] Signed in:', user.email);
    return mapUser(user);
  } catch (error) {
    console.error('[Auth] Sign in error:', error);
    throw error;
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  if (!auth) {
    throw new Error('Auth not initialized');
  }

  try {
    await signOut(auth);
    console.log('[Auth] Signed out');
  } catch (error) {
    console.error('[Auth] Sign out error:', error);
    throw error;
  }
}

// Get current user
export function getCurrentUser(): AuthUser | null {
  if (!auth?.currentUser) {
    return null;
  }
  return mapUser(auth.currentUser);
}

// Listen for auth state changes
export function onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
  if (!auth) {
    console.warn('[Auth] Auth not initialized, cannot listen for changes');
    return () => {};
  }

  return onAuthStateChanged(auth, (user) => {
    callback(user ? mapUser(user) : null);
  });
}

// Map Firebase User to AuthUser
function mapUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
  };
}
