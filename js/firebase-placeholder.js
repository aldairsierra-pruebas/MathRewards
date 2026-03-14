import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  serverTimestamp,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBLqVCqW2s7piZQUH0dHODjK4JXAv74TdA",
  authDomain: "asl-apk.firebaseapp.com",
  projectId: "asl-apk",
  storageBucket: "asl-apk.firebasestorage.app",
  messagingSenderId: "803053462437",
  appId: "1:803053462437:web:84bf25223991a379c77e4c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DEFAULT_PLAYERS = [
  { id: 'PR_1', displayName: 'PR_1', avatar: 'robot-1' },
  { id: 'PR_2', displayName: 'PR_2', avatar: 'robot-2' }
];

let activePlayerId = localStorage.getItem('misiones_active_player') || 'PR_1';

function makeSessionId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `s_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function ensureDefaultPlayers() {
  for (const player of DEFAULT_PLAYERS) {
    const ref = doc(db, 'players', player.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        displayName: player.displayName,
        avatar: player.avatar,
        active: true,
        createdAt: serverTimestamp()
      });
      await setDoc(doc(db, 'players', player.id, 'stats', 'summary'), {
        totalAttempts: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalTimeMs: 0,
        bestStreak: 0,
        currentStreak: 0,
        lastPlayedAt: serverTimestamp(),
        rankPoints: 0
      });
    }
  }
}

async function listPlayers() {
  const playersRef = collection(db, 'players');
  const playersSnap = await getDocs(query(playersRef, orderBy('displayName')));
  return playersSnap.docs.map((d) => ({
    id: d.id,
    ...d.data()
  }));
}

function setActivePlayer(playerId) {
  activePlayerId = playerId;
  localStorage.setItem('misiones_active_player', playerId);
}

function getActivePlayer() {
  return activePlayerId;
}


async function logLogin({ playerId }) {
  const targetPlayer = playerId || getActivePlayer();
  await addDoc(collection(db, 'players', targetPlayer, 'logins'), {
    timestamp: serverTimestamp(),
    clientDate: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform || 'unknown',
    language: navigator.language || 'es-MX'
  });
}

async function save(path, data) {
  const playerId = getActivePlayer();
  const nowIso = new Date().toISOString();
  const sessionId = makeSessionId();

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId), {
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    mode: 'general',
    deviceId: navigator.userAgent.slice(0, 60),
    totalAttempts: 0,
    correct: 0,
    wrong: 0,
    durationMs: 0,
    sourcePath: path,
    clientDate: nowIso
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'stats', 'summary'), {
    rankPoints: Number(data.points || 0),
    lastPlayedAt: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'snapshots', 'latest'), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });

  return true;
}

async function saveAttempt(payload) {
  const playerId = getActivePlayer();
  const sessionId = payload.sessionId || makeSessionId();
  const attemptId = payload.attemptId || `a_${String(payload.attemptNumber || 1).padStart(4, '0')}`;

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId), {
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    mode: payload.mode || 'general',
    totalAttempts: payload.totalAttempts || 0,
    correct: payload.correct || 0,
    wrong: payload.wrong || 0,
    durationMs: payload.durationMs || 0,
    device: payload.device || {},
    clientDate: payload.clientDate || new Date().toISOString()
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId, 'attempts', attemptId), {
    question: payload.question || '',
    expectedAnswer: payload.expectedAnswer ?? 0,
    userAnswer: payload.userAnswer ?? 0,
    isCorrect: Boolean(payload.isCorrect),
    timeMs: payload.timeMs || 0,
    difficulty: payload.difficulty || 'normal',
    device: payload.device || {},
    clientDate: payload.clientDate || new Date().toISOString(),
    timestamp: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'stats', 'summary'), {
    totalAttempts: payload.totalAttempts || 0,
    totalCorrect: payload.correct || 0,
    totalWrong: payload.wrong || 0,
    totalTimeMs: payload.durationMs || 0,
    rankPoints: payload.points || 0,
    lastPlayedAt: serverTimestamp()
  }, { merge: true });

  return { playerId, sessionId, attemptId };
}

window.FirebasePlaceholder = {
  save,
  saveAttempt,
  ensureDefaultPlayers,
  listPlayers,
  setActivePlayer,
  getActivePlayer,
  logLogin
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
