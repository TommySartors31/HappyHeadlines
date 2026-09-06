/*
  HappyHeadlines Firebase configuration.

  Replace every value below after you create your Firebase project
  and register a Web App inside Firebase Console.

  Firebase Console:
  https://console.firebase.google.com/
*/

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

/*
  Keep this as us-central1 unless you deliberately deploy your
  Firebase Cloud Functions to another region.
*/
export const FUNCTIONS_REGION = "us-central1";
