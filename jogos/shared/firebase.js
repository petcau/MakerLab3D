import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth }        from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const app = initializeApp({
  apiKey:            "AIzaSyAndgQiwxpe6wyCF8aa5NqqdMuwLJfMIMM",
  authDomain:        "makerlab3d-4e455.firebaseapp.com",
  projectId:         "makerlab3d-4e455",
  storageBucket:     "makerlab3d-4e455.firebasestorage.app",
  messagingSenderId: "495457985822",
  appId:             "1:495457985822:web:05efcebeed970ecb82150f",
});

export const auth = getAuth(app);
export const db   = getFirestore(app);
