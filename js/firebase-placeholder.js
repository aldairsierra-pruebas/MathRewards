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
  limit,
  arrayUnion
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
  { id: 'Pruebas', displayName: 'Pruebas', avatar: 'robot-3' },
  { id: 'Invitado', displayName: 'Invitado', avatar: 'robot-5' }
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
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  return `s_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}${pad(d.getMilliseconds(), 3)}_${randomSuffix}`;
}

function toSpanishCategory(mode) {
  const map = { add: 'Sumas', sub: 'Restas', mul: 'Multiplicaciones', challenge: 'Desafío' };
  return map[mode] || 'General';
}

function fromSpanishCategory(category) {
  const map = { Sumas: 'add', Restas: 'sub', Multiplicaciones: 'mul', Desafio: 'challenge', 'Desafío': 'challenge' };
  return map[category] || 'general';
}

function toDayId(isoDate) {
  return (isoDate || new Date().toISOString()).slice(0, 10);
}

function toStartHourId(isoDate, sessionId) {
  if (sessionId) return sessionId;
  const d = new Date(isoDate || new Date().toISOString());
  const hh = String(d.getHours()).padStart(2, '0');
  return `h_${hh}00`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'logro';
}

function makeAchievementId(payload, clientDate) {
  const d = new Date(clientDate || new Date().toISOString());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const titlePart = slugify(payload.title || payload.medal || payload.type || 'logro');
  const categoryPart = slugify(payload.category || 'general');
  return `ach_${y}${m}${day}_${hh}${mm}${ss}_${categoryPart}_${titlePart}`;
}

function toSortMs(data) {
  const clientMs = data.clientDate ? Date.parse(data.clientDate) : 0;
  if (!Number.isNaN(clientMs) && clientMs > 0) return clientMs;
  const ts = data.timestamp;
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
  return 0;
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

async function updatePlayerPresence({
  playerId,
  sessionId = null,
  currentCategory = null,
  isActive = true,
  lastClientDate = new Date().toISOString(),
  extra = {}
} = {}) {
  const targetPlayer = playerId || getActivePlayer();
  if (!targetPlayer) return;

  await setDoc(doc(db, 'players', targetPlayer, 'snapshots', 'latest'), {
    playerId: targetPlayer,
    sessionId,
    isActive,
    currentCategory,
    lastActivityAt: serverTimestamp(),
    lastClientDate,
    updatedAt: serverTimestamp(),
    ...extra
  }, { merge: true });
}

async function logLogin({ playerId }) {
  const targetPlayer = playerId || getActivePlayer();
  const clientDate = new Date().toISOString();
  await addDoc(collection(db, 'players', targetPlayer, 'logins'), {
    timestamp: serverTimestamp(),
    clientDate,
    userAgent: navigator.userAgent,
    platform: navigator.platform || 'unknown',
    language: navigator.language || 'es-MX'
  });

  await updatePlayerPresence({
    playerId: targetPlayer,
    lastClientDate: clientDate,
    extra: { loginAt: serverTimestamp() }
  });
}

async function save(path, data) {
  const playerId = getActivePlayer();
  const nowIso = new Date().toISOString();
  const hasPlayableData = [
    Number(data.totalAttempts || 0),
    Number(data.totalCorrect || 0),
    Number(data.totalWrong || 0),
    Number(data.totalTimeMs || 0),
    Number(data.currentStreak || 0),
    Number(data.bestStreak || 0),
    Number(data.points || 0)
  ].some((value) => value > 0) || Boolean(data.currentCategory) || Boolean(data.sessionId);

  if (!hasPlayableData) {
    return true;
  }

  const sessionId = data.sessionId || makeSessionId();

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId), {
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    mode: data.currentCategory || 'general',
    deviceId: navigator.userAgent.slice(0, 60),
    totalAttempts: Number(data.totalAttempts || 0),
    correct: Number(data.totalCorrect || 0),
    wrong: Number(data.totalWrong || 0),
    durationMs: Number(data.totalTimeMs || 0),
    points: Number(data.points || 0),
    rankPoints: Number(data.points || 0),
    sourcePath: path,
    clientDate: nowIso
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'stats', 'summary'), {
    totalAttempts: Number(data.totalAttempts || 0),
    totalCorrect: Number(data.totalCorrect || 0),
    totalWrong: Number(data.totalWrong || 0),
    totalTimeMs: Number(data.totalTimeMs || 0),
    rankPoints: Number(data.points || 0),
    currentStreak: Number(data.currentStreak || 0),
    lastPlayedAt: serverTimestamp()
  }, { merge: true });

  await updatePlayerPresence({
    playerId,
    sessionId,
    currentCategory: data.currentCategory || 'general',
    isActive: Boolean(data.isActive ?? true),
    lastClientDate: nowIso,
    extra: {
      ...data,
      playerId,
      sessionId,
      sourcePath: path
    }
  });

  return true;
}

