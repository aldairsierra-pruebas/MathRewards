// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:10, attempts:3, timeLimitSec:60 },
      { id:2, name:'Restas', type:'sub', questions:10, attempts:3, timeLimitSec:60 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:10, attempts:3, timeLimitSec:60 },
      { id:4, name:'Desafío', type:'challenge', questions:10, attempts:3, timeLimitSec:75 }
    ],
    basePoints: 10,
    maxLives: 3,
    modelVersion: 'v4-adaptive-mastery'
  };

  const ADAPTIVE_WINDOW_SIZE = 10;
  const ADAPTIVE_EVAL_WINDOW = 5;
  const ADAPTIVE_OFFSET_LIMITS = { min:-2, max:3 };
  const ADAPTIVE_COOLDOWN_STEPS = 3;
  const ADAPTIVE_PROFILE_STORAGE_KEY = 'math_rewards_adaptive_profiles';
  const ADAPTIVE_TYPES = ['add','sub','mul','challenge'];
  const SKILL_TYPE_MAP = {
    add_fluency:'add', add_no_carry:'add', add_with_carry:'add', add_double_carry:'add', add_three_digits:'add', add_challenge:'add',
    sub_fluency:'sub', sub_no_borrow:'sub', sub_with_borrow:'sub', sub_two_digit_borrow:'sub', sub_three_digits:'sub', sub_challenge:'sub',
    mul_easy_tables:'mul', mul_small_tables:'mul', mul_mixed_tables:'mul', mul_hard_tables:'mul', mul_two_digit:'mul', mul_challenge:'mul'
  };

  const MISSION_POOL = {
    speed: [
      { id:'speed_3_10', title:'⚡ Rayo mental', description:'3 correctas en <10s', target:3, medal:'🥉 Rápido' },
      { id:'speed_5_8', title:'⚡ Velocidad máxima', description:'5 correctas seguidas en <8s', target:5, medal:'🥈 Velocista' },
      { id:'speed_turbo', title:'⚡ Modo turbo', description:'3 correctas en menos de 20s total', target:1, medal:'🥇 Rayo matemático' }
    ],
    precision: [
      { id:'precision_5', title:'🎯 Sin fallar', description:'5 correctas seguidas', target:5, medal:'🧠 Calculador' },
      { id:'precision_10', title:'🎯 Mente precisa', description:'10 correctas seguidas', target:10, medal:'🧠 Precisión total' },
      { id:'precision_15', title:'🎯 Perfecto', description:'15 correctas seguidas', target:15, medal:'👑 Maestro del cálculo' }
    ],
    operation: [
      { id:'op_add_10', title:'➕ Rey de las sumas', description:'10 sumas correctas', target:10, medal:'🟢 Sumador experto' },
      { id:'op_sub_10', title:'➖ Maestro de restas', description:'10 restas correctas', target:10, medal:'🔵 Restador experto' },
      { id:'op_mul_10', title:'✖ Domador de tablas', description:'10 multiplicaciones correctas', target:10, medal:'🟣 Maestro de tablas' }
    ],
    streak: [
      { id:'streak_7', title:'🔥 En llamas', description:'7 correctas seguidas', target:7, medal:'🔥 Racha' },
      { id:'streak_12', title:'🔥 Imparable', description:'12 correctas seguidas', target:12, medal:'🔥 Super racha' },
      { id:'streak_20', title:'🔥 Leyenda', description:'20 correctas seguidas', target:20, medal:'🔥 Leyenda matemática' }
    ],
    daily: [
      { id:'daily_15', title:'📅 Práctica diaria', description:'Resolver 15 ejercicios', target:15, medal:'⭐ Constante' },
      { id:'daily_30', title:'📅 Entrenamiento completo', description:'Resolver 30 ejercicios', target:30, medal:'⭐ Disciplina' },
      { id:'daily_5m', title:'📅 Matemático del día', description:'Jugar 5 minutos', target:300, medal:'⭐ Hábito matemático' }
    ]
  };

  let state = {
    levelIndex:null,
    questionCount:0,
    points:0,
    xp:0,
    xpTarget:100,
    timer:null,
    time:0,
    medals:[],
    sessionId:null,
    sessionStartedAt:Date.now(),
    totalAttempts:0,
    totalCorrect:0,
    totalWrong:0,
    totalTimeMs:0,
    skipsRemaining:2,
    isPaused:false,
    isReadyToAnswer:false,
    hasStarted:false,
    playerId:'Isaac',
    adaptiveProfiles: {},
    recentResults: { add:[], sub:[], mul:[], challenge:[] },
    recentSkillResults: {},
    currentMetrics:null,
    stats: {
      correctStreak:0,
      fast10Streak:0,
      fast8Streak:0,
      turboTimes:[],
      correctByType:{ add:0, sub:0, mul:0, challenge:0 },
      attemptsCount:0,
      bestStreak:0
    },
    activeMissions: [],
    remoteMissions: [],
    currentCategory: { attempts:0, correct:0, scoreSum:0 },
    categoryAggregates: { add:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0}, sub:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0}, mul:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0}, challenge:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0} },
    medalHistory: [],
    presenceHeartbeatId:null,
    askedQuestionKeys: new Set()
  };

  const sGood = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');
  const sBad = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sCountdown = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sLifeLost = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sNextQuestion = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');

  const els = {
    d1: document.getElementById('d1'), u1: document.getElementById('u1'), d2: document.getElementById('d2'), u2: document.getElementById('u2'), signo: document.getElementById('signo'),
    respuesta: document.getElementById('respuesta'), btn: document.getElementById('btnResponder'), btnSkip: document.getElementById('btnSkip'), btnPause: document.getElementById('btnPause'), btnIniciar: document.getElementById('btnIniciar'), btnAbortCategory: document.getElementById('btnAbortCategory'),
    puntos: document.getElementById('puntos'), vidas: document.getElementById('vidas'), vidasUI: document.getElementById('vidasUI'), tiempo: document.getElementById('tiempo'),
    nivelTxt: document.getElementById('nivelTxt'), categoriaTxt: document.getElementById('categoriaTxt'), progresoNivelFill: document.getElementById('progresoNivelFill'),
    mensaje: document.getElementById('mensaje'), xpFill: document.getElementById('xpFill'), xpText: document.getElementById('xp'), xpTarget: document.getElementById('xpTarget'),
    panelOperacion: document.getElementById('panelOperacion'), countdown: document.getElementById('countdown'), overlay: document.getElementById('loginOverlay'), overlayPlayerSelect: document.getElementById('overlayPlayerSelect'),
    overlayStatus: document.getElementById('overlayStatus'), btnIngresar: document.getElementById('btnIngresar'), categoryMenu: document.getElementById('categoryMenu'), gameArea: document.getElementById('gameArea'), pauseOverlay: document.getElementById('pauseOverlay'), btnResumePause: document.getElementById('btnResumePause'), skipCount: document.getElementById('skipCount'),
    missionList: document.getElementById('missionList'), finalOverlay: document.getElementById('finalOverlay'), finalScoreText: document.getElementById('finalScoreText'), finalMessage: document.getElementById('finalMessage'),
    btnFinalContinue: document.getElementById('btnFinalContinue'), missionCongratsOverlay: document.getElementById('missionCongratsOverlay'), missionCongratsText: document.getElementById('missionCongratsText'),
    btnMissionContinue: document.getElementById('btnMissionContinue'),
    insWeekPoints: document.getElementById('insWeekPoints'), insWeekCorrect: document.getElementById('insWeekCorrect'), insDailyHigh: document.getElementById('insDailyHigh'), insWeekSessions: document.getElementById('insWeekSessions'),
    insByCategory: document.getElementById('insByCategory'), insAchievements: document.getElementById('insAchievements'),
    btnOpenMedals: document.getElementById('btnOpenMedals'), medalCount: document.getElementById('medalCount'), medalsOverlay: document.getElementById('medalsOverlay'),
    medalsHistoryList: document.getElementById('medalsHistoryList'), btnCloseMedals: document.getElementById('btnCloseMedals'), selectedPlayerBadge: document.getElementById('selectedPlayerBadge')
  };

  let currentAnswer = 0;
  let currentQuestionLabel = '';
  let currentOperands = [0,0];
  let currentOperationType = 'add';
  let currentQuestionMeta = { profile:'add_basic', label:'básica', difficultyScore:1 };

  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function clamp(v,min=0,max=1){ return Math.max(min, Math.min(max, v)); }
  function getCurrentLevel(){ return state.levelIndex === null ? null : config.levels[state.levelIndex]; }
  function nowIso(){ return new Date().toISOString(); }

  const ACTIVE_PLAYER_STORAGE_KEY = 'misiones_active_player';
  const ACTIVE_PLAYER_TTL_MS = 2 * 24 * 60 * 60 * 1000;

  function getCachedActivePlayerId(){
    try {
      const raw = localStorage.getItem(ACTIVE_PLAYER_STORAGE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !parsed.playerId || !parsed.savedAt) return null;
      const age = Date.now() - Number(parsed.savedAt);
      if(Number.isNaN(age) || age > ACTIVE_PLAYER_TTL_MS) return null;
      return parsed.playerId;
    } catch(_e){
      return null;
    }
  }

  function buildSessionId(mode = 'general'){
    const d = new Date();
    const pad = (n, size = 2) => String(n).padStart(size,'0');
    const modeLabel = ({ add:'sumas', sub:'restas', mul:'multiplicaciones', challenge:'desafio' }[mode] || String(mode || 'general').toLowerCase().replace(/[^a-z0-9]+/g,'-'));
    return `${pad(d.getDate())}${pad(d.getMonth()+1)}${d.getFullYear()}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${modeLabel}`;
  }

  function daySeed(){
    const d = new Date();
    return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
  }


  function createAdaptiveProfile(type, overrides = {}){
    const masteryScore = clamp(Number(overrides.masteryScore ?? 50), 0, 100);
    const lastTier = clamp(Number(overrides.lastTier ?? Math.round(((masteryScore / 100) * (ADAPTIVE_OFFSET_LIMITS.max - ADAPTIVE_OFFSET_LIMITS.min)) + ADAPTIVE_OFFSET_LIMITS.min)), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max);
    return {
      type,
      masteryScore,
      lastTier,
      stableCount: Math.max(0, Number(overrides.stableCount ?? 0)),
      recentAccuracyShort: clamp(Number(overrides.recentAccuracyShort ?? 0), 0, 1),
      recentAccuracyLong: clamp(Number(overrides.recentAccuracyLong ?? 0), 0, 1),
      recentSpeedShort: Math.max(0, Number(overrides.recentSpeedShort ?? 0)),
      recentSpeedLong: Math.max(0, Number(overrides.recentSpeedLong ?? 0)),
      positiveEvalCount: Math.max(0, Number(overrides.positiveEvalCount ?? 0)),
      negativeEvalCount: Math.max(0, Number(overrides.negativeEvalCount ?? 0)),
      cooldownRemaining: Math.max(0, Number(overrides.cooldownRemaining ?? 0)),
      lastDecisionAt: overrides.lastDecisionAt || null,
      lastDecision: overrides.lastDecision || 'hold',
      lastMetrics: overrides.lastMetrics || null
    };
  }

  function normalizeAdaptiveOffsets(raw = {}){
    const normalized = {};
    const keys = Array.from(new Set([...ADAPTIVE_TYPES, ...Object.keys(SKILL_TYPE_MAP), ...Object.keys(raw || {})]));
    keys.forEach((type)=>{
      const entry = raw[type];
      if(entry && typeof entry === 'object' && !Array.isArray(entry)){
        normalized[type] = createAdaptiveProfile(type, entry);
      } else {
        const legacyOffset = clamp(Number(entry ?? 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max);
        const masteryScore = Math.round(((legacyOffset - ADAPTIVE_OFFSET_LIMITS.min) / (ADAPTIVE_OFFSET_LIMITS.max - ADAPTIVE_OFFSET_LIMITS.min)) * 100);
        normalized[type] = createAdaptiveProfile(type, { masteryScore, lastTier: legacyOffset });
      }
    });
    return normalized;
  }

  function loadAdaptiveProfile(playerId){
    if(!playerId){ return normalizeAdaptiveOffsets(); }
    try {
      const raw = localStorage.getItem(ADAPTIVE_PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return normalizeAdaptiveOffsets(parsed[playerId] || {});
    } catch(_error){
      return normalizeAdaptiveOffsets();
    }
  }

  function saveAdaptiveProfile(playerId){
    if(!playerId){ return; }
    try {
      const raw = localStorage.getItem(ADAPTIVE_PROFILE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[playerId] = normalizeAdaptiveOffsets(state.adaptiveProfiles);
      localStorage.setItem(ADAPTIVE_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    } catch(error){
      console.warn('No se pudo guardar perfil adaptativo local.', error);
    }
  }

  function ensureAdaptiveProfile(type){
    if(!state.adaptiveProfiles[type]){
      state.adaptiveProfiles[type] = createAdaptiveProfile(type);
    }
    return state.adaptiveProfiles[type];
  }

  function masteryScoreToOffset(masteryScore){
    const ratio = clamp(Number(masteryScore ?? 50) / 100, 0, 1);
    return clamp(Math.round((ratio * (ADAPTIVE_OFFSET_LIMITS.max - ADAPTIVE_OFFSET_LIMITS.min)) + ADAPTIVE_OFFSET_LIMITS.min), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max);
  }

  function getOffsetForType(type){
    return masteryScoreToOffset(ensureAdaptiveProfile(type).masteryScore);
  }

  function getDifficultyTier(type){
    return getOffsetForType(type) - ADAPTIVE_OFFSET_LIMITS.min;
  }

  function getMasteryProfile(type){
    return ensureAdaptiveProfile(type);
  }

  function weightedAverage(values){
    if(!values.length){ return 0; }
    return values.reduce((sum, value, index)=> sum + (value * (index + 1)), 0) / values.reduce((sum, _value, index)=> sum + index + 1, 0);
  }

  function pickDailyMissions(){
    const seed = daySeed();
    const groups = Object.keys(MISSION_POOL);
    state.activeMissions = groups.map((g, idx)=>{
      const arr = MISSION_POOL[g];
      const pick = arr[(seed + idx*7) % arr.length];
      return { ...pick, group:g, progress:0, completed:false };
    });
    renderMissions();
  }

  function renderMissions(){
    if(!els.missionList) return;
    els.missionList.innerHTML = '';
    const localMissions = (state.activeMissions || []).map((m)=> ({
      className: `mission-item ${m.completed ? 'done' : ''}` ,
      html: `<strong>${m.title}</strong><br><small>${m.description}</small><br><small>Progreso: ${m.group === 'daily' && m.id === 'daily_5m' ? `${Math.floor(m.progress)}s/${m.target}s` : `${m.progress}/${m.target}`}</small>`
    }));
    const remoteMissions = (state.remoteMissions || []).map((m)=> ({
      className: 'mission-item',
      html: `<strong>🎯 ${m.title || 'Misión personalizada'}</strong><br><small>${m.description || 'Sin descripción'}</small><br><small>Expira: ${m.expiresAt ? new Date(m.expiresAt).toLocaleString('es-MX') : 'Sin vencimiento'}</small>${m.rewardLabel ? `<br><small>Premio: ${m.rewardLabel}</small>` : ''}`
    }));
    [...localMissions, ...remoteMissions].forEach((entry)=>{
      const div = document.createElement('div');
      div.className = entry.className;
      div.innerHTML = entry.html;
      els.missionList.appendChild(div);
    });
    if(!localMissions.length && !remoteMissions.length){ els.missionList.innerHTML = '<div class="mission-item">Sin misiones activas.</div>'; }
  }


  function updateMedalSummary(){
    if(!els.medalCount) return;
    const unique = new Set((state.medalHistory || []).map((m)=>m.medal || m.title || ''));
    els.medalCount.innerText = String(unique.size || 0);
  }

  function renderMedalsHistory(){
    if(!els.medalsHistoryList) return;
    const list = (state.medalHistory || []).slice().sort((a,b)=> (b.date || '').localeCompare(a.date || ''));
    if(!list.length){
      els.medalsHistoryList.innerText = 'Sin medallas aún.';
      return;
    }
    els.medalsHistoryList.innerHTML = list.map((m)=>`<div class="medal-row"><strong>${m.medal || '🏅'} ${m.title || 'Logro'}</strong><br><small>${(m.date || '').slice(0,10)}</small></div>`).join('');
  }

  function showMissionCongrats(mission){
    if(!state.medals.includes(mission.medal)){ state.medals.push(mission.medal); }
    state.medalHistory.push({ medal: mission.medal, title: mission.title, date: nowIso() });
    updateMedalSummary();
    renderMedalsHistory();
    if(els.missionCongratsText){
      els.missionCongratsText.innerText = `${mission.title} completada. Ganaste: ${mission.medal}`;
    }
    els.missionCongratsOverlay.classList.remove('hidden');
    if(window.FirebasePlaceholder && typeof window.FirebasePlaceholder.saveAchievement === 'function'){
      window.FirebasePlaceholder.saveAchievement({ missionId: mission.id, title: mission.title, medal: mission.medal, type:'mission', category: mission.group, points: state.points }).catch(()=>{});
    }
  }

  function updateMissionProgress(context){
    const playSeconds = (Date.now() - state.sessionStartedAt) / 1000;
    state.activeMissions.forEach((m)=>{
      if(m.completed) return;

      if(m.id === 'speed_3_10'){ m.progress = state.stats.fast10Streak; }
      if(m.id === 'speed_5_8'){ m.progress = state.stats.fast8Streak; }
      if(m.id === 'speed_turbo'){ m.progress = (state.stats.turboTimes.length === 3 && state.stats.turboTimes.reduce((a,b)=>a+b,0) < 20) ? 1 : 0; }

      if(m.id === 'precision_5'){ m.progress = state.stats.correctStreak; }
      if(m.id === 'precision_10'){ m.progress = state.stats.correctStreak; }
      if(m.id === 'precision_15'){ m.progress = state.stats.correctStreak; }

      if(m.id === 'op_add_10'){ m.progress = state.stats.correctByType.add; }
      if(m.id === 'op_sub_10'){ m.progress = state.stats.correctByType.sub; }
      if(m.id === 'op_mul_10'){ m.progress = state.stats.correctByType.mul; }

      if(m.id === 'streak_7'){ m.progress = state.stats.correctStreak; }
      if(m.id === 'streak_12'){ m.progress = state.stats.correctStreak; }
      if(m.id === 'streak_20'){ m.progress = state.stats.correctStreak; }

      if(m.id === 'daily_15'){ m.progress = state.stats.attemptsCount; }
      if(m.id === 'daily_30'){ m.progress = state.stats.attemptsCount; }
      if(m.id === 'daily_5m'){ m.progress = playSeconds; }

      if(m.progress >= m.target){
        m.completed = true;
        showMissionCongrats(m);
      }
    });

    renderMissions();
  }


  function syncCompletedMissionsFromAchievements(achievements){
    const today = nowIso().slice(0,10);
    const completedIds = new Set((achievements || [])
      .filter((item)=> (item.type || 'mission') === 'mission' && String(item.clientDate || '').slice(0,10) === today)
      .map((item)=> item.missionId || item.title));

    state.activeMissions = (state.activeMissions || []).map((mission)=>{
      const isCompleted = completedIds.has(mission.id) || completedIds.has(mission.title);
      return isCompleted ? { ...mission, completed:true, progress:mission.target } : mission;
    });
    renderMissions();
  }

  function renderPlayerInsights(insights){
    if(!insights) return;
    const wk = insights.weekly || {};
    if(els.insWeekPoints) els.insWeekPoints.innerText = String(wk.weekPoints || 0);
    if(els.insWeekCorrect) els.insWeekCorrect.innerText = String(wk.weekCorrect || 0);
    if(els.insDailyHigh) els.insDailyHigh.innerText = String(wk.dailyHighScore || 0);
    if(els.insWeekSessions) els.insWeekSessions.innerText = String(wk.weekSessions || 0);

    if(els.insByCategory){
      const byCat = insights.byCategory || {};
      const labels = { add:'Sumas', sub:'Restas', mul:'Multiplicaciones', challenge:'Desafío' };
      const rows = Object.entries(byCat)
        .filter(([k])=>['add','sub','mul','challenge'].includes(k))
        .map(([k,v])=>`${labels[k]}: ${v.correct || 0}/${v.attempts || 0} · HS ${v.highScore || 0} · Avg ${v.avgResponseScore || 0}`);
      els.insByCategory.innerHTML = rows.length ? rows.map((r)=>`<div>${r}</div>`).join('') : 'Sin datos';
    }

    if(els.insAchievements){
      const ach = (insights.recentAchievements || []).slice(0,8);
      els.insAchievements.innerHTML = ach.length ? ach.map((a)=>`<span class="badge-chip">${a.medal || '🏅'} ${a.title || 'Logro'}</span>`).join('') : 'Sin registros';
      state.medalHistory = ach.map((a)=>({ medal:a.medal || '🏅', title:a.title || 'Logro', date:a.clientDate || '' }));
      syncCompletedMissionsFromAchievements(insights.recentAchievements || []);
      updateMedalSummary();
      renderMedalsHistory();
    }

    const fromDb = insights.byCategory || {};
    ['add','sub','mul','challenge'].forEach((k)=>{
      const d = fromDb[k] || {};
      state.categoryAggregates[k] = {
        attempts: Number(d.attempts || 0),
        correct: Number(d.correct || 0),
        wrong: Number(d.wrong || 0),
        highScore: Number(d.highScore || 0),
        scoreSum: Number((d.avgResponseScore || 0) * (d.attempts || 0))
      };
    });
  }


  async function refreshRemoteMissions(playerId){
    if(!window.FirebasePlaceholder || typeof window.FirebasePlaceholder.listPlayerMissions !== 'function'){ return; }
    try{
      state.remoteMissions = await window.FirebasePlaceholder.listPlayerMissions(playerId || state.playerId);
      renderMissions();
    }catch(error){
      console.warn('No se pudieron cargar misiones remotas.', error);
    }
  }

  async function refreshPlayerInsights(playerId){
    if(!window.FirebasePlaceholder || typeof window.FirebasePlaceholder.getPlayerInsights !== 'function') return;
    try{
      const insights = await window.FirebasePlaceholder.getPlayerInsights(playerId || state.playerId);
      renderPlayerInsights(insights);
    }catch(e){
      console.warn('No se pudo cargar insights del jugador', e);
    }
  }

  function inferDeviceType(){ return ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'touch' : 'keyboard'; }

  async function syncPresence(extra = {}){
    if(!window.FirebasePlaceholder || typeof window.FirebasePlaceholder.updatePlayerPresence !== 'function' || !state.playerId){ return; }
    try{
      const level = getCurrentLevel();
      await window.FirebasePlaceholder.updatePlayerPresence({
        playerId: state.playerId,
        sessionId: state.sessionId,
        currentCategory: level ? level.name : null,
        isActive: Boolean(state.hasStarted || state.levelIndex !== null),
        lastClientDate: nowIso(),
        extra
      });
    }catch(error){
      console.warn('No se pudo sincronizar presencia.', error);
    }
  }

  function startPresenceHeartbeat(){
    stopPresenceHeartbeat();
    state.presenceHeartbeatId = setInterval(()=>{
      if(document.hidden || !state.playerId || !state.sessionId || state.levelIndex === null){ return; }
      syncPresence({ currentStreak: state.stats.correctStreak, skipsRemaining: state.skipsRemaining }).catch(()=>{});
    }, 45000);
  }

  function stopPresenceHeartbeat(){
    if(state.presenceHeartbeatId){
      clearInterval(state.presenceHeartbeatId);
      state.presenceHeartbeatId = null;
    }
  }

  function createQuestionMetrics(){
    return {
      time_shown_ms: Date.now(), time_shown: nowIso(), first_input_time_ms: null, first_input_time: null,
      submit_time_ms: null, submit_time: null, edits_count: 0, input_length_changes: [], hints_used: 0, input_errors: 0, response_value: '',
      device_info: { type: inferDeviceType(), userAgent: navigator.userAgent, platform: navigator.platform || 'unknown', language: navigator.language || 'es-MX' }
    };
  }

  function setupInputTracking(){
    els.respuesta.addEventListener('input', ()=>{
      const raw = els.respuesta.value;
      const onlyDigits = raw.replace(/\D/g, '');
      if(raw !== onlyDigits && state.currentMetrics){ state.currentMetrics.input_errors += 1; }
      const cropped = onlyDigits.slice(0,3);
      if(cropped !== els.respuesta.value && state.currentMetrics){ state.currentMetrics.input_errors += 1; }

      if(state.currentMetrics){
        if(!state.currentMetrics.first_input_time_ms && cropped.length > 0){
          state.currentMetrics.first_input_time_ms = Date.now();
          state.currentMetrics.first_input_time = nowIso();
        }
        const prev = state.currentMetrics.input_length_changes[state.currentMetrics.input_length_changes.length-1];
        const prevLen = prev ? prev.length : 0;
        if(prevLen !== cropped.length){
          state.currentMetrics.input_length_changes.push({ t: nowIso(), length: cropped.length });
          if(cropped.length < prevLen){ state.currentMetrics.edits_count += 1; }
        }
      }
      els.respuesta.value = cropped;
      if(state.levelIndex !== null){
        schedulePresenceUpdate({ currentQuestion: currentQuestionLabel, currentResponseDraft: cropped });
      }
    });

    els.respuesta.addEventListener('keydown', (e)=>{
      if(e.key === 'Backspace' && state.currentMetrics){ state.currentMetrics.edits_count += 1; }
      if(e.key === 'Enter'){ e.preventDefault(); verifyAnswer(); }
    });
  }

  function setGameControlsEnabled(enabled){ els.btn.disabled = !enabled; els.btnSkip.disabled = !enabled; if(els.btnPause) els.btnPause.disabled = !enabled; els.respuesta.disabled = !enabled; }
  function setDefaultInput(){ els.respuesta.value = ''; }
  let presenceInputDebounce = null;

  function schedulePresenceUpdate(extra = {}, delayMs = 250){
    if(presenceInputDebounce){ clearTimeout(presenceInputDebounce); }
    presenceInputDebounce = setTimeout(()=>{
      syncPresence(extra).catch(()=>{});
    }, delayMs);
  }

  function updateHearts(animatedLostIndex){
    if(els.vidasUI){ els.vidasUI.innerHTML = ''; }
  }

  function updateSkipCounter(){
    if(els.skipCount){ els.skipCount.innerText = String(Math.max(0, state.skipsRemaining)); }
    if(els.btnSkip){ els.btnSkip.disabled = !state.isReadyToAnswer || state.isPaused || state.skipsRemaining <= 0; }
  }

  function updateSelectedPlayerBadge(){
    if(!els.selectedPlayerBadge) return;
    els.selectedPlayerBadge.innerText = `👤 Jugador: ${state.playerId || '—'}`;
  }

  function resetCategoryView(message = 'Selecciona una categoría para iniciar.') {
    clearInterval(state.timer);
    state.hasStarted = false;
    state.isPaused = false;
    state.isReadyToAnswer = false;
    state.levelIndex = null;
    state.questionCount = 0;
    state.time = 0;
    state.skipsRemaining = 2;
    state.sessionId = null;
    state.currentCategory = { attempts:0, correct:0, scoreSum:0 };
    state.askedQuestionKeys = new Set();
    state.currentMetrics = null;
    currentQuestionLabel = '';
    currentAnswer = 0;
    currentOperands = [0,0];
    if(els.pauseOverlay) els.pauseOverlay.classList.add('hidden');
    els.countdown.innerText = '';
    els.panelOperacion.classList.remove('hidden');
    els.panelOperacion.classList.add('disabled-panel');
    els.gameArea.classList.add('hidden');
    els.categoryMenu.classList.remove('hidden');
    els.btnIniciar.style.display = 'inline-block';
    els.btnIniciar.disabled = false;
    setDefaultInput();
    setGameControlsEnabled(false);
    els.mensaje.innerText = message;
    updateHUD();
    saveLocal();
    syncPresence({ currentCategory: null, currentQuestion: '', currentResponseDraft: '', isPaused:false, sessionAborted:true }).catch(()=>{});
  }

  function abortCurrentCategory(){
    if(state.levelIndex === null){
      els.mensaje.innerText = 'Primero elige una categoría.';
      return;
    }
    completePendingAsAbandoned('Abandono de categoría');
    resetCategoryView('Regresaste a categorías. Puedes elegir otra misión matemática.');
  }

  function updateHUD(){
    const lvl = getCurrentLevel();
    els.puntos.innerText = state.points;
    els.vidas.innerText = '—';
    els.tiempo.innerText = state.time;
    els.xpText.innerText = state.xp;
    els.xpTarget.innerText = state.xpTarget;
    els.xpFill.style.width = Math.min(100,(state.xp/state.xpTarget)*100) + '%';

    if(!lvl){
      els.nivelTxt.innerText = '-';
      els.categoriaTxt.innerText = 'Selecciona una categoría';
      els.progresoNivelFill.style.width = '0%';
    } else {
      els.nivelTxt.innerText = lvl.name;
      const currentProgress = Math.min(state.questionCount + 1, lvl.questions);
      els.categoriaTxt.innerText = `${lvl.name} (${currentProgress}/${lvl.questions})`;
      els.progresoNivelFill.style.width = `${(state.questionCount/lvl.questions)*100}%`;
    }
    updateHearts();
    updateSkipCounter();
    updateSelectedPlayerBadge();
  }


  function randomFrom(items){ return items[rand(0, items.length - 1)]; }


  function getProfileType(skillProfile){
    return SKILL_TYPE_MAP[skillProfile] || 'challenge';
  }

  function getResultsForKey(key, isSkill = false){
    const source = isSkill ? state.recentSkillResults : state.recentResults;
    if(!source[key]){ source[key] = []; }
    return source[key];
  }

  function getSkillProfilesForType(type){
    return Object.keys(SKILL_TYPE_MAP).filter((key)=> SKILL_TYPE_MAP[key] === type);
  }

  function chooseSkillProfileForType(type, tier){
    const profilesByType = {
      add:['add_fluency','add_no_carry','add_with_carry','add_double_carry','add_three_digits','add_challenge'],
      sub:['sub_fluency','sub_no_borrow','sub_with_borrow','sub_two_digit_borrow','sub_three_digits','sub_challenge'],
      mul:['mul_easy_tables','mul_small_tables','mul_mixed_tables','mul_hard_tables','mul_two_digit','mul_challenge']
    };
    const options = profilesByType[type] || [];
    if(!options.length){ return null; }
    const preferredIndex = clamp(Math.round(Number(tier || 0)), 0, options.length - 1);
    const scored = options.map((profile, index)=>{
      const mastery = getMasteryProfile(profile).masteryScore;
      const distancePenalty = Math.abs(index - preferredIndex) * 9;
      const weaknessBonus = (100 - mastery) * 0.45;
      const recency = getResultsForKey(profile, true).slice(-ADAPTIVE_EVAL_WINDOW);
      const recentWrong = recency.filter((item)=>!item.correct).length * 6;
      return { profile, score: weaknessBonus + recentWrong - distancePenalty };
    }).sort((a,b)=> b.score - a.score);

    const top = scored[0];
    const fallback = options[preferredIndex];
    if(!top){ return fallback; }
    const fallbackGap = Math.abs(options.indexOf(top.profile) - preferredIndex);
    if(fallbackGap > 2){
      return fallback;
    }
    return top.profile;
  }

  function buildAdditionQuestion(tier, preferredProfile = null){
    const profiles = {
      add_fluency: ()=> { const a = rand(1, 9); const b = rand(1, 9); return { a, b, profile:'add_fluency', label:'sumas de una cifra', difficultyScore:1 }; },
      add_no_carry: ()=> { const a = rand(10, 40); let b = rand(10, 40); if(((a % 10) + (b % 10)) >= 10){ b = Math.max(10, b - ((a % 10) + (b % 10) - 9)); } return { a, b, profile:'add_no_carry', label:'sumas sin llevar', difficultyScore:2 }; },
      add_with_carry: ()=> { const a = rand(18, 69); let b = rand(11, 39); if(((a % 10) + (b % 10)) < 10){ b += 10 - (((a % 10) + (b % 10)) % 10); } return { a, b, profile:'add_with_carry', label:'sumas con llevar', difficultyScore:3 }; },
      add_double_carry: ()=> { const a = rand(35, 89); const b = rand(24, 79); return { a, b, profile:'add_double_carry', label:'sumas de dos cifras con llevar', difficultyScore:4 }; },
      add_three_digits: ()=> { const a = rand(125, 489); const b = rand(115, 389); return { a, b, profile:'add_three_digits', label:'sumas de tres cifras', difficultyScore:5 }; },
      add_challenge: ()=> { const a = rand(245, 789); const b = rand(165, 698); return { a, b, profile:'add_challenge', label:'sumas de reto', difficultyScore:6 }; }
    };
    const order = ['add_fluency','add_no_carry','add_with_carry','add_double_carry','add_three_digits','add_challenge'];
    const key = preferredProfile && profiles[preferredProfile] ? preferredProfile : order[Math.max(0, Math.min(order.length - 1, tier))];
    const built = profiles[key]();
    return { ...built, answer: built.a + built.b, sign:'+', labelText: `${built.a} + ${built.b}` };
  }

  function buildSubtractionQuestion(tier, preferredProfile = null){
    const profiles = {
      sub_fluency: ()=> { let a = rand(4, 18); let b = rand(1, a - 1); return { a, b, profile:'sub_fluency', label:'restas simples', difficultyScore:1 }; },
      sub_no_borrow: ()=> { let a = rand(20, 60); let b = rand(10, 39); if((a % 10) < (b % 10)){ b = Math.max(10, b - ((b % 10) - (a % 10))); } if(b >= a){ b = a - rand(1, 9); } return { a, b, profile:'sub_no_borrow', label:'restas sin préstamo', difficultyScore:2 }; },
      sub_with_borrow: ()=> { let a = rand(31, 79); let b = rand(12, 48); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(11, 25); } return { a, b, profile:'sub_with_borrow', label:'restas con préstamo', difficultyScore:3 }; },
      sub_two_digit_borrow: ()=> { let a = rand(60, 99); let b = rand(25, 78); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(11, 18); } return { a, b, profile:'sub_two_digit_borrow', label:'restas de dos cifras con préstamo', difficultyScore:4 }; },
      sub_three_digits: ()=> { let a = rand(120, 480); let b = rand(35, 289); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(25, 80); } return { a, b, profile:'sub_three_digits', label:'restas de tres cifras', difficultyScore:5 }; },
      sub_challenge: ()=> { let a = rand(300, 950); let b = rand(120, 780); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(50, 120); } return { a, b, profile:'sub_challenge', label:'restas de reto', difficultyScore:6 }; }
    };
    const order = ['sub_fluency','sub_no_borrow','sub_with_borrow','sub_two_digit_borrow','sub_three_digits','sub_challenge'];
    const key = preferredProfile && profiles[preferredProfile] ? preferredProfile : order[Math.max(0, Math.min(order.length - 1, tier))];
    const built = profiles[key]();
    return { ...built, answer: built.a - built.b, sign:'-', labelText: `${built.a} - ${built.b}` };
  }

  function buildMultiplicationQuestion(tier, preferredProfile = null){
    const profiles = {
      mul_easy_tables: ()=> { const easy = randomFrom([1,2,5,10]); const other = rand(1, 10); return { a: easy, b: other, profile:'mul_easy_tables', label:'tablas fáciles', difficultyScore:1 }; },
      mul_small_tables: ()=> { const a = rand(2, 6); const b = rand(2, 10); return { a, b, profile:'mul_small_tables', label:'tablas pequeñas', difficultyScore:2 }; },
      mul_mixed_tables: ()=> { const a = rand(4, 9); const b = rand(3, 10); return { a, b, profile:'mul_mixed_tables', label:'tablas mixtas', difficultyScore:3 }; },
      mul_hard_tables: ()=> { const pairs = [[7,8],[8,9],[6,7],[7,9],[8,8],[9,9]]; const [a,b] = randomFrom(pairs); return { a, b, profile:'mul_hard_tables', label:'tablas avanzadas', difficultyScore:4 }; },
      mul_two_digit: ()=> { const a = rand(11, 19); const b = rand(3, 9); return { a, b, profile:'mul_two_digit', label:'multiplicación de dos dígitos por una cifra', difficultyScore:5 }; },
      mul_challenge: ()=> { const a = rand(12, 24); const b = rand(6, 12); return { a, b, profile:'mul_challenge', label:'multiplicación de reto', difficultyScore:6 }; }
    };
    const order = ['mul_easy_tables','mul_small_tables','mul_mixed_tables','mul_hard_tables','mul_two_digit','mul_challenge'];
    const key = preferredProfile && profiles[preferredProfile] ? preferredProfile : order[Math.max(0, Math.min(order.length - 1, tier))];
    const built = profiles[key]();
    return { ...built, answer: built.a * built.b, sign:'×', labelText: `${built.a} × ${built.b}` };
  }

  function computeAdaptiveMetrics(results = []){
    if(!results.length){
      return { accuracy:0, avgTime:0, avgScore:0, avgThinkTime:0, avgEdits:0, wrongCount:0, slowCount:0, lowScoreCount:0 };
    }
    return {
      accuracy: results.filter((r)=>r.correct).length / results.length,
      avgTime: weightedAverage(results.map((r)=>r.totalTimeSec)),
      avgScore: weightedAverage(results.map((r)=>r.responseScore)),
      avgThinkTime: weightedAverage(results.map((r)=>r.thinkTimeSec)),
      avgEdits: weightedAverage(results.map((r)=>r.editsCount)),
      wrongCount: results.filter((r)=>!r.correct).length,
      slowCount: results.filter((r)=>r.totalTimeSec > r.slowThreshold).length,
      lowScoreCount: results.filter((r)=>r.responseScore < r.lowScoreThreshold).length
    };
  }

  function computeShortWindowMetrics(results = []){
    return computeAdaptiveMetrics(results.slice(-ADAPTIVE_EVAL_WINDOW));
  }

  function computeLongWindowMetrics(results = []){
    return computeAdaptiveMetrics(results.slice(-ADAPTIVE_WINDOW_SIZE));
  }

  function getAdaptiveSignal(metricsShort, metricsLong, streak, profileType){
    const thresholds = {
      fastThreshold: ({ add:16, sub:18, mul:14, challenge:20 }[profileType] || 18),
      slowThreshold: ({ add:30, sub:34, mul:26, challenge:36 }[profileType] || 32),
      thinkFastThreshold: ({ add:5, sub:6, mul:4, challenge:7 }[profileType] || 5)
    };
    const strongUp = metricsShort.accuracy >= 0.85 && metricsLong.accuracy >= 0.78 && metricsShort.avgTime <= thresholds.fastThreshold && metricsLong.avgTime <= thresholds.slowThreshold && metricsShort.avgScore >= 72 && metricsLong.avgScore >= 68 && metricsShort.avgThinkTime <= thresholds.thinkFastThreshold && streak >= 2;
    const strongDown = metricsShort.accuracy <= 0.55 || metricsShort.wrongCount >= 2 || metricsShort.slowCount >= 3 || metricsLong.accuracy <= 0.62 || metricsLong.wrongCount >= 3 || metricsLong.lowScoreCount >= 4 || (metricsShort.avgEdits >= 2.5 && metricsShort.avgTime > thresholds.slowThreshold);
    if(strongUp){ return 'up'; }
    if(strongDown){ return 'down'; }
    return 'hold';
  }

  function applyMasteryDelta(profile, decision, metricsShort, metricsLong){
    const oldScore = profile.masteryScore;
    let nextScore = oldScore;
    if(decision === 'up'){
      nextScore += Math.round(5 + (metricsShort.accuracy * 10) + ((metricsShort.avgScore - 60) / 8));
    } else if(decision === 'down'){
      nextScore -= Math.round(7 + ((1 - metricsShort.accuracy) * 12) + Math.max(0, (55 - metricsShort.avgScore) / 5));
    } else {
      const drift = ((metricsShort.accuracy + metricsLong.accuracy) / 2) >= 0.7 ? 1 : -1;
      nextScore += drift;
    }
    profile.masteryScore = clamp(nextScore, 0, 100);
  }

  function adjustDifficultyProfile(type, isSkillProfile = false){
    const recent = getResultsForKey(type, isSkillProfile);
    if(recent.length < ADAPTIVE_EVAL_WINDOW){ return; }

    const profile = getMasteryProfile(type);
    const metricsShort = computeShortWindowMetrics(recent);
    const metricsLong = computeLongWindowMetrics(recent);
    const profileType = isSkillProfile ? getProfileType(type) : type;
    const streak = (()=>{
      let value = 0;
      for(let idx = recent.length - 1; idx >= 0; idx--){
        if(!recent[idx].correct){ break; }
        value += 1;
      }
      return value;
    })();
    const signal = getAdaptiveSignal(metricsShort, metricsLong, streak, profileType);

    profile.recentAccuracyShort = metricsShort.accuracy;
    profile.recentAccuracyLong = metricsLong.accuracy;
    profile.recentSpeedShort = metricsShort.avgTime;
    profile.recentSpeedLong = metricsLong.avgTime;
    profile.lastMetrics = { short: metricsShort, long: metricsLong, streak };

    if(signal === 'up'){
      profile.positiveEvalCount += 1;
      profile.negativeEvalCount = 0;
    } else if(signal === 'down'){
      profile.negativeEvalCount += 1;
      profile.positiveEvalCount = 0;
    } else {
      profile.stableCount += 1;
      profile.positiveEvalCount = 0;
      profile.negativeEvalCount = 0;
      profile.lastDecision = 'hold';
      applyMasteryDelta(profile, 'hold', metricsShort, metricsLong);
      return;
    }

    if(profile.cooldownRemaining > 0){
      profile.cooldownRemaining -= 1;
      profile.stableCount += 1;
      profile.lastDecision = 'hold';
      applyMasteryDelta(profile, 'hold', metricsShort, metricsLong);
      return;
    }

    const shouldIncrease = profile.positiveEvalCount >= 2;
    const shouldDecrease = profile.negativeEvalCount >= 2 || metricsLong.wrongCount >= 2;
    const decision = shouldIncrease ? 'up' : (shouldDecrease ? 'down' : 'hold');

    applyMasteryDelta(profile, decision, metricsShort, metricsLong);
    const nextTier = masteryScoreToOffset(profile.masteryScore);

    if(decision !== 'hold' && nextTier !== profile.lastTier){
      profile.lastTier = nextTier;
      profile.cooldownRemaining = ADAPTIVE_COOLDOWN_STEPS;
      profile.stableCount = 0;
      profile.lastDecisionAt = nowIso();
    } else {
      profile.stableCount += 1;
    }

    profile.lastDecision = decision;
  }

  function getChallengeWeights(){
    const entries = ['add','sub','mul'].map((type)=>{
      const profile = getMasteryProfile(type);
      const weakness = 100 - profile.masteryScore;
      const accuracyPenalty = (1 - Number(profile.recentAccuracyLong || 0.5)) * 30;
      const speedPenalty = Math.min(20, Number(profile.recentSpeedLong || 0));
      const scorePenalty = profile.lastMetrics ? Math.max(0, 70 - Number(profile.lastMetrics.long.avgScore || 0)) : 8;
      return { type, weight: Math.max(1, Math.round(weakness + accuracyPenalty + speedPenalty + scorePenalty)) };
    });
    const spread = Math.max(...entries.map((entry)=>entry.weight)) - Math.min(...entries.map((entry)=>entry.weight));
    if(spread <= 8){
      return entries.reduce((acc, entry)=> ({ ...acc, [entry.type]: 1 }), {});
    }
    return entries.reduce((acc, entry)=> ({ ...acc, [entry.type]: entry.weight }), {});
  }

  function pickWeightedType(weights){
    const entries = Object.entries(weights);
    const total = entries.reduce((sum, [, weight])=> sum + Number(weight || 0), 0);
    let cursor = Math.random() * total;
    for(const [type, weight] of entries){
      cursor -= Number(weight || 0);
      if(cursor <= 0){ return type; }
    }
    return entries[0]?.[0] || 'add';
  }

  function generateChallengeQuestion(){
    const challengeType = pickWeightedType(getChallengeWeights());
    const baseTier = Math.max(getDifficultyTier(challengeType), getDifficultyTier('challenge'));
    const challengeTier = clamp(baseTier + rand(1,2), 0, 5);
    const preferredProfile = chooseSkillProfileForType(challengeType, challengeTier);
    const question = challengeType === 'add'
      ? buildAdditionQuestion(Math.max(2, challengeTier), preferredProfile)
      : challengeType === 'sub'
        ? buildSubtractionQuestion(Math.max(2, challengeTier), preferredProfile)
        : buildMultiplicationQuestion(Math.max(2, challengeTier), preferredProfile);
    return { type: challengeType, ...question, label: question.labelText, challengeWeights: getChallengeWeights() };
  }

  function deriveDifficulty(){
    const itemDifficulty = Number(currentQuestionMeta.difficultyScore || 1);
    return { score: itemDifficulty, itemDifficulty, label: currentQuestionMeta.label || 'general' };
  }

  function getAdaptiveBounds(type){
    const tier = getDifficultyTier(type);
    if(type === 'challenge'){
      return { tier, label:['muy fácil','fácil','normal','difícil','muy difícil','reto'][tier] || 'reto' };
    }
    const builders = { add: buildAdditionQuestion, sub: buildSubtractionQuestion, mul: buildMultiplicationQuestion };
    return { tier, generator: builders[type], preferredProfile: chooseSkillProfileForType(type, tier) };
  }
  function beginQuestionInteraction(){
    if(state.isPaused){ return; }
    state.isReadyToAnswer = true;
    setGameControlsEnabled(true);
    els.panelOperacion.classList.remove('disabled-panel');
    els.respuesta.focus();
    clearInterval(state.timer);
    state.timer = setInterval(()=>{
      state.time++;
      els.tiempo.innerText = state.time;
      handleTimeLimit();
    },1000);
  }

  function generateQuestion(){
    const lvl = getCurrentLevel();
    if(!lvl){ return; }
    clearInterval(state.timer);
    state.time = 0;
    els.tiempo.innerText = '0';

    let a,b;
    let question;
    let key = '';
    let safety = 0;
    do {
      if(lvl.type === 'challenge'){
        const challenge = generateChallengeQuestion();
        a = challenge.a;
        b = challenge.b;
        currentAnswer = challenge.answer;
        currentOperationType = challenge.type;
        currentQuestionMeta = { profile: challenge.profile, label: `${challenge.label}`, difficultyScore: challenge.difficultyScore, challengeWeights: challenge.challengeWeights || null };
        els.signo.innerText = challenge.sign;
        currentQuestionLabel = challenge.label;
      } else {
        const bounds = getAdaptiveBounds(lvl.type);
        currentOperationType = lvl.type;
        question = bounds.generator(bounds.tier, bounds.preferredProfile);
        a = question.a;
        b = question.b;
        currentAnswer = question.answer;
        currentQuestionMeta = { profile: question.profile, label: question.label, difficultyScore: question.difficultyScore };
        els.signo.innerText = question.sign;
        currentQuestionLabel = question.labelText;
      }
      key = `${lvl.type}|${currentOperationType}|${a}|${b}|${els.signo.innerText}`;
      safety += 1;
    } while(state.askedQuestionKeys.has(key) && safety < 40);
    state.askedQuestionKeys.add(key);

    currentOperands = [a,b];
    els.d1.innerText = Math.floor(a/10) || '';
    els.u1.innerText = a%10;
    els.d2.innerText = Math.floor(b/10) || '';
    els.u2.innerText = b%10;
    els.panelOperacion.classList.remove('hidden');
    setDefaultInput();
    state.currentMetrics = createQuestionMetrics();

    if(state.hasStarted){ els.btnIniciar.style.display = 'none'; beginQuestionInteraction(); }
    else {
      state.isReadyToAnswer = false;
      setGameControlsEnabled(false);
      els.panelOperacion.classList.add('disabled-panel');
      els.btnIniciar.style.display = 'inline-block';
      els.btnIniciar.disabled = false;
    }

    updateHUD();
    if(state.levelIndex !== null){
      syncPresence({ currentQuestion: currentQuestionLabel, currentResponseDraft: '', lastExpectedAnswer: currentAnswer }).catch(()=>{});
    }
    updateSkipCounter();
  }

  function scheduleNextQuestion(delayMs = 3000){
    state.isReadyToAnswer = false;
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    sNextQuestion.currentTime = 0;
    sNextQuestion.play().catch(()=>{});
    setTimeout(()=> generateQuestion(), delayMs);
  }

  function syncPausePresence(isPaused){
    syncPresence({
      isPaused,
      currentQuestion: isPaused ? 'Pause' : currentQuestionLabel,
      currentResponseDraft: ''
    }).catch(()=>{});
  }

  function pauseGame(){
    if(!state.isReadyToAnswer || state.isPaused || state.levelIndex === null){ return; }
    state.isPaused = true;
    state.isReadyToAnswer = false;
    clearInterval(state.timer);
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('hidden');
    els.pauseOverlay && els.pauseOverlay.classList.remove('hidden');
    els.mensaje.innerText = '⏸ Juego en pausa.';
    syncPausePresence(true);
    updateSkipCounter();
  }

  function resumeGame(){
    if(!state.isPaused){ return; }
    state.isPaused = false;
    els.pauseOverlay && els.pauseOverlay.classList.add('hidden');
    els.mensaje.innerText = '▶ Continuando con un nuevo reactivo.';
    syncPausePresence(false);
    scheduleNextQuestion(200);
  }

  function scoreResponse(correct, difficultyScore, totalTimeSec, writeTimeSec, editsCount, opType){
    const Tmax = { add:35, sub:45, mul:35 }[opType] || 40;
    const Wmax = 8;
    const C = correct ? 1 : 0;
    const D = clamp(difficultyScore / 5);
    const T = clamp(1 - (totalTimeSec / Tmax));
    const W = clamp(1 - (writeTimeSec / Wmax));
    const E = clamp(1 - Math.min(editsCount / 3, 1));
    return Math.round(100 * C * (0.55 + 0.15*D + 0.15*T + 0.10*W + 0.05*E));
  }

  function buildAttemptPayload({ answer, isCorrect, skipped, timedOut }){
    const lvl = getCurrentLevel() || { name:'general', type:'general' };
    const metrics = state.currentMetrics || createQuestionMetrics();
    metrics.submit_time_ms = Date.now();
    metrics.submit_time = nowIso();
    metrics.response_value = skipped ? '' : String(answer ?? '');

    const firstMs = metrics.first_input_time_ms || metrics.submit_time_ms;
    const thinkMs = Math.max(0, firstMs - metrics.time_shown_ms);
    const writeMs = Math.max(0, metrics.submit_time_ms - firstMs);
    const totalMs = Math.max(0, metrics.submit_time_ms - metrics.time_shown_ms);
    const difficulty = deriveDifficulty();
    const masteryProfileBefore = getMasteryProfile(lvl.type === 'challenge' ? currentOperationType : lvl.type);
    const masteryScoreBefore = Number(masteryProfileBefore.masteryScore || 0);
    const recommendedTier = getDifficultyTier(lvl.type === 'challenge' ? currentOperationType : lvl.type);
    const responseScore = scoreResponse(Boolean(isCorrect), difficulty.itemDifficulty, totalMs/1000, writeMs/1000, metrics.edits_count, currentOperationType);
    const categoryKey = lvl.type;
    const currentAggregate = state.categoryAggregates[categoryKey] || { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 };
    const nextAggregate = {
      attempts: Number(currentAggregate.attempts || 0) + 1,
      correct: Number(currentAggregate.correct || 0) + (isCorrect ? 1 : 0),
      wrong: Number(currentAggregate.wrong || 0) + (isCorrect ? 0 : 1),
      highScore: Math.max(Number(currentAggregate.highScore || 0), Number(responseScore || 0)),
      scoreSum: Number(currentAggregate.scoreSum || 0) + Number(responseScore || 0)
    };

    return {
      sessionId: state.sessionId,
      attemptNumber: state.totalAttempts,
      question: skipped ? `${currentQuestionLabel} (saltada)` : currentQuestionLabel,
      expectedAnswer: currentAnswer,
      userAnswer: skipped ? -1 : (answer ?? ''),
      isCorrect: Boolean(isCorrect),
      wasTimedOut: Boolean(timedOut),
      wasSkipped: Boolean(skipped),
      wasAbandoned: false,
      timeMs: totalMs,
      thinkTimeMs: thinkMs,
      writeTimeMs: writeMs,
      totalTimeMs: totalMs,
      difficulty: lvl.name,
      difficultyLabel: difficulty.label,
      difficultyScore: difficulty.itemDifficulty,
      itemDifficulty: difficulty.itemDifficulty,
      skillProfile: currentQuestionMeta.profile || null,
      itemSkillProfile: currentQuestionMeta.profile || null,
      masteryScoreBefore,
      masteryScoreAfter: masteryScoreBefore,
      recommendedTier,
      mode: lvl.type,
      operationType: currentOperationType,
      operands: currentOperands,
      totalAttempts: state.totalAttempts,
      correct: state.totalCorrect,
      wrong: state.totalWrong,
      durationMs: Date.now() - state.sessionStartedAt,
      points: state.points,
      responseScore,
      editsCount: metrics.edits_count,
      inputErrors: metrics.input_errors,
      hintsUsed: metrics.hints_used,
      inputLengthChanges: metrics.input_length_changes,
      timeShown: metrics.time_shown,
      firstInputTime: metrics.first_input_time,
      submitTime: metrics.submit_time,
      responseValue: metrics.response_value,
      studentId: state.playerId,
      problemId: `${lvl.type}_${currentOperands[0]}_${currentOperands[1]}`,
      modelVersion: config.modelVersion,
      device: metrics.device_info,
      deviceType: metrics.device_info.type,
      clientDate: nowIso(),
      totalAttemptsCategory: nextAggregate.attempts,
      correctCategory: nextAggregate.correct,
      wrongCategory: nextAggregate.wrong,
      highScoreCategory: nextAggregate.highScore,
      avgResponseScoreCategory: nextAggregate.attempts > 0 ? Math.round(nextAggregate.scoreSum / nextAggregate.attempts) : 0,
      currentStreak: state.stats.correctStreak,
      bestStreak: state.stats.bestStreak,
      recentAttempts: Math.min((getResultsForKey(lvl.type === 'challenge' ? currentOperationType : lvl.type, false) || []).length, 10),
      recentCorrect: (getResultsForKey(lvl.type === 'challenge' ? currentOperationType : lvl.type, false) || []).slice(-10).filter((item)=>item.correct).length,
      recentTimeMs: (getResultsForKey(lvl.type === 'challenge' ? currentOperationType : lvl.type, false) || []).slice(-10).reduce((sum, item)=> sum + (item.totalTimeSec * 1000), 0),
      challengeType: lvl.type === 'challenge' ? currentOperationType : null
    };
  }

  function registerAttempt(payload){
    state.stats.attemptsCount++;
    if(payload.isCorrect){
      state.stats.correctStreak++;
      state.stats.correctByType[payload.mode] = (state.stats.correctByType[payload.mode] || 0) + 1;
      if(payload.mode === 'challenge' && payload.operationType){
        state.stats.correctByType[payload.operationType] = (state.stats.correctByType[payload.operationType] || 0) + 1;
      }
      if((payload.totalTimeMs/1000) < 10){ state.stats.fast10Streak++; } else { state.stats.fast10Streak = 0; }
      if((payload.totalTimeMs/1000) < 8){ state.stats.fast8Streak++; } else { state.stats.fast8Streak = 0; }
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.correctStreak);
      state.stats.turboTimes.push(payload.totalTimeMs/1000);
      if(state.stats.turboTimes.length > 3){ state.stats.turboTimes.shift(); }
    } else {
      state.stats.correctStreak = 0;
      state.stats.fast10Streak = 0;
      state.stats.fast8Streak = 0;
      state.stats.turboTimes = [];
    }

    const type = payload.mode;
    const adaptiveType = payload.mode === 'challenge' && payload.operationType ? payload.operationType : type;
    const resultEntry = {
      correct: payload.isCorrect,
      totalTimeSec: payload.totalTimeMs / 1000,
      thinkTimeSec: payload.thinkTimeMs / 1000,
      writeTimeSec: payload.writeTimeMs / 1000,
      responseScore: Number(payload.responseScore || 0),
      editsCount: Number(payload.editsCount || 0),
      skillProfile: payload.skillProfile || null,
      fastThreshold: ({ add:16, sub:18, mul:14, challenge:20 }[adaptiveType] || 18),
      slowThreshold: ({ add:30, sub:34, mul:26, challenge:36 }[adaptiveType] || 32),
      thinkFastThreshold: ({ add:5, sub:6, mul:4, challenge:7 }[adaptiveType] || 5),
      lowScoreThreshold: ({ add:45, sub:45, mul:50, challenge:48 }[adaptiveType] || 45)
    };

    const skipFastHold = Boolean(payload.wasSkipped) && Number(payload.totalTimeMs || 0) <= 10000;
    if(!skipFastHold){
      const opResults = getResultsForKey(adaptiveType, false);
      opResults.push(resultEntry);
      if(opResults.length > ADAPTIVE_WINDOW_SIZE){ opResults.shift(); }

      if(type === 'challenge'){
        const challengeResults = getResultsForKey('challenge', false);
        challengeResults.push({ ...resultEntry, skillProfile: payload.skillProfile || null });
        if(challengeResults.length > ADAPTIVE_WINDOW_SIZE){ challengeResults.shift(); }
      }

      if(payload.skillProfile){
        const skillResults = getResultsForKey(payload.skillProfile, true);
        skillResults.push(resultEntry);
        if(skillResults.length > ADAPTIVE_WINDOW_SIZE){ skillResults.shift(); }
      }
    }

    const agg = state.categoryAggregates[type] || { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 };
    agg.attempts += 1;
    if(payload.isCorrect) agg.correct += 1; else agg.wrong += 1;
    agg.scoreSum += Number(payload.responseScore || 0);
    agg.highScore = Math.max(agg.highScore, Number(payload.responseScore || 0));
    state.categoryAggregates[type] = agg;

    if(!skipFastHold){
      adjustDifficultyProfile(adaptiveType);
      if(payload.skillProfile){ adjustDifficultyProfile(payload.skillProfile, true); }
      if(payload.mode === 'challenge'){ adjustDifficultyProfile('challenge'); }
    }
    payload.masteryScoreAfter = Number(getMasteryProfile(adaptiveType).masteryScore || payload.masteryScoreBefore || 0);
    saveAdaptiveProfile(state.playerId);

    if(window.AppStorage && typeof window.AppStorage.saveAttempt === 'function'){
      window.AppStorage.saveAttempt(payload);
    }

    updateMissionProgress(payload);

    syncPresence({
      currentStreak: state.stats.correctStreak,
      lastQuestion: payload.question,
      lastAnswerCorrect: payload.isCorrect,
      attemptsToday: payload.totalAttempts,
      correctToday: payload.correct,
      wrongToday: payload.wrong,
      recentAccuracy: payload.recentAttempts ? Math.round((payload.recentCorrect / payload.recentAttempts) * 100) : 0,
      avgResponseTimeMsRecent: payload.recentAttempts ? Math.round(payload.recentTimeMs / payload.recentAttempts) : 0,
      currentQuestion: currentQuestionLabel,
      currentResponseDraft: ''
    }).catch(()=>{});
  }

  function saveLocal(){
    if(window.AppStorage && typeof window.AppStorage.save === 'function'){
      const level = getCurrentLevel();
      window.AppStorage.save({
        playerId: state.playerId,
        sessionId: state.sessionId,
        currentCategory: level ? level.name : null,
        totalAttempts: state.totalAttempts,
        totalCorrect: state.totalCorrect,
        totalWrong: state.totalWrong,
        totalTimeMs: Date.now() - state.sessionStartedAt,
        currentStreak: state.stats.correctStreak,
        bestStreak: state.stats.bestStreak,
        points: state.points,
        xp: state.xp,
        levelIndex: state.levelIndex,
        medals: state.medals,
        adaptive: normalizeAdaptiveOffsets(state.adaptiveProfiles),
        isActive: Boolean(state.hasStarted || state.levelIndex !== null),
        date: nowIso()
      });
    }
  }

  function computeFinalCategoryFeedback(){
    const attempts = Math.max(1, state.currentCategory.attempts);
    const accuracy = (state.currentCategory.correct / attempts) * 100;
    const avgScore = state.currentCategory.scoreSum / attempts;
    const grade = Math.round((accuracy * 0.6) + (avgScore * 0.4));
    let message = '¡Sigue practicando! Cada intento te hace más fuerte.';
    if(grade >= 90){ message = '🌟 ¡Excelente! Resuelves muy bien; para perfeccionar tu calificación, mejora un poco tus tiempos de respuesta.'; }
    else if(grade >= 75){ message = '👏 ¡Muy bien! Vas por gran camino; con respuestas un poco más rápidas subirás aún más tu calificación.'; }
    else if(grade >= 60){ message = '💪 Buen avance. Si mejoras velocidad y precisión, tu calificación crecerá rápidamente.'; }
    else { message = '🧠 Buen esfuerzo. Sigue practicando y mejora tus tiempos para lograr una mejor calificación.'; }
    return { grade, message };
  }

  function showFinalCategoryScreen(){
    const { grade, message } = computeFinalCategoryFeedback();
    els.finalScoreText.innerText = `Calificación: ${grade}/100`;
    els.finalMessage.innerText = message;
    els.finalOverlay.classList.remove('hidden');
  }

  function buildAbandonedAttemptPayload(position){
    const lvl = getCurrentLevel() || { name:'general', type:'general' };
    const adaptiveType = lvl.type === 'challenge' ? currentOperationType : lvl.type;
    return {
      sessionId: state.sessionId,
      attemptNumber: state.totalAttempts,
      question: `Abandono (${position}/${lvl.questions})`,
      expectedAnswer: null,
      userAnswer: '',
      isCorrect: false,
      wasTimedOut: false,
      wasSkipped: false,
      wasAbandoned: true,
      timeMs: 16000,
      thinkTimeMs: 8000,
      writeTimeMs: 0,
      totalTimeMs: 16000,
      difficulty: lvl.name,
      difficultyLabel: 'abandono',
      difficultyScore: Number(currentQuestionMeta.difficultyScore || 1),
      itemDifficulty: Number(currentQuestionMeta.difficultyScore || 1),
      skillProfile: currentQuestionMeta.profile || null,
      itemSkillProfile: currentQuestionMeta.profile || null,
      masteryScoreBefore: Number(getMasteryProfile(adaptiveType).masteryScore || 0),
      masteryScoreAfter: Number(getMasteryProfile(adaptiveType).masteryScore || 0),
      recommendedTier: getDifficultyTier(adaptiveType),
      mode: lvl.type,
      operationType: adaptiveType,
      operands: currentOperands || [],
      totalAttempts: state.totalAttempts,
      correct: state.totalCorrect,
      wrong: state.totalWrong,
      durationMs: Date.now() - state.sessionStartedAt,
      points: state.points,
      responseScore: 0,
      editsCount: 0,
      inputErrors: 0,
      hintsUsed: 0,
      inputLengthChanges: [],
      timeShown: nowIso(),
      firstInputTime: nowIso(),
      submitTime: nowIso(),
      responseValue: '',
      studentId: state.playerId,
      problemId: `${lvl.type}_abandono_${position}`,
      modelVersion: config.modelVersion,
      device: { type:'web' },
      deviceType: 'web',
      clientDate: nowIso(),
      currentStreak: state.stats.correctStreak,
      bestStreak: state.stats.bestStreak,
      recentAttempts: Math.min((getResultsForKey(adaptiveType, false) || []).length, 10),
      recentCorrect: (getResultsForKey(adaptiveType, false) || []).slice(-10).filter((item)=>item.correct).length,
      recentTimeMs: (getResultsForKey(adaptiveType, false) || []).slice(-10).reduce((sum, item)=> sum + (item.totalTimeSec * 1000), 0),
      challengeType: lvl.type === 'challenge' ? adaptiveType : null
    };
  }

  function completePendingAsAbandoned(reason = 'Categoría abandonada'){
    const lvl = getCurrentLevel();
    if(!lvl){ return; }
    const pending = Math.max(0, lvl.questions - state.questionCount);
    if(pending <= 0){ return; }
    for(let i=0; i<pending; i++){
      state.totalAttempts++;
      state.totalWrong++;
      state.questionCount++;
      state.currentCategory.attempts++;
      const payload = buildAbandonedAttemptPayload(state.questionCount);
      registerAttempt(payload);
    }
    els.mensaje.innerText = `${reason}. Se registró como ${state.currentCategory.correct}/${lvl.questions} con etiqueta de abandono.`;
    saveLocal();
  }

  function handleTimeLimit(){
    const lvl = getCurrentLevel();
    if(!lvl || state.time < lvl.timeLimitSec){ return; }
    clearInterval(state.timer);
    applyWrongAnswer(`⌛ Se acabó el tiempo (${lvl.timeLimitSec}s). La respuesta era ${currentAnswer}`, false, true);
  }

  function applyWrongAnswer(message, skipped = false, timedOut = false){
    state.totalWrong++;
    state.totalAttempts++;

    sBad.currentTime = 0; sBad.play().catch(()=>{});
    els.mensaje.innerText = message;
    state.points = Math.max(0, state.points - 2);

    const attemptPayload = buildAttemptPayload({
      answer: skipped ? null : Number(els.respuesta.value || NaN),
      isCorrect: false,
      skipped,
      timedOut
    });

    state.currentCategory.attempts++;
    state.questionCount++;
    registerAttempt(attemptPayload);

    updateHUD();
    if(state.questionCount >= getCurrentLevel().questions){
      showFinalCategoryScreen();
      return;
    }
    saveLocal();
    scheduleNextQuestion();
  }

  function verifyAnswer(){
    if(!state.isReadyToAnswer){
      els.mensaje.innerText = 'Presiona "Iniciar" para comenzar.';
      return;
    }

    clearInterval(state.timer);
    const answer = parseInt(els.respuesta.value || '-1', 10);

    if(answer === currentAnswer){
      state.totalAttempts++;
      state.totalCorrect++;
      sGood.currentTime = 0; sGood.play().catch(()=>{});

      const attemptPayload = buildAttemptPayload({ answer, isCorrect:true, skipped:false, timedOut:false });
      const difficulty = deriveDifficulty();
      const gained = config.basePoints + Math.floor((attemptPayload.responseScore || 0) / 20) + difficulty.score;
      state.points += gained;
      state.questionCount++;

      state.currentCategory.attempts++;
      state.currentCategory.correct++;
      state.currentCategory.scoreSum += attemptPayload.responseScore;

      state.xp += 10 + difficulty.score;
      if(state.xp >= state.xpTarget){
        state.xp -= state.xpTarget;
        state.xpTarget = Math.round(state.xpTarget * 1.25);
      }

      registerAttempt(attemptPayload);
      els.mensaje.innerText = `✅ Correcto! +${gained} pts · Score ${attemptPayload.responseScore}`;

      if(state.questionCount >= getCurrentLevel().questions){
        showFinalCategoryScreen();
        return;
      }

      updateHUD();
      saveLocal();
      scheduleNextQuestion();
      return;
    }

    applyWrongAnswer(`❌ Incorrecto — la respuesta era ${currentAnswer}`);
  }

  function skipQuestion(){
    if(!state.isReadyToAnswer){
      els.mensaje.innerText = 'Presiona "Iniciar" antes de saltar.';
      return;
    }
    if(state.skipsRemaining <= 0){
      els.mensaje.innerText = 'Ya usaste los 2 saltos permitidos en esta categoría.';
      updateSkipCounter();
      return;
    }
    clearInterval(state.timer);
    state.skipsRemaining -= 1;
    state.isReadyToAnswer = false;
    const skipTimeMs = Math.max(0, (state.currentMetrics?.submit_time_ms || Date.now()) - (state.currentMetrics?.time_shown_ms || Date.now()));
    const fastSkip = skipTimeMs <= 10000;
    state.totalWrong++;
    state.totalAttempts++;
    state.questionCount++;
    state.currentCategory.attempts++;
    const attemptPayload = buildAttemptPayload({ answer:null, isCorrect:false, skipped:true, timedOut:false });
    attemptPayload.totalTimeMs = skipTimeMs;
    attemptPayload.timeMs = skipTimeMs;
    attemptPayload.thinkTimeMs = skipTimeMs;
    attemptPayload.writeTimeMs = 0;
    attemptPayload.responseScore = 0;
    registerAttempt(attemptPayload);
    els.mensaje.innerText = fastSkip
      ? `⏭ Reactivo omitido rápido. La dificultad se mantiene. Te quedan ${state.skipsRemaining} saltos.`
      : `⏭ Reactivo omitido tras intentarlo. La dificultad puede bajar. Te quedan ${state.skipsRemaining} saltos.`;
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    setDefaultInput();
    syncPresence({ currentQuestion: 'Reactivo omitido', currentResponseDraft: '', skipsRemaining: state.skipsRemaining }).catch(()=>{});
    updateSkipCounter();
    if(state.questionCount >= getCurrentLevel().questions){
      showFinalCategoryScreen();
      return;
    }
    saveLocal();
    scheduleNextQuestion(700);
  }

  function chooseCategory(levelIndex){
    state.levelIndex = levelIndex;
    state.questionCount = 0;
    state.hasStarted = false;
    state.isPaused = false;
    state.skipsRemaining = 2;
    state.sessionId = buildSessionId(getCurrentLevel().type);
    state.sessionStartedAt = Date.now();
    state.currentCategory = { attempts:0, correct:0, scoreSum:0 };
    state.askedQuestionKeys = new Set();
    const t = getCurrentLevel().type;
    if(!state.categoryAggregates[t]){ state.categoryAggregates[t] = { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 }; }
    els.categoryMenu.classList.add('hidden');
    if(els.pauseOverlay) els.pauseOverlay.classList.add('hidden');
    els.panelOperacion.classList.remove('hidden');
    els.gameArea.classList.remove('hidden');
    els.mensaje.innerText = `Elegiste ${getCurrentLevel().name}. Presiona Iniciar para comenzar.`;
    syncPresence({ currentCategory: getCurrentLevel().name, currentStreak: state.stats.correctStreak, currentQuestion: currentQuestionLabel, currentResponseDraft: '', skipsRemaining: state.skipsRemaining }).catch(()=>{});
    generateQuestion();
  }

  function startCountdown(){
    if(state.isReadyToAnswer){ return; }
    const sequence = ['3', '2', '1', '¡YA!'];
    let idx = 0;
    els.btnIniciar.disabled = true;

    const tick = ()=>{
      els.countdown.innerText = sequence[idx];
      els.countdown.classList.remove('countdown-pop');
      void els.countdown.offsetWidth;
      els.countdown.classList.add('countdown-pop');
      sCountdown.currentTime = 0;
      sCountdown.play().catch(()=>{});
      idx++;
      if(idx < sequence.length){ setTimeout(tick, 550); return; }

      setTimeout(()=>{
        els.countdown.innerText = '';
        state.hasStarted = true;
        els.btnIniciar.style.display = 'none';
        beginQuestionInteraction();
      }, 500);
    };
    tick();
  }

  async function setupLoginOverlay(){
    if(!els.overlay || !els.btnIngresar){ return; }

    const syncPlayers = async ()=>{
      try {
        if(window.FirebasePlaceholder){
          await window.FirebasePlaceholder.ensureDefaultPlayers();
          const players = await window.FirebasePlaceholder.listPlayers();
          els.overlayPlayerSelect.innerHTML = '';
          players.forEach((p)=>{
            const option = document.createElement('option');
            option.value = p.id;
            option.textContent = `${p.id}${p.displayName && p.displayName !== p.id ? ` (${p.displayName})` : ''}`;
            els.overlayPlayerSelect.appendChild(option);
          });
          const active = window.FirebasePlaceholder.getActivePlayer();
          els.overlayPlayerSelect.value = players.some((p)=>p.id===active) ? active : (players[0]?.id || '');
        } else {
          els.overlayPlayerSelect.innerHTML = '';
        }
        els.overlayStatus.innerText = 'Selecciona y presiona Ingresar';
      } catch (error) {
        console.warn('No se pudieron cargar jugadores remotos.', error);
        els.overlayPlayerSelect.innerHTML = '';
        els.overlayStatus.innerText = 'Sin conexión a Firestore';
      }
    };

    els.btnIngresar.addEventListener('click', async ()=>{
      const selected = els.overlayPlayerSelect.value;
      if(!selected){
        els.overlayStatus.innerText = 'Debes seleccionar un jugador.';
        return;
      }

      state.playerId = selected;
      state.adaptiveProfiles = loadAdaptiveProfile(selected);
      updateSelectedPlayerBadge();
      if(window.FirebasePlaceholder){
        window.FirebasePlaceholder.setActivePlayer(selected);
        try { await window.FirebasePlaceholder.logLogin({ playerId: selected }); }
        catch(error){ console.warn('No se pudo registrar login en Firestore.', error); }
        await syncPresence({ currentStreak: state.stats.correctStreak, skipsRemaining: state.skipsRemaining });
      }

      els.overlay.classList.add('hidden');
      els.mensaje.innerText = `Hola ${selected}, selecciona una categoría para iniciar.`;
      await refreshPlayerInsights(selected);
      await refreshRemoteMissions(selected);
    });

    await syncPlayers();
    window.addEventListener('firebase-ready', syncPlayers);
  }

  els.btn.addEventListener('click', verifyAnswer);
  els.btnSkip.addEventListener('click', skipQuestion);
  els.btnPause && els.btnPause.addEventListener('click', pauseGame);
  els.btnIniciar.addEventListener('click', startCountdown);
  els.btnAbortCategory && els.btnAbortCategory.addEventListener('click', abortCurrentCategory);
  els.btnResumePause && els.btnResumePause.addEventListener('click', resumeGame);
  document.querySelectorAll('.category-btn').forEach((btn)=> btn.addEventListener('click', ()=> chooseCategory(Number(btn.dataset.level))));
  els.btnFinalContinue && els.btnFinalContinue.addEventListener('click', ()=>{
    els.finalOverlay.classList.add('hidden');
    resetCategoryView('Categoría completada. Puedes elegir una nueva.');
  });
  els.btnMissionContinue && els.btnMissionContinue.addEventListener('click', ()=> els.missionCongratsOverlay.classList.add('hidden'));
  els.btnOpenMedals && els.btnOpenMedals.addEventListener('click', ()=>{ renderMedalsHistory(); els.medalsOverlay.classList.remove('hidden'); });
  els.btnCloseMedals && els.btnCloseMedals.addEventListener('click', ()=> els.medalsOverlay.classList.add('hidden'));

  const cachedPlayerId = getCachedActivePlayerId();
  if(!cachedPlayerId){
    window.location.href = 'select-user.html';
    return;
  }
  state.playerId = cachedPlayerId;
  state.adaptiveProfiles = loadAdaptiveProfile(cachedPlayerId);
  const cachedProgress = window.AppStorage && typeof window.AppStorage.load === 'function' ? window.AppStorage.load(cachedPlayerId) : null;
  if(cachedProgress){
    state.points = Number(cachedProgress.points || 0);
    state.xp = Number(cachedProgress.xp || 0);
    state.xpTarget = Number(cachedProgress.xpTarget || 100);
    state.totalAttempts = Number(cachedProgress.totalAttempts || 0);
    state.totalCorrect = Number(cachedProgress.totalCorrect || 0);
    state.totalWrong = Number(cachedProgress.totalWrong || 0);
    state.stats.correctStreak = Number(cachedProgress.currentStreak || 0);
    state.stats.bestStreak = Number(cachedProgress.bestStreak || 0);
  }
  updateSelectedPlayerBadge();

  setupInputTracking();
  state.sessionId = null;
  pickDailyMissions();
  updateHUD();
  updateMedalSummary();

  if(els.overlay){ els.overlay.classList.add('hidden'); }

  const syncSelectedPlayer = async ()=>{
    if(window.FirebasePlaceholder){
      window.FirebasePlaceholder.setActivePlayer(state.playerId);
    }
    await refreshPlayerInsights(state.playerId);
    await refreshRemoteMissions(state.playerId);
    await syncPresence({ currentStreak: state.stats.correctStreak, skipsRemaining: state.skipsRemaining });
    els.mensaje.innerText = `Hola ${state.playerId}, selecciona una categoría para iniciar.`;
  };

  startPresenceHeartbeat();

  document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden && state.playerId && state.sessionId && state.levelIndex !== null){
      syncPresence({ currentStreak: state.stats.correctStreak, skipsRemaining: state.skipsRemaining }).catch(()=>{});
    }
  });

  window.addEventListener('beforeunload', ()=>{
    stopPresenceHeartbeat();
  });

  syncSelectedPlayer();
  window.addEventListener('firebase-ready', syncSelectedPlayer);

  window.__misiones_state = state;
})();
