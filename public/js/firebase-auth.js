// Firebase Authentication Module
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  onAuthStateChanged
} from './firebase-config.js';

// Register new user
export async function register(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    localStorage.setItem('userId', userCredential.user.uid);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Registration error:', error.message);
    return { success: false, error: error.message };
  }
}

// Login user
export async function login(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem('userId', userCredential.user.uid);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Login error:', error.message);
    return { success: false, error: error.message };
  }
}

// Logout user
export async function logout() {
  try {
    await signOut(auth);
    localStorage.removeItem('userId');
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error.message);
    return { success: false, error: error.message };
  }
}

// Check authentication state
export function checkAuthState(callback) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      localStorage.setItem('userId', user.uid);
      callback({ isAuthenticated: true, user });
    } else {
      localStorage.removeItem('userId');
      callback({ isAuthenticated: false, user: null });
    }
  });
}

// Get current user
export function getCurrentUser() {
  return auth.currentUser;
}
