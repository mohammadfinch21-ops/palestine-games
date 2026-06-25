/**
 * إعداد Firebase — استبدل القيم بمفاتيح مشروعك من Firebase Console.
 * Firebase setup — replace placeholders with your project keys.
 *
 * @see ONLINE_SETUP.md
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDLU3xtxpbnITlBBw0Kd70Uk70NlGl4ZV4',
  authDomain: 'palestine-games-project.firebaseapp.com',
  databaseURL: 'https://palestine-games-project-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'palestine-games-project',
  storageBucket: 'palestine-games-project.firebasestorage.app',
  messagingSenderId: '28737404045',
  appId: '1:28737404045:web:1b13cccb946ffdfb64f6c4',
};

const PLACEHOLDER_MARKERS = ['YOUR_', 'REPLACE_ME', 'xxxxxxxx'];

/**
 * @returns {boolean} true when real Firebase keys are present
 */
export function isFirebaseConfigured() {
  const { apiKey, databaseURL, projectId } = firebaseConfig;
  if (!apiKey || !databaseURL || !projectId) return false;
  const combined = `${apiKey}${databaseURL}${projectId}`;
  return !PLACEHOLDER_MARKERS.some((m) => combined.includes(m));
}
