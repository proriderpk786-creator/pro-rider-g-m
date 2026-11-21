// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDsX2diIdN09StjyY3_rCRl6dbD6y_F0os",
  authDomain: "prorider-web.firebaseapp.com",
  projectId: "prorider-web",
  storageBucket: "prorider-web.firebasestorage.app",
  messagingSenderId: "259895580816",
  appId: "1:259895580816:web:e62280ba0a9a9d24b92015",
  measurementId: "G-1H4KNNJTCX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
