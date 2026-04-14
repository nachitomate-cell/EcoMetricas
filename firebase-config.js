// firebase-config.js
// Las librerÃ­as de Firebase se cargan vÃ­a CDN en index.html (modo compat)

const firebaseConfig = {
  apiKey: "AIzaSyALBzBA_mtJ_iDDrHOfex5-8PUI7HaCgbk",
  authDomain: "eco-metricas.firebaseapp.com",
  projectId: "eco-metricas",
  storageBucket: "eco-metricas.firebasestorage.app",
  messagingSenderId: "556047242817",
  appId: "1:556047242817:web:d81fc9070e2beeca7898c0",
  measurementId: "G-5TBBKGFPQD"
};

// InicializaciÃ³n
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

export { auth, db };
