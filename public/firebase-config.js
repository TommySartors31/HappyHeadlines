/*
  HappyHeadlines Firebase configuration.

  Replace every value below after you create your Firebase project
  and register a Web App inside Firebase Console.

  Firebase Console:
  https://console.firebase.google.com/
*/

const firebaseConfig = {
  apiKey: "AIzaSyDUyWYvDQeqhebYHs_NHPSBc9ywFyM448o",
  authDomain: "happyheadlines.firebaseapp.com",
  projectId: "happyheadlines",
  storageBucket: "happyheadlines.firebasestorage.app",
  messagingSenderId: "397541233633",
  appId: "1:397541233633:web:c8f951bfa0dc60f5ec78a0",
  measurementId: "G-NGJWZCKNXM"
};

/*
  Keep this as us-central1 unless you deliberately deploy your
  Firebase Cloud Functions to another region.
*/
export const FUNCTIONS_REGION = "us-central1";
