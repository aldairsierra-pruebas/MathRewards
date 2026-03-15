// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:10, attempts:2, timeLimitSec:60 },
      { id:2, name:'Restas', type:'sub', questions:10, attempts:2, timeLimitSec:60 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:10, attempts:2, timeLimitSec:60 }
    ],
    basePoints: 10,
    timeBonusMax: 10,
    maxLives: 2,
    modelVersion: 'v2-adaptive-scoring'
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
    playerId:'PR_1',
    perLevelAdaptiveOffset: { add:0, sub:0, mul:0 },
    recentResults: { add:[], sub:[], mul:[] },
    currentMetrics: null
  };

  const sGood = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');
  const sBad = new Audio('https://actions.google.com/sounds/v1/cartoon/boing.ogg');
  const sCountdown = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sLifeLost = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sNextQuestion = new Audio('https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg');

  const els = {
    d1: document.getElementById('d1'),
    u1: document.getElementById('u1'),
    d2: document.getElementById('d2'),
    u2: document.getElementById('u2'),
    signo: document.getElementById('signo'),
    respuesta: document.getElementById('respuesta'),
    btn: document.getElementById('btnResponder'),
    btnSkip: document.getElementById('btnSkip'),
    btnIniciar: document.getElementById('btnIniciar'),
    puntos: document.getElementById('puntos'),
    vidas: document.getElementById('vidas'),
    vidasUI: document.getElementById('vidasUI'),
    tiempo: document.getElementById('tiempo'),
    nivelTxt: document.getElementById('nivelTxt'),
    categoriaTxt: document.getElementById('categoriaTxt'),
    progresoNivelFill: document.getElementById('progresoNivelFill'),
    mensaje: document.getElementById('mensaje'),
    medalla: document.getElementById('medalla'),
    xpFill: document.getElementById('xpFill'),
    xpText: document.getElementById('xp'),
    xpTarget: document.getElementById('xpTarget'),
    panelOperacion: document.getElementById('panelOperacion'),
    countdown: document.getElementById('countdown'),
    overlay: document.getElementById('loginOverlay'),
    overlayPlayerSelect: document.getElementById('overlayPlayerSelect'),
    overlayStatus: document.getElementById('overlayStatus'),
    btnIngresar: document.getElementById('btnIngresar'),
    categoryMenu: document.getElementById('categoryMenu'),
    gameArea: document.getElementById('gameArea')
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

  function inferDeviceType(){
    return ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'touch' : 'keyboard';
  }

  function createQuestionMetrics(){
    return {
      time_shown_ms: Date.now(),
      time_shown: nowIso(),
      first_input_time_ms: null,
      first_input_time: null,
      submit_time_ms: null,
      submit_time: null,
      edits_count: 0,
      input_length_changes: [],
      hints_used: 0,
      input_errors: 0,
      response_value: '',
      device_info: {
        type: inferDeviceType(),
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'unknown',
        language: navigator.language || 'es-MX'
      }
    };
  }

  function setupInputTracking(){
    els.respuesta.addEventListener('input', ()=>{
      const raw = els.respuesta.value;
      const onlyDigits = raw.replace(/\D/g, '');
      if(raw !== onlyDigits){
        state.currentMetrics && (state.currentMetrics.input_errors += 1);
      }
      const cropped = onlyDigits.slice(0,3);
      if(cropped !== els.respuesta.value){
        state.currentMetrics && (state.currentMetrics.input_errors += 1);
      }

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
      if(e.key === 'Backspace' && state.currentMetrics){
        state.currentMetrics.edits_count += 1;
      }
      if(e.key === 'Enter'){
        e.preventDefault();
        verifyAnswer();
      }
    });
  }

  function setGameControlsEnabled(enabled){
    els.btn.disabled = !enabled;
    els.btnSkip.disabled = !enabled;
    els.respuesta.disabled = !enabled;
  }

  function setDefaultInput(){
    els.respuesta.value = '';
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
      if(!carry){ return { score:2, label:'suma sin llevar' }; }
      return { score:3, label:'suma con llevar' };
    }
    if(type === 'sub'){
      const borrow = (a % 10) < (b % 10);
      if(!borrow){ return { score:2, label:'resta sin préstamo' }; }
      return { score:3, label:'resta con préstamo' };
    }

    if((a <= 5 && b <= 5) || a === 10 || b === 10){ return { score:2, label:'tabla básica' }; }
    if(a <= 9 && b <= 9){ return { score:3, label:'tabla avanzada' }; }
    return { score:4, label:'multiplicación extendida' };
  }

  function getAdaptiveBounds(type){
    const offset = state.perLevelAdaptiveOffset[type] || 0;
    if(type === 'add'){
      if(offset <= -1){ return { min:1, max:20 }; }
      if(offset === 0){ return { min:10, max:60 }; }
      return { min:25, max:99 };
    }
    if(type === 'sub'){
      if(offset <= -1){ return { min:5, max:30 }; }
      if(offset === 0){ return { min:20, max:80 }; }
      return { min:40, max:99 };
    }
    if(offset <= -1){ return { min:2, max:7 }; }
    if(offset === 0){ return { min:3, max:10 }; }
    return { min:5, max:12 };
  }

  function adjustDifficultyProfile(type){
    const recent = state.recentResults[type] || [];
    if(recent.length < 2){ return; }

    const last3 = recent.slice(-3);
    const allCorrectFast = last3.length === 3 && last3.every((r)=>r.correct && r.totalTimeSec <= r.fastThreshold);

    const last2 = recent.slice(-2);
    const anyWrongOrSlow = last2.length === 2 && last2.some((r)=>!r.correct || r.totalTimeSec > r.slowThreshold);

    if(allCorrectFast){
      state.perLevelAdaptiveOffset[type] = Math.min(2, (state.perLevelAdaptiveOffset[type] || 0) + 1);
      return;
    }

    if(anyWrongOrSlow){
      state.perLevelAdaptiveOffset[type] = Math.max(-1, (state.perLevelAdaptiveOffset[type] || 0) - 1);
    }
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
      a = rand(bounds.min,bounds.max);
      b = rand(bounds.min,bounds.max);
      currentAnswer = a+b;
      els.signo.innerText = '+';
      currentQuestionLabel = `${a} + ${b}`;
    } else if(lvl.type === 'sub'){
      a = rand(bounds.min,bounds.max);
      b = rand(bounds.min,bounds.max);
      if(b>a){ [a,b]=[b,a]; }
      currentAnswer = a-b;
      els.signo.innerText = '-';
      currentQuestionLabel = `${a} - ${b}`;
    } else {
      a = rand(bounds.min,bounds.max);
      b = rand(bounds.min,bounds.max);
      currentAnswer = a*b;
      els.signo.innerText = '×';
      currentQuestionLabel = `${a} × ${b}`;
    }

    currentOperands = [a,b];
    els.d1.innerText = Math.floor(a/10) || '';
    els.u1.innerText = a%10;
    els.d2.innerText = Math.floor(b/10) || '';
    els.u2.innerText = b%10;
    setDefaultInput();
    state.currentMetrics = createQuestionMetrics();

    if(state.hasStarted){
      els.btnIniciar.style.display = 'none';
      beginQuestionInteraction();
    } else {
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
    const base = 0.55 + 0.15*D + 0.15*T + 0.10*W + 0.05*E;
    return Math.round(100 * C * base);
  }

  function buildAttemptPayload({ answer, spentSeconds, isCorrect, skipped, timedOut }){
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
    const score = scoreResponse(Boolean(isCorrect), difficulty.score, totalMs/1000, writeMs/1000, metrics.edits_count, lvl.type);

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
      responseScore: score,
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
      clientDate: nowIso()
    };
  }

  function registerAttempt(payload){
    if(window.AppStorage && typeof window.AppStorage.saveAttempt === 'function'){
      window.AppStorage.saveAttempt(payload);
    }

    const type = payload.mode;
    if(!state.recentResults[type]){ state.recentResults[type] = []; }
    state.recentResults[type].push({
      correct: payload.isCorrect,
      totalTimeSec: payload.totalTimeMs / 1000,
      fastThreshold: ({ add:20, sub:25, mul:20 }[type] || 22),
      slowThreshold: ({ add:40, sub:45, mul:40 }[type] || 42)
    });
    if(state.recentResults[type].length > 8){
      state.recentResults[type].shift();
    }
    adjustDifficultyProfile(type);
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

  function giveMedal(name){
    if(!state.medals.includes(name)){
      state.medals.push(name);
      els.medalla.innerText = '🏅 ' + name;
    }
  }

  function handleTimeLimit(){
    const lvl = getCurrentLevel();
    if(!lvl || state.time < lvl.timeLimitSec){ return; }
    clearInterval(state.timer);
    applyWrongAnswer(`⌛ Se acabó el tiempo (${lvl.timeLimitSec}s). La respuesta era ${currentAnswer}`, state.time, false, true);
  }

  function applyWrongAnswer(message, spentSeconds, skipped = false, timedOut = false){
    const lostIndex = state.lives - 1;
    state.lives--;
    state.attemptsLeft--;
    state.totalWrong++;
    state.totalAttempts++;
    state.totalTimeMs += (spentSeconds || 0) * 1000;

    sGood.currentTime = 0; sGood.play().catch(()=>{});
    sLifeLost.currentTime = 0; sLifeLost.play().catch(()=>{});
    updateHearts(lostIndex);

    els.mensaje.innerText = message;
    state.points = Math.max(0, state.points - 2);

    if(state.attemptsLeft <= 0){
      els.mensaje.innerText += ' — Reinicio de oportunidades de la categoría.';
      state.questionCount = 0;
      state.attemptsLeft = getCurrentLevel().attempts;
    }

    const attemptPayload = buildAttemptPayload({
      answer: skipped ? null : Number(els.respuesta.value || NaN),
      spentSeconds,
      isCorrect: false,
      skipped,
      timedOut
    });

    if(state.lives <= 0){
      clearInterval(state.timer);
      els.mensaje.innerText = '💥 Te quedaste sin vidas. Elige categoría para volver a empezar.';
      state.hasStarted = false;
      els.gameArea.classList.add('hidden');
      els.categoryMenu.classList.remove('hidden');
      state.lives = config.maxLives;
      state.attemptsLeft = config.levels[0].attempts;
      registerAttempt(attemptPayload);
      updateHUD();
      saveLocal();
      return;
    }

    registerAttempt(attemptPayload);
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
    const raw = els.respuesta.value;
    const answer = parseInt(raw || '-1', 10);
    const spent = state.time;

    if(answer === currentAnswer){
      state.totalAttempts++;
      state.totalCorrect++;
      state.totalTimeMs += spent * 1000;
      sBad.currentTime = 0; sBad.play().catch(()=>{});

      const difficulty = deriveDifficulty(getCurrentLevel().type, currentOperands[0], currentOperands[1]);
      const attemptPayload = buildAttemptPayload({ answer, spentSeconds: spent, isCorrect: true, skipped:false, timedOut:false });
      const gained = config.basePoints + Math.floor((attemptPayload.responseScore || 0) / 20) + difficulty.score;
      state.points += gained;
      state.questionCount++;

      if(spent <= 3){ giveMedal('Velocidad'); }
      state.xp += 10 + difficulty.score;
      if(state.xp >= state.xpTarget){
        state.xp -= state.xpTarget;
        state.xpTarget = Math.round(state.xpTarget * 1.25);
        giveMedal('SubisteNivel');
      }

      els.mensaje.innerText = `✅ Correcto! +${gained} pts · Score ${attemptPayload.responseScore}`;

      if(state.questionCount >= getCurrentLevel().questions){
        clearInterval(state.timer);
        registerAttempt(attemptPayload);
        saveLocal();
        els.mensaje.innerText = '🎉 ¡Categoría completada! Elige una nueva categoría.';
        state.hasStarted = false;
        state.questionCount = 0;
        state.levelIndex = null;
        els.gameArea.classList.add('hidden');
        els.categoryMenu.classList.remove('hidden');
        updateHUD();
        return;
      }

      registerAttempt(attemptPayload);
      updateHUD();
      saveLocal();
      scheduleNextQuestion();
      return;
    }

    applyWrongAnswer(`❌ Incorrecto — la respuesta era ${currentAnswer}`, spent);
  }

  function skipQuestion(){
    if(!state.isReadyToAnswer){
      els.mensaje.innerText = 'Presiona "Iniciar" antes de saltar.';
      return;
    }
    clearInterval(state.timer);
    applyWrongAnswer('⏭ Pregunta saltada, una oportunidad menos.', state.time, true, false);
  }

  function chooseCategory(levelIndex){
    state.levelIndex = levelIndex;
    state.questionCount = 0;
    state.attemptsLeft = getCurrentLevel().attempts;
    state.lives = config.maxLives;
    state.hasStarted = false;
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
          els.overlayPlayerSelect.value = players.some((p)=>p.id===active) ? active : (players[0]?.id || 'PR_1');
        } else {
          els.overlayPlayerSelect.innerHTML = '<option value="PR_1">PR_1</option><option value="PR_2">PR_2</option>';
        }
        els.overlayStatus.innerText = 'Selecciona y presiona Ingresar';
      } catch (error) {
        console.warn('No se pudieron cargar jugadores remotos, se usa local.', error);
        els.overlayPlayerSelect.innerHTML = '<option value="PR_1">PR_1</option><option value="PR_2">PR_2</option>';
        els.overlayStatus.innerText = 'Sin conexión a Firestore, usando jugadores locales';
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
    });

    await syncPlayers();
    window.addEventListener('firebase-ready', syncPlayers);
  }

  els.btn.addEventListener('click', verifyAnswer);
  els.btnSkip.addEventListener('click', skipQuestion);
  els.btnIniciar.addEventListener('click', startCountdown);
  document.querySelectorAll('.category-btn').forEach((btn)=>{
    btn.addEventListener('click', ()=> chooseCategory(Number(btn.dataset.level)));
  });

  setupInputTracking();
  state.sessionId = buildSessionId();
  updateHUD();
  setupLoginOverlay();

  window.__misiones_state = state;
})();
