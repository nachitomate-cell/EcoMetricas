// auth.js
import { auth, db } from './firebase-config.js';

// Live-binding exports — main.js reads these after reassignment
export let CURRENT_USER = null;
export let DOC_REF = null;

/**
 * Registro con Email/Password
 */
export function registerEmail(email, password) {
  return auth.createUserWithEmailAndPassword(email, password).catch(err => {
    console.error("Error al registrarse:", err);
    throw err; // re-throw para que la UI muestre el mensaje específico
  });
}

/**
 * Login con Email/Password
 */
export function loginEmail(email, password) {
  return auth.signInWithEmailAndPassword(email, password).catch(err => {
    console.error("Error al iniciar sesión:", err);
    throw err;
  });
}

export function logout() {
  return auth.signOut();
}

/**
 * initAuth — wire up Firebase auth state observer.
 * Call once on DOMContentLoaded. onLogin receives the Firebase user object.
 */
export function initAuth(onLogin, onLogout) {
  auth.onAuthStateChanged(user => {
    if (user) {
      CURRENT_USER = user;
      DOC_REF = db.collection("users").doc(user.uid);
      onLogin(user);
    } else {
      CURRENT_USER = null;
      DOC_REF = null;
      onLogout();
    }
  });
}