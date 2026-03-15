// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:10, attempts:3, timeLimitSec:60 },
      { id:2, name:'Restas', type:'sub', questions:10, attempts:3, timeLimitSec:60 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:10, attempts:3, timeLimitSec:60 }
    ],
    basePoints: 10,
    maxLives: 3,
    modelVersion: 'v3-adaptive-missions'
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
    isReadyToAnswer:false,
    hasStarted:false,
    playerId:'Isaac',
    perLevelAdaptiveOffset: { add:0, sub:0, mul:0 },
    recentResults: { add:[], sub:[], mul:[] },
    currentMetrics:null,
    stats: {
      correctStreak:0,
      fast10Streak:0,
      fast8Streak:0,
      turboTimes:[],
      correctByType:{ add:0, sub:0, mul:0 },
      attemptsCount:0
    },
    activeMissions: [],
    currentCategory: { attempts:0, correct:0, scoreSum:0 },
    categoryAggregates: { add:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0}, sub:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0}, mul:{attempts:0,correct:0,wrong:0,highScore:0,scoreSum:0} },
    medalHistory: []
  };

  const sGood = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');
  const sBad = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sCountdown = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sLifeLost = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sNextQuestion = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');

  const els = {
    d1: document.getElementById('d1'), u1: document.getElementById('u1'), d2: document.getElementById('d2'), u2: document.getElementById('u2'), signo: document.getElementById('signo'),
    respuesta: document.getElementById('respuesta'), btn: document.getElementById('btnResponder'), btnSkip: document.getElementById('btnSkip'), btnIniciar: document.getElementById('btnIniciar'),
    puntos: document.getElementById('puntos'), vidas: document.getElementById('vidas'), vidasUI: document.getElementById('vidasUI'), tiempo: document.getElementById('tiempo'),
    nivelTxt: document.getElementById('nivelTxt'), categoriaTxt: document.getElementById('categoriaTxt'), progresoNivelFill: document.getElementById('progresoNivelFill'),
    mensaje: document.getElementById('mensaje'), xpFill: document.getElementById('xpFill'), xpText: document.getElementById('xp'), xpTarget: document.getElementById('xpTarget'),
    panelOperacion: document.getElementById('panelOperacion'), countdown: document.getElementById('countdown'), overlay: document.getElementById('loginOverlay'), overlayPlayerSelect: document.getElementById('overlayPlayerSelect'),
    overlayStatus: document.getElementById('overlayStatus'), btnIngresar: document.getElementById('btnIngresar'), categoryMenu: document.getElementById('categoryMenu'), gameArea: document.getElementById('gameArea'),
    missionList: document.getElementById('missionList'), finalOverlay: document.getElementById('finalOverlay'), finalScoreText: document.getElementById('finalScoreText'), finalMessage: document.getElementById('finalMessage'),
    btnFinalContinue: document.getElementById('btnFinalContinue'), missionCongratsOverlay: document.getElementById('missionCongratsOverlay'), missionCongratsText: document.getElementById('missionCongratsText'),
    btnMissionContinue: document.getElementById('btnMissionContinue'),
    insWeekPoints: document.getElementById('insWeekPoints'), insWeekCorrect: document.getElementById('insWeekCorrect'), insDailyHigh: document.getElementById('insDailyHigh'), insWeekSessions: document.getElementById('insWeekSessions'),
    insByCategory: document.getElementById('insByCategory'), insAchievements: document.getElementById('insAchievements'),
    btnOpenMedals: document.getElementById('btnOpenMedals'), medalCount: document.getElementById('medalCount'), medalsOverlay: document.getElementById('medalsOverlay'),
    medalsHistoryList: document.getElementById('medalsHistoryList'), btnCloseMedals: document.getElementById('btnCloseMedals')
  };

  let currentAnswer = 0;
  let currentQuestionLabel = '';
  let currentOperands = [0,0];

  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  function clamp(v,min=0,max=1){ return Math.max(min, Math.min(max, v)); }
  function getCurrentLevel(){ return state.levelIndex === null ? null : config.levels[state.levelIndex]; }
  function nowIso(){ return new Date().toISOString(); }

  function buildSessionId(){
    const d = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    return `s_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function daySeed(){
    const d = new Date();
    return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`);
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
    state.activeMissions.forEach((m)=>{
      const div = document.createElement('div');
      div.className = `mission-item ${m.completed ? 'done' : ''}`;
      const prog = m.group === 'daily' && m.id === 'daily_5m' ? `${Math.floor(m.progress)}s/${m.target}s` : `${m.progress}/${m.target}`;
      div.innerHTML = `<strong>${m.title}</strong><br><small>${m.description}</small><br><small>Progreso: ${prog}</small>`;
      els.missionList.appendChild(div);
    });
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
      window.FirebasePlaceholder.saveAchievement({ title: mission.title, medal: mission.medal, type:'mission', category: mission.group, points: state.points }).catch(()=>{});
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


  function renderPlayerInsights(insights){
    if(!insights) return;
    const wk = insights.weekly || {};
    if(els.insWeekPoints) els.insWeekPoints.innerText = String(wk.weekPoints || 0);
    if(els.insWeekCorrect) els.insWeekCorrect.innerText = String(wk.weekCorrect || 0);
    if(els.insDailyHigh) els.insDailyHigh.innerText = String(wk.dailyHighScore || 0);
    if(els.insWeekSessions) els.insWeekSessions.innerText = String(wk.weekSessions || 0);

    if(els.insByCategory){
      const byCat = insights.byCategory || {};
      const labels = { add:'Sumas', sub:'Restas', mul:'Multiplicaciones' };
      const rows = Object.entries(byCat)
        .filter(([k])=>['add','sub','mul'].includes(k))
        .map(([k,v])=>`${labels[k]}: ${v.correct || 0}/${v.attempts || 0} · HS ${v.highScore || 0}`);
      els.insByCategory.innerHTML = rows.length ? rows.map((r)=>`<div>${r}</div>`).join('') : 'Sin datos';
    }

    if(els.insAchievements){
      const ach = (insights.recentAchievements || []).slice(0,8);
      els.insAchievements.innerHTML = ach.length ? ach.map((a)=>`<span class="badge-chip">${a.medal || '🏅'} ${a.title || 'Logro'}</span>`).join('') : 'Sin registros';
      state.medalHistory = ach.map((a)=>({ medal:a.medal || '🏅', title:a.title || 'Logro', date:a.clientDate || '' }));
      updateMedalSummary();
      renderMedalsHistory();
    }

    const fromDb = insights.byCategory || {};
    ['add','sub','mul'].forEach((k)=>{
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
    });

    els.respuesta.addEventListener('keydown', (e)=>{
      if(e.key === 'Backspace' && state.currentMetrics){ state.currentMetrics.edits_count += 1; }
      if(e.key === 'Enter'){ e.preventDefault(); verifyAnswer(); }
    });
  }

  function setGameControlsEnabled(enabled){ els.btn.disabled = !enabled; els.btnSkip.disabled = !enabled; els.respuesta.disabled = !enabled; }
  function setDefaultInput(){ els.respuesta.value = ''; }

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
  }

  function deriveDifficulty(type, a, b){
    if(type === 'add'){
      const carry = ((a % 10) + (b % 10)) >= 10;
      if(a % 10 === 0 && b % 10 === 0){ return { score:1, label:'decenas exactas' }; }
      return carry ? { score:3, label:'suma con llevar' } : { score:2, label:'suma sin llevar' };
    }
    if(type === 'sub'){
      const borrow = (a % 10) < (b % 10);
      return borrow ? { score:3, label:'resta con préstamo' } : { score:2, label:'resta sin préstamo' };
    }
    if((a <= 5 && b <= 5) || a === 10 || b === 10){ return { score:2, label:'tabla básica' }; }
    if(a <= 9 && b <= 9){ return { score:3, label:'tabla avanzada' }; }
    return { score:4, label:'multiplicación extendida' };
  }

  function getAdaptiveBounds(type){
    const offset = state.perLevelAdaptiveOffset[type] || 0;
    if(type === 'add') return offset <= -1 ? { min:1, max:20 } : offset === 0 ? { min:10, max:60 } : { min:25, max:99 };
    if(type === 'sub') return offset <= -1 ? { min:5, max:30 } : offset === 0 ? { min:20, max:80 } : { min:40, max:99 };
    return offset <= -1 ? { min:2, max:7 } : offset === 0 ? { min:3, max:10 } : { min:5, max:12 };
  }

  function adjustDifficultyProfile(type){
    const recent = state.recentResults[type] || [];
    if(recent.length < 2){ return; }
    const last3 = recent.slice(-3);
    const allCorrectFast = last3.length === 3 && last3.every((r)=>r.correct && r.totalTimeSec <= r.fastThreshold);
    const last2 = recent.slice(-2);
    const anyWrongOrSlow = last2.length === 2 && last2.some((r)=>!r.correct || r.totalTimeSec > r.slowThreshold);
    if(allCorrectFast){ state.perLevelAdaptiveOffset[type] = Math.min(2, (state.perLevelAdaptiveOffset[type] || 0) + 1); }
    else if(anyWrongOrSlow){ state.perLevelAdaptiveOffset[type] = Math.max(-1, (state.perLevelAdaptiveOffset[type] || 0) - 1); }
  }

  function beginQuestionInteraction(){
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
    const bounds = getAdaptiveBounds(lvl.type);
    if(lvl.type === 'add'){
      a = rand(bounds.min,bounds.max); b = rand(bounds.min,bounds.max); currentAnswer = a+b; els.signo.innerText = '+'; currentQuestionLabel = `${a} + ${b}`;
    } else if(lvl.type === 'sub'){
      a = rand(bounds.min,bounds.max); b = rand(bounds.min,bounds.max); if(b>a){ [a,b]=[b,a]; } currentAnswer = a-b; els.signo.innerText = '-'; currentQuestionLabel = `${a} - ${b}`;
    } else {
      a = rand(bounds.min,bounds.max); b = rand(bounds.min,bounds.max); currentAnswer = a*b; els.signo.innerText = '×'; currentQuestionLabel = `${a} × ${b}`;
    }

    currentOperands = [a,b];
    els.d1.innerText = Math.floor(a/10) || '';
    els.u1.innerText = a%10;
    els.d2.innerText = Math.floor(b/10) || '';
    els.u2.innerText = b%10;
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
  }

  function scheduleNextQuestion(delayMs = 3000){
    state.isReadyToAnswer = false;
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    sNextQuestion.currentTime = 0;
    sNextQuestion.play().catch(()=>{});
    setTimeout(()=> generateQuestion(), delayMs);
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
    const difficulty = deriveDifficulty(lvl.type, currentOperands[0], currentOperands[1]);
    const responseScore = scoreResponse(Boolean(isCorrect), difficulty.score, totalMs/1000, writeMs/1000, metrics.edits_count, lvl.type);

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
      mode: lvl.type,
      operationType: lvl.type,
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
      totalAttemptsCategory: state.categoryAggregates[lvl.type]?.attempts || 0,
      correctCategory: state.categoryAggregates[lvl.type]?.correct || 0,
      wrongCategory: state.categoryAggregates[lvl.type]?.wrong || 0,
      highScoreCategory: state.categoryAggregates[lvl.type]?.highScore || 0,
      avgResponseScoreCategory: (state.categoryAggregates[lvl.type]?.attempts || 0) > 0 ? Math.round((state.categoryAggregates[lvl.type].scoreSum || 0) / state.categoryAggregates[lvl.type].attempts) : 0
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
      if((payload.totalTimeMs/1000) < 10){ state.stats.fast10Streak++; } else { state.stats.fast10Streak = 0; }
      if((payload.totalTimeMs/1000) < 8){ state.stats.fast8Streak++; } else { state.stats.fast8Streak = 0; }
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
      fastThreshold: ({ add:20, sub:25, mul:20 }[type] || 22),
      slowThreshold: ({ add:40, sub:45, mul:40 }[type] || 42)
    });
    if(state.recentResults[type].length > 8){ state.recentResults[type].shift(); }

    const agg = state.categoryAggregates[type] || { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 };
    agg.attempts += 1;
    if(payload.isCorrect) agg.correct += 1; else agg.wrong += 1;
    agg.scoreSum += Number(payload.responseScore || 0);
    agg.highScore = Math.max(agg.highScore, Number(payload.responseScore || 0));
    state.categoryAggregates[type] = agg;

    adjustDifficultyProfile(type);
    updateMissionProgress(payload);
  }

  function saveLocal(){
    if(window.AppStorage && typeof window.AppStorage.save === 'function'){
      window.AppStorage.save({
        playerId: state.playerId,
        points: state.points,
        xp: state.xp,
        levelIndex: state.levelIndex,
        medals: state.medals,
        adaptive: state.perLevelAdaptiveOffset,
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
      state.hasStarted = false;
      els.gameArea.classList.add('hidden');
      els.categoryMenu.classList.remove('hidden');
      state.lives = config.maxLives;
      state.attemptsLeft = config.levels[0].attempts;
      updateHUD();
      saveLocal();
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
      const difficulty = deriveDifficulty(getCurrentLevel().type, currentOperands[0], currentOperands[1]);
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
        saveLocal();
        state.hasStarted = false;
        state.questionCount = 0;
        state.levelIndex = null;
        els.gameArea.classList.add('hidden');
        els.categoryMenu.classList.remove('hidden');
        updateHUD();
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
    clearInterval(state.timer);
    applyWrongAnswer('⏭ Pregunta saltada, una oportunidad menos.', true, false);
  }

  function chooseCategory(levelIndex){
    state.levelIndex = levelIndex;
    state.questionCount = 0;
    state.attemptsLeft = getCurrentLevel().attempts;
    state.lives = config.maxLives;
    state.hasStarted = false;
    state.currentCategory = { attempts:0, correct:0, scoreSum:0 };
    const t = getCurrentLevel().type;
    if(!state.categoryAggregates[t]){ state.categoryAggregates[t] = { attempts:0, correct:0, wrong:0, highScore:0, scoreSum:0 }; }
    els.categoryMenu.classList.add('hidden');
    els.gameArea.classList.remove('hidden');
    els.mensaje.innerText = `Elegiste ${getCurrentLevel().name}. Presiona Iniciar para comenzar.`;
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
      if(window.FirebasePlaceholder){
        window.FirebasePlaceholder.setActivePlayer(selected);
        try { await window.FirebasePlaceholder.logLogin({ playerId: selected }); }
        catch(error){ console.warn('No se pudo registrar login en Firestore.', error); }
      }

      els.overlay.classList.add('hidden');
      els.mensaje.innerText = `Hola ${selected}, selecciona una categoría para iniciar.`;
      await refreshPlayerInsights(selected);
    });

    await syncPlayers();
    window.addEventListener('firebase-ready', syncPlayers);
  }

  els.btn.addEventListener('click', verifyAnswer);
  els.btnSkip.addEventListener('click', skipQuestion);
  els.btnIniciar.addEventListener('click', startCountdown);
  document.querySelectorAll('.category-btn').forEach((btn)=> btn.addEventListener('click', ()=> chooseCategory(Number(btn.dataset.level))));
  els.btnFinalContinue && els.btnFinalContinue.addEventListener('click', ()=> els.finalOverlay.classList.add('hidden'));
  els.btnMissionContinue && els.btnMissionContinue.addEventListener('click', ()=> els.missionCongratsOverlay.classList.add('hidden'));
  els.btnOpenMedals && els.btnOpenMedals.addEventListener('click', ()=>{ renderMedalsHistory(); els.medalsOverlay.classList.remove('hidden'); });
  els.btnCloseMedals && els.btnCloseMedals.addEventListener('click', ()=> els.medalsOverlay.classList.add('hidden'));

  setupInputTracking();
  state.sessionId = buildSessionId();
  pickDailyMissions();
  updateHUD();
  updateMedalSummary();
  refreshPlayerInsights(state.playerId);
  setupLoginOverlay();

  window.__misiones_state = state;
})();
