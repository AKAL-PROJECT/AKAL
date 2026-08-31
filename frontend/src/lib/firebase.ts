import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Paresseux à dessein (audit d'intégration du 2026-08-15, bloquant #1) :
// initializeApp()/getAuth() ne s'exécutent plus au chargement de ce module,
// seulement au premier appel réel de getFirebaseAuth() — c'est-à-dire au
// moment où un utilisateur déclenche une action d'authentification (envoi
// SMS, reCAPTCHA…), jamais au simple import du fichier.
//
// Avant ce correctif, `export const auth = getAuth(app)` s'exécutait dès
// l'import de ce module. Comme GoogleAuthProviderWrapper (donc, via le
// layout racine, TOUTE page du site) importe ce module indirectement,
// l'absence des 7 variables NEXT_PUBLIC_FIREBASE_* (non définies en dev,
// non documentées) faisait planter le rendu entier de la page avec
// `FirebaseError: auth/invalid-api-key` — pas seulement les écrans de
// connexion. `initializeApp()` seul ne valide rien (aucun risque à
// l'appeler avec une config vide) ; c'est `getAuth()` qui lève l'erreur, et
// elle n'est donc plus jamais levée avant qu'un appelant en ait réellement
// besoin (cf. firebase-client.ts, seul consommateur de `auth`).
let appInstance: FirebaseApp | undefined;
let authInstance: Auth | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!appInstance) {
    appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  }
  return appInstance;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}
