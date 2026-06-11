/* ============================================================
 * Kodexa — real sign-in configuration
 * ============================================================
 * Out of the box, sign-in is SIMULATED: profiles and progress live
 * only in this browser's localStorage.
 *
 * To turn on REAL sign-in (Google popup, email+password accounts)
 * and CLOUD-SYNCED progress, do this once (~10 minutes, free):
 *
 *  1. Go to https://console.firebase.google.com and create a project.
 *  2. Build → Authentication → Get started → enable the
 *     "Google" provider (and "Email/Password").
 *     ("Apple" also works, but requires a paid Apple Developer account.)
 *  3. Authentication → Settings → Authorized domains → add:
 *        drrahul1978-lgtm.github.io
 *  4. Build → Firestore Database → Create database (production mode),
 *     then in Rules paste:
 *
 *        rules_version = '2';
 *        service cloud.firestore {
 *          match /databases/{database}/documents {
 *            match /users/{uid} {
 *              allow read, write: if request.auth != null && request.auth.uid == uid;
 *            }
 *          }
 *        }
 *
 *  5. Project settings (gear icon) → Your apps → Web app (</>) →
 *     register it and copy the firebaseConfig object.
 *  6. Replace `null` below with that object and push. Done!
 *
 *  The values in firebaseConfig (apiKey etc.) are identifiers, not
 *  secrets — they are safe to commit in a public repo. Access is
 *  controlled by the authorized domains and the Firestore rules.
 * ============================================================ */

const FIREBASE_CONFIG = null;

/* Example of what it should look like:
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "kodexa-12345.firebaseapp.com",
  projectId: "kodexa-12345",
  storageBucket: "kodexa-12345.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
};
*/
