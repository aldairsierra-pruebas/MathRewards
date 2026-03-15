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
  addDoc,
  limit
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
  { id: 'Isaac', displayName: 'Isaac', avatar: 'robot-1' },
  { id: 'Mateo', displayName: 'Mateo', avatar: 'robot-2' },
  { id: 'Pruebas', displayName: 'Pruebas', avatar: 'robot-3' }
];

const ACTIVE_PLAYER_STORAGE_KEY = 'misiones_active_player';
const ACTIVE_PLAYER_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 2 días

function getStoredActivePlayer() {
  try {
    const raw = localStorage.getItem(ACTIVE_PLAYER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.playerId || !parsed.savedAt) {
      localStorage.removeItem(ACTIVE_PLAYER_STORAGE_KEY);
      return null;
    }

    const age = Date.now() - Number(parsed.savedAt);
    if (Number.isNaN(age) || age > ACTIVE_PLAYER_TTL_MS) {
      localStorage.removeItem(ACTIVE_PLAYER_STORAGE_KEY);
      return null;
    }

    return parsed.playerId;
  } catch (error) {
    console.warn('No se pudo leer usuario activo local.', error);
    return null;
  }
}

let activePlayerId = getStoredActivePlayer() || DEFAULT_PLAYERS[0].id;

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
  try {
    localStorage.setItem(ACTIVE_PLAYER_STORAGE_KEY, JSON.stringify({
      playerId,
      savedAt: Date.now()
    }));
  } catch (error) {
    console.warn('No se pudo guardar usuario activo local.', error);
  }
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

async function saveAchievement(payload) {
  const playerId = getActivePlayer();
  await addDoc(collection(db, 'players', playerId, 'achievements'), {
    title: payload.title || '',
    medal: payload.medal || '',
    type: payload.type || 'mission',
    source: payload.source || 'game',
    category: payload.category || 'general',
    points: payload.points || 0,
    timestamp: serverTimestamp(),
    clientDate: new Date().toISOString()
  });
}

async function saveAttempt(payload) {
  const playerId = getActivePlayer();
  const sessionId = payload.sessionId || makeSessionId();
  const attemptId = payload.attemptId || `a_${String(payload.attemptNumber || 1).padStart(4, '0')}`;
  const mode = payload.mode || 'general';

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId), {
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    mode,
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
    wasTimedOut: Boolean(payload.wasTimedOut),
    timeMs: payload.timeMs || 0,
    thinkTimeMs: payload.thinkTimeMs || 0,
    writeTimeMs: payload.writeTimeMs || 0,
    totalTimeMs: payload.totalTimeMs || payload.timeMs || 0,
    difficulty: payload.difficulty || 'normal',
    difficultyLabel: payload.difficultyLabel || '',
    difficultyScore: payload.difficultyScore || 1,
    operationType: payload.operationType || mode,
    operands: payload.operands || [],
    responseScore: payload.responseScore || 0,
    editsCount: payload.editsCount || 0,
    inputErrors: payload.inputErrors || 0,
    hintsUsed: payload.hintsUsed || 0,
    inputLengthChanges: payload.inputLengthChanges || [],
    timeShown: payload.timeShown || null,
    firstInputTime: payload.firstInputTime || null,
    submitTime: payload.submitTime || null,
    responseValue: payload.responseValue || '',
    studentId: payload.studentId || playerId,
    problemId: payload.problemId || '',
    modelVersion: payload.modelVersion || 'v1',
    deviceType: payload.deviceType || '',
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

  await setDoc(doc(db, 'players', playerId, 'stats', 'summary', 'summary_by_category', mode), {
    category: mode,
    attempts: payload.totalAttemptsCategory || 0,
    correct: payload.correctCategory || 0,
    wrong: payload.wrongCategory || 0,
    highScore: payload.highScoreCategory || 0,
    avgResponseScore: payload.avgResponseScoreCategory || 0,
    lastPlayedAt: serverTimestamp(),
    updatedClientDate: payload.clientDate || new Date().toISOString()
  }, { merge: true });

  return { playerId, sessionId, attemptId };
}

async function getPlayerInsights(playerId) {
  const target = playerId || getActivePlayer();
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const summarySnap = await getDoc(doc(db, 'players', target, 'stats', 'summary'));
  const summary = summarySnap.exists() ? summarySnap.data() : {};

  const categorySnap = await getDocs(collection(db, 'players', target, 'stats', 'summary', 'summary_by_category'));
  const byCategory = {};
  categorySnap.forEach((d)=>{ byCategory[d.id] = d.data(); });

  const sessionsSnap = await getDocs(query(collection(db, 'players', target, 'sessions'), orderBy('clientDate', 'desc'), limit(60)));
  let weekPoints = 0;
  let weekCorrect = 0;
  let weekSessions = 0;
  let dailyHighScore = 0;
  const today = new Date().toISOString().slice(0,10);

  sessionsSnap.forEach((docSnap)=>{
    const data = docSnap.data() || {};
    const clientDate = data.clientDate ? new Date(data.clientDate).getTime() : 0;
    const points = Number(data.rankPoints || data.points || 0);
    if(clientDate >= weekAgo){
      weekPoints += points;
      weekCorrect += Number(data.correct || 0);
      weekSessions += 1;
    }
    if((data.clientDate || '').startsWith(today)){
      dailyHighScore = Math.max(dailyHighScore, points);
    }
  });

  const achSnap = await getDocs(query(collection(db, 'players', target, 'achievements'), orderBy('clientDate', 'desc'), limit(12)));
  const recentAchievements = achSnap.docs.map((d)=> d.data());

  return {
    summary,
    byCategory,
    weekly: { weekPoints, weekCorrect, weekSessions, dailyHighScore },
    recentAchievements
  };
}

window.FirebasePlaceholder = {
  save,
  saveAttempt,
  saveAchievement,
  getPlayerInsights,
  ensureDefaultPlayers,
  listPlayers,
  setActivePlayer,
  getActivePlayer,
  logLogin
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
