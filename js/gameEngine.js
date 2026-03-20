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
  const ADAPTIVE_PROFILE_STORAGE_KEY = 'math_rewards_adaptive_profiles';

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
    attemptsLeft: config.levels[0].attempts,
    points:0,
    lives:config.maxLives,
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
    perLevelAdaptiveOffset: { add:0, sub:0, mul:0, challenge:0 },
    recentResults: { add:[], sub:[], mul:[], challenge:[] },
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
    presenceHeartbeatId:null
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


  function normalizeAdaptiveOffsets(raw = {}){
    return {
      add: clamp(Number(raw.add ?? 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max),
      sub: clamp(Number(raw.sub ?? 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max),
      mul: clamp(Number(raw.mul ?? 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max),
      challenge: clamp(Number(raw.challenge ?? 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max)
    };
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
      parsed[playerId] = normalizeAdaptiveOffsets(state.perLevelAdaptiveOffset);
      localStorage.setItem(ADAPTIVE_PROFILE_STORAGE_KEY, JSON.stringify(parsed));
    } catch(error){
      console.warn('No se pudo guardar perfil adaptativo local.', error);
    }
  }

  function getOffsetForType(type){
    return clamp(Number(state.perLevelAdaptiveOffset[type] || 0), ADAPTIVE_OFFSET_LIMITS.min, ADAPTIVE_OFFSET_LIMITS.max);
  }

  function getDifficultyTier(type){
    return getOffsetForType(type) - ADAPTIVE_OFFSET_LIMITS.min;
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
    els.vidasUI.innerHTML = '';
    for(let i=0;i<config.maxLives;i++){
      const heart = document.createElement('span');
      heart.className = `heart ${i < state.lives ? 'alive' : 'lost'}`;
      heart.innerText = '❤';
      if(i === animatedLostIndex){ heart.classList.add('life-loss'); }
      els.vidasUI.appendChild(heart);
    }
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
    state.lives = config.maxLives;
    state.attemptsLeft = config.levels[0].attempts;
    state.skipsRemaining = 2;
    state.sessionId = null;
    state.currentCategory = { attempts:0, correct:0, scoreSum:0 };
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
    resetCategoryView('Regresaste a categorías. Puedes elegir otra misión matemática.');
  }

  function updateHUD(){
    const lvl = getCurrentLevel();
    els.puntos.innerText = state.points;
    els.vidas.innerText = state.lives;
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

  function buildAdditionQuestion(tier){
    const profiles = [
      ()=> { const a = rand(1, 9); const b = rand(1, 9); return { a, b, profile:'add_fluency', label:'sumas de una cifra', difficultyScore:1 }; },
      ()=> { const a = rand(10, 40); let b = rand(10, 40); if(((a % 10) + (b % 10)) >= 10){ b = Math.max(10, b - ((a % 10) + (b % 10) - 9)); } return { a, b, profile:'add_no_carry', label:'sumas sin llevar', difficultyScore:2 }; },
      ()=> { const a = rand(18, 69); let b = rand(11, 39); if(((a % 10) + (b % 10)) < 10){ b += 10 - (((a % 10) + (b % 10)) % 10); } return { a, b, profile:'add_with_carry', label:'sumas con llevar', difficultyScore:3 }; },
      ()=> { const a = rand(35, 89); const b = rand(24, 79); return { a, b, profile:'add_double_carry', label:'sumas de dos cifras con llevar', difficultyScore:4 }; },
      ()=> { const a = rand(125, 489); const b = rand(115, 389); return { a, b, profile:'add_three_digits', label:'sumas de tres cifras', difficultyScore:5 }; },
      ()=> { const a = rand(245, 789); const b = rand(165, 698); return { a, b, profile:'add_challenge', label:'sumas de reto', difficultyScore:6 }; }
    ];
    const built = profiles[Math.max(0, Math.min(profiles.length - 1, tier))]();
    return { ...built, answer: built.a + built.b, sign:'+', labelText: `${built.a} + ${built.b}` };
  }

  function buildSubtractionQuestion(tier){
    const profiles = [
      ()=> { let a = rand(4, 18); let b = rand(1, a - 1); return { a, b, profile:'sub_fluency', label:'restas simples', difficultyScore:1 }; },
      ()=> { let a = rand(20, 60); let b = rand(10, 39); if((a % 10) < (b % 10)){ b = Math.max(10, b - ((b % 10) - (a % 10))); } if(b >= a){ b = a - rand(1, 9); } return { a, b, profile:'sub_no_borrow', label:'restas sin préstamo', difficultyScore:2 }; },
      ()=> { let a = rand(31, 79); let b = rand(12, 48); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(11, 25); } return { a, b, profile:'sub_with_borrow', label:'restas con préstamo', difficultyScore:3 }; },
      ()=> { let a = rand(60, 99); let b = rand(25, 78); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(11, 18); } return { a, b, profile:'sub_two_digit_borrow', label:'restas de dos cifras con préstamo', difficultyScore:4 }; },
      ()=> { let a = rand(120, 480); let b = rand(35, 289); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(25, 80); } return { a, b, profile:'sub_three_digits', label:'restas de tres cifras', difficultyScore:5 }; },
      ()=> { let a = rand(300, 950); let b = rand(120, 780); if((a % 10) >= (b % 10)){ b = Math.min(a - 1, b + 10); } if(b >= a){ a = b + rand(50, 120); } return { a, b, profile:'sub_challenge', label:'restas de reto', difficultyScore:6 }; }
    ];
    const built = profiles[Math.max(0, Math.min(profiles.length - 1, tier))]();
    return { ...built, answer: built.a - built.b, sign:'-', labelText: `${built.a} - ${built.b}` };
  }

  function buildMultiplicationQuestion(tier){
    const profiles = [
      ()=> { const easy = randomFrom([1,2,5,10]); const other = rand(1, 10); return { a: easy, b: other, profile:'mul_easy_tables', label:'tablas fáciles', difficultyScore:1 }; },
      ()=> { const a = rand(2, 6); const b = rand(2, 10); return { a, b, profile:'mul_small_tables', label:'tablas pequeñas', difficultyScore:2 }; },
      ()=> { const a = rand(4, 9); const b = rand(3, 10); return { a, b, profile:'mul_mixed_tables', label:'tablas mixtas', difficultyScore:3 }; },
      ()=> { const pairs = [[7,8],[8,9],[6,7],[7,9],[8,8],[9,9]]; const [a,b] = randomFrom(pairs); return { a, b, profile:'mul_hard_tables', label:'tablas avanzadas', difficultyScore:4 }; },
      ()=> { const a = rand(11, 19); const b = rand(3, 9); return { a, b, profile:'mul_two_digit', label:'multiplicación de dos dígitos por una cifra', difficultyScore:5 }; },
      ()=> { const a = rand(12, 24); const b = rand(6, 12); return { a, b, profile:'mul_challenge', label:'multiplicación de reto', difficultyScore:6 }; }
    ];
    const built = profiles[Math.max(0, Math.min(profiles.length - 1, tier))]();
    return { ...built, answer: built.a * built.b, sign:'×', labelText: `${built.a} × ${built.b}` };
  }

  function generateChallengeQuestion(){
    const challengeType = randomFrom(['add','sub','mul']);
    const challengeTier = Math.round((getDifficultyTier(challengeType) + getDifficultyTier('challenge')) / 2);
    const question = challengeType === 'add'
      ? buildAdditionQuestion(Math.max(2, challengeTier))
      : challengeType === 'sub'
        ? buildSubtractionQuestion(Math.max(2, challengeTier))
        : buildMultiplicationQuestion(Math.max(2, challengeTier));
    return { type: challengeType, ...question, label: question.labelText };
  }

  function deriveDifficulty(){
    return { score: Number(currentQuestionMeta.difficultyScore || 1), label: currentQuestionMeta.label || 'general' };
  }

  function getAdaptiveBounds(type){
    const tier = getDifficultyTier(type);
    if(type === 'challenge'){
      return { tier, label:['muy fácil','fácil','normal','difícil','muy difícil','reto'][tier] || 'reto' };
    }
    const builders = { add: buildAdditionQuestion, sub: buildSubtractionQuestion, mul: buildMultiplicationQuestion };
    return { tier, generator: builders[type] };
  }

  function adjustDifficultyProfile(type){
    const recent = state.recentResults[type] || [];
    const window = recent.slice(-ADAPTIVE_EVAL_WINDOW);
    if(window.length < ADAPTIVE_EVAL_WINDOW){ return; }

    const accuracy = window.filter((r)=>r.correct).length / window.length;
    const avgTime = weightedAverage(window.map((r)=>r.totalTimeSec));
    const avgScore = weightedAverage(window.map((r)=>r.responseScore));
    const avgThinkTime = weightedAverage(window.map((r)=>r.thinkTimeSec));
    const avgEdits = weightedAverage(window.map((r)=>r.editsCount));
    const streak = (()=>{
      let value = 0;
      for(let idx = recent.length - 1; idx >= 0; idx--){
        if(!recent[idx].correct){ break; }
        value += 1;
      }
      return value;
    })();
    const wrongsInLast5 = window.filter((r)=>!r.correct).length;
    const slowCount = window.filter((r)=>r.totalTimeSec > r.slowThreshold).length;
    const lowScoreCount = window.filter((r)=>r.responseScore < r.lowScoreThreshold).length;

    const shouldIncrease = accuracy >= 0.85 && avgTime <= window[window.length - 1].fastThreshold && avgScore >= 72 && avgThinkTime <= window[window.length - 1].thinkFastThreshold && streak >= 3;
    const shouldDecrease = accuracy <= 0.6 || wrongsInLast5 >= 2 || slowCount >= 3 || (avgScore < 45 && lowScoreCount >= 3) || (avgEdits >= 2.5 && avgTime > window[window.length - 1].slowThreshold);

    if(shouldIncrease){
      state.perLevelAdaptiveOffset[type] = Math.min(ADAPTIVE_OFFSET_LIMITS.max, getOffsetForType(type) + 1);
    } else if(shouldDecrease){
      state.perLevelAdaptiveOffset[type] = Math.max(ADAPTIVE_OFFSET_LIMITS.min, getOffsetForType(type) - 1);
    }
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
    if(lvl.type === 'challenge'){
      const challenge = generateChallengeQuestion();
      a = challenge.a;
      b = challenge.b;
      currentAnswer = challenge.answer;
      currentOperationType = challenge.type;
      currentQuestionMeta = { profile: challenge.profile, label: `${challenge.label}`, difficultyScore: challenge.difficultyScore };
      els.signo.innerText = challenge.sign;
      currentQuestionLabel = challenge.label;
    } else {
      const bounds = getAdaptiveBounds(lvl.type);
      currentOperationType = lvl.type;
      question = bounds.generator(bounds.tier);
      a = question.a;
      b = question.b;
      currentAnswer = question.answer;
      currentQuestionMeta = { profile: question.profile, label: question.label, difficultyScore: question.difficultyScore };
      els.signo.innerText = question.sign;
      currentQuestionLabel = question.labelText;
    }

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
    const responseScore = scoreResponse(Boolean(isCorrect), difficulty.score, totalMs/1000, writeMs/1000, metrics.edits_count, currentOperationType);
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
      timeMs: totalMs,
      thinkTimeMs: thinkMs,
      writeTimeMs: writeMs,
      totalTimeMs: totalMs,
      difficulty: lvl.name,
      difficultyLabel: difficulty.label,
      difficultyScore: difficulty.score,
      skillProfile: currentQuestionMeta.profile || null,
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
      recentAttempts: Math.min((state.recentResults[lvl.type] || []).length, 10),
      recentCorrect: (state.recentResults[lvl.type] || []).slice(-10).filter((item)=>item.correct).length,
      recentTimeMs: (state.recentResults[lvl.type] || []).slice(-10).reduce((sum, item)=> sum + (item.totalTimeSec * 1000), 0),
      challengeType: lvl.type === 'challenge' ? currentOperationType : null
    };
  }

  function registerAttempt(payload){
    if(window.AppStorage && typeof window.AppStorage.saveAttempt === 'function'){
      window.AppStorage.saveAttempt(payload);
    }

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
    if(!state.recentResults[type]){ state.recentResults[type] = []; }
    state.recentResults[type].push({
      correct: payload.isCorrect,
      totalTimeSec: payload.totalTimeMs / 1000,
      thinkTimeSec: payload.thinkTimeMs / 1000,
      writeTimeSec: payload.writeTimeMs / 1000,
      responseScore: Number(payload.responseScore || 0),
      editsCount: Number(payload.editsCount || 0),
      skillProfile: payload.skillProfile || null,
      fastThreshold: ({ add:16, sub:18, mul:14, challenge:20 }[type] || 18),
      slowThreshold: ({ add:30, sub:34, mul:26, challenge:36 }[type] || 32),
      thinkFastThreshold: ({ add:5, sub:6, mul:4, challenge:7 }[type] || 5),
      lowScoreThreshold: ({ add:45, sub:45, mul:50, challenge:48 }[type] || 45)
    });
    if(state.recentResults[type].length > ADAPTIVE_WINDOW_SIZE){ state.recentResults[type].shift(); }

    const agg = state.categoryAggregates[type] || { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 };
    agg.attempts += 1;
    if(payload.isCorrect) agg.correct += 1; else agg.wrong += 1;
    agg.scoreSum += Number(payload.responseScore || 0);
    agg.highScore = Math.max(agg.highScore, Number(payload.responseScore || 0));
    state.categoryAggregates[type] = agg;

    adjustDifficultyProfile(type);
    if(payload.mode === 'challenge' && payload.operationType){ adjustDifficultyProfile(payload.operationType); }
    saveAdaptiveProfile(state.playerId);
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
        adaptive: normalizeAdaptiveOffsets(state.perLevelAdaptiveOffset),
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
    if(grade >= 90){ message = '🌟 ¡Excelente! Tienes gran dominio matemático.'; }
    else if(grade >= 75){ message = '👏 ¡Muy bien! Vas por muy buen camino.'; }
    else if(grade >= 60){ message = '💪 Buen avance. Un poco más y serás imparable.'; }
    return { grade, message };
  }

  function showFinalCategoryScreen(){
    const { grade, message } = computeFinalCategoryFeedback();
    els.finalScoreText.innerText = `Calificación: ${grade}/100`;
    els.finalMessage.innerText = message;
    els.finalOverlay.classList.remove('hidden');
  }

  function handleTimeLimit(){
    const lvl = getCurrentLevel();
    if(!lvl || state.time < lvl.timeLimitSec){ return; }
    clearInterval(state.timer);
    applyWrongAnswer(`⌛ Se acabó el tiempo (${lvl.timeLimitSec}s). La respuesta era ${currentAnswer}`, false, true);
  }

  function applyWrongAnswer(message, skipped = false, timedOut = false){
    const lostIndex = state.lives - 1;
    state.lives--;
    state.attemptsLeft--;
    state.totalWrong++;
    state.totalAttempts++;

    sBad.currentTime = 0; sBad.play().catch(()=>{});
    sLifeLost.currentTime = 0; sLifeLost.play().catch(()=>{});
    updateHearts(lostIndex);
    els.mensaje.innerText = message;
    state.points = Math.max(0, state.points - 2);

    const attemptPayload = buildAttemptPayload({
      answer: skipped ? null : Number(els.respuesta.value || NaN),
      isCorrect: false,
      skipped,
      timedOut
    });

    state.currentCategory.attempts++;
    registerAttempt(attemptPayload);

    if(state.attemptsLeft <= 0){
      els.mensaje.innerText += ' — Reinicio de oportunidades de la categoría.';
      state.questionCount = 0;
      state.attemptsLeft = getCurrentLevel().attempts;
    }

    if(state.lives <= 0){
      clearInterval(state.timer);
      els.mensaje.innerText = '💥 Te quedaste sin vidas. Elige categoría para volver a empezar.';
      resetCategoryView('💥 Te quedaste sin vidas. Elige categoría para volver a empezar.');
      return;
    }

    updateHUD();
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
        resetCategoryView('Categoría completada. Puedes elegir una nueva.');
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
    els.mensaje.innerText = `⏭ Reactivo omitido sin penalización. Te quedan ${state.skipsRemaining} saltos.`;
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    setDefaultInput();
    syncPresence({ currentQuestion: 'Reactivo omitido', currentResponseDraft: '', skipsRemaining: state.skipsRemaining }).catch(()=>{});
    updateSkipCounter();
    scheduleNextQuestion(700);
  }

  function chooseCategory(levelIndex){
    state.levelIndex = levelIndex;
    state.questionCount = 0;
    state.attemptsLeft = getCurrentLevel().attempts;
    state.lives = config.maxLives;
    state.hasStarted = false;
    state.isPaused = false;
    state.skipsRemaining = 2;
    state.sessionId = buildSessionId(getCurrentLevel().type);
    state.sessionStartedAt = Date.now();
    state.currentCategory = { attempts:0, correct:0, scoreSum:0 };
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
      state.perLevelAdaptiveOffset = loadAdaptiveProfile(selected);
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
  els.btnFinalContinue && els.btnFinalContinue.addEventListener('click', ()=> els.finalOverlay.classList.add('hidden'));
  els.btnMissionContinue && els.btnMissionContinue.addEventListener('click', ()=> els.missionCongratsOverlay.classList.add('hidden'));
  els.btnOpenMedals && els.btnOpenMedals.addEventListener('click', ()=>{ renderMedalsHistory(); els.medalsOverlay.classList.remove('hidden'); });
  els.btnCloseMedals && els.btnCloseMedals.addEventListener('click', ()=> els.medalsOverlay.classList.add('hidden'));

  const cachedPlayerId = getCachedActivePlayerId();
  if(!cachedPlayerId){
    window.location.href = 'select-user.html';
    return;
  }
  state.playerId = cachedPlayerId;
  state.perLevelAdaptiveOffset = loadAdaptiveProfile(cachedPlayerId);
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