async function saveAchievement(payload) {
  const playerId = getActivePlayer();
  const clientDate = new Date().toISOString();
  const achievementId = makeAchievementId(payload || {}, clientDate);

  await setDoc(doc(db, 'players', playerId, 'achievements', achievementId), {
    achievementId,
    title: payload.title || '',
    medal: payload.medal || '',
    type: payload.type || 'mission',
    source: payload.source || 'game',
    category: payload.category || 'general',
    points: payload.points || 0,
    missionId: payload.missionId || '',
    timestamp: serverTimestamp(),
    clientDate
  }, { merge: true });

  return { playerId, achievementId };
}

async function saveAttempt(payload) {
  const playerId = getActivePlayer();
  const sessionId = payload.sessionId || makeSessionId();
  const attemptId = payload.attemptId || `a_${String(payload.attemptNumber || 1).padStart(4, '0')}`;
  const mode = payload.mode || 'general';
  const clientDate = payload.clientDate || new Date().toISOString();
  const dayId = toDayId(clientDate);
  const categoryEs = toSpanishCategory(mode);
  const startHourId = toStartHourId(clientDate, sessionId);

  await setDoc(doc(db, 'players', playerId, 'sessions', sessionId), {
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    mode,
    totalAttempts: payload.totalAttempts || 0,
    correct: payload.correct || 0,
    wrong: payload.wrong || 0,
    durationMs: payload.durationMs || 0,
    device: payload.device || {},
    clientDate
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
    challengeType: payload.challengeType || null,
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
    clientDate,
    timestamp: serverTimestamp()
  }, { merge: true });

  await setDoc(doc(db, 'players', playerId, 'stats', 'summary'), {
    totalAttempts: payload.totalAttempts || 0,
    totalCorrect: payload.correct || 0,
    totalWrong: payload.wrong || 0,
    totalTimeMs: payload.durationMs || 0,
    rankPoints: payload.points || 0,
    currentStreak: payload.currentStreak || 0,
    bestStreak: Math.max(Number(payload.bestStreak || 0), Number(payload.currentStreak || 0)),
    lastPlayedAt: serverTimestamp()
  }, { merge: true });

  const problemLog = {
    problema: payload.question || '',
    respuestaUsuario: payload.userAnswer ?? '',
    respuestaEsperada: payload.expectedAnswer ?? '',
    tiempoTotalMs: payload.totalTimeMs || payload.timeMs || 0,
    tiempoPrimerCaracterMs: payload.thinkTimeMs || 0,
    tiempoEscrituraMs: payload.writeTimeMs || 0,
    clientDate
  };

  const resumenHora = {
    resumen: {
      intentos: payload.totalAttemptsCategory || 0,
      correctas: payload.correctCategory || 0,
      erroneas: payload.wrongCategory || 0,
      scoreAlto: payload.highScoreCategory || 0,
      scorePromedio: payload.avgResponseScoreCategory || 0
    },
    categoria: categoryEs,
    updatedAt: serverTimestamp(),
    updatedClientDate: clientDate
  };

  if (payload.isCorrect) {
    resumenHora.correctas = arrayUnion(problemLog);
  } else {
    resumenHora.erroneas = arrayUnion(problemLog);
  }

  await setDoc(
    doc(db, 'players', playerId, 'stats', 'summary', 'by_day', dayId, 'categorias', categoryEs, 'by_start_hour', startHourId),
    resumenHora,
    { merge: true }
  );
  const recentAttempts = Number(payload.recentAttempts || Math.min(payload.totalAttempts || 0, 10));
  const recentCorrect = Number(payload.recentCorrect || 0);
  const recentTimeMs = Number(payload.recentTimeMs || 0);
  const attemptsToday = Number(payload.totalAttempts || 0);
  const correctToday = Number(payload.correct || 0);
  const wrongToday = Number(payload.wrong || 0);
  const recentAccuracy = recentAttempts > 0 ? Math.round((recentCorrect / recentAttempts) * 100) : 0;
  const avgResponseTimeMsRecent = recentAttempts > 0 ? Math.round(recentTimeMs / recentAttempts) : 0;

  await updatePlayerPresence({
    playerId,
    sessionId,
    currentCategory: categoryEs,
    isActive: true,
    lastClientDate: clientDate,
    extra: {
      attemptsToday,
      correctToday,
      wrongToday,
      currentStreak: Number(payload.currentStreak || 0),
      recentAccuracy,
      avgResponseTimeMsRecent,
      lastQuestion: payload.question || '',
      lastAnswerCorrect: Boolean(payload.isCorrect),
      lastExpectedAnswer: payload.expectedAnswer ?? null,
      lastPlayerAnswer: payload.userAnswer ?? null,
      totalAttempts: Number(payload.totalAttempts || 0),
      totalCorrect: Number(payload.correct || 0),
      totalWrong: Number(payload.wrong || 0),
      totalTimeMs: Number(payload.durationMs || 0),
      points: Number(payload.points || 0),
      playerId,
      sessionId,
      currentCategoryLabel: categoryEs
    }
  });


  return { playerId, sessionId, attemptId };
}


