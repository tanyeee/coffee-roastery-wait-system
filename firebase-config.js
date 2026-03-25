import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  get,
  push,
  update,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4X4s8rG1i62Fe8ypxG29x3ReXSwwGAEo",
  authDomain: "coffeeroastery-fefa7.firebaseapp.com",
  databaseURL: "https://coffeeroastery-fefa7-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coffeeroastery-fefa7",
  storageBucket: "coffeeroastery-fefa7.firebasestorage.app",
  messagingSenderId: "854048573547",
  appId: "1:854048573547:web:92723b65e9ae6ea8a7092e"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, onValue, get, push, update, set };