async function getPlayerInsights(playerId) {
  const target = playerId || getActivePlayer();
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

  const summarySnap = await getDoc(doc(db, 'players', target, 'stats', 'summary'));
  const summary = summarySnap.exists() ? summarySnap.data() : {};

  const byCategory = { add: {}, sub: {}, mul: {}, challenge: {} };
  const daySnap = await getDocs(query(collection(db, 'players', target, 'stats', 'summary', 'by_day'), orderBy('__name__', 'desc'), limit(7)));

  for (const dayDoc of daySnap.docs) {
    const catSnap = await getDocs(collection(db, 'players', target, 'stats', 'summary', 'by_day', dayDoc.id, 'categorias'));
    for (const catDoc of catSnap.docs) {
      const mode = fromSpanishCategory(catDoc.id);
      if (!byCategory[mode]) byCategory[mode] = { attempts: 0, correct: 0, wrong: 0, highScore: 0, avgResponseScore: 0 };

      const hourSnap = await getDocs(collection(db, 'players', target, 'stats', 'summary', 'by_day', dayDoc.id, 'categorias', catDoc.id, 'by_start_hour'));
      hourSnap.forEach((hourDoc) => {
        const r = (hourDoc.data() || {}).resumen || {};
        const attempts = Number(r.intentos || 0);
        const correct = Number(r.correctas || 0);
        const wrong = Number(r.erroneas || 0);
        const highScore = Number(r.scoreAlto || 0);
        const avgResponseScore = Number(r.scorePromedio || 0);
        byCategory[mode].attempts = Number(byCategory[mode].attempts || 0) + attempts;
        byCategory[mode].correct = Number(byCategory[mode].correct || 0) + correct;
        byCategory[mode].wrong = Number(byCategory[mode].wrong || 0) + wrong;
        byCategory[mode].highScore = Math.max(Number(byCategory[mode].highScore || 0), highScore);
        byCategory[mode].weightedResponseScoreSum = Number(byCategory[mode].weightedResponseScoreSum || 0) + (avgResponseScore * attempts);
      });
    }
  }

  Object.values(byCategory).forEach((item) => {
    const attempts = Number(item.attempts || 0);
    item.avgResponseScore = attempts > 0 ? Math.round(Number(item.weightedResponseScoreSum || 0) / attempts) : 0;
    delete item.weightedResponseScoreSum;
  });

  const sessionsSnap = await getDocs(query(collection(db, 'players', target, 'sessions'), orderBy('clientDate', 'desc'), limit(60)));
  let weekPoints = 0;
  let weekCorrect = 0;
  let weekSessions = 0;
  let dailyHighScore = 0;
  const today = new Date().toISOString().slice(0,10);

  sessionsSnap.forEach((docSnap)=>{
    const data = docSnap.data() || {};
    if (Number(data.totalAttempts || 0) <= 0) return;
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

  const achSnap = await getDocs(collection(db, 'players', target, 'achievements'));
  const recentAchievements = achSnap.docs
    .map((d)=> d.data())
    .sort((a, b) => toSortMs(b) - toSortMs(a))
    .slice(0, 12);

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
  logLogin,
  updatePlayerPresence
};

window.dispatchEvent(new CustomEvent('firebase-ready'));
