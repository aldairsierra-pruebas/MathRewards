// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:5, attempts:2, timeLimitSec:45 },
      { id:2, name:'Restas', type:'sub', questions:5, attempts:2, timeLimitSec:30 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:5, attempts:2, timeLimitSec:30 }
    ],
    basePoints: 10,
    timeBonusMax: 10,
    maxLives: 2
  };

  let state = {
    levelIndex:0,
    questionCount:0,
    attemptsLeft: config.levels[0].attempts,
    points:0,
    lives:config.maxLives,
    xp:0,
    xpTarget:100,
    timer: null,
    time:0,
    lastQuestionCreatedAt: Date.now(),
    medals: [],
    sessionId: null,
    sessionStartedAt: Date.now(),
    totalAttempts: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalTimeMs: 0,
    isReadyToAnswer: false,
    hasStarted: false
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
    dec: document.getElementById('decenas'),
    uni: document.getElementById('unidades'),
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
    btnIngresar: document.getElementById('btnIngresar')
  };

  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
  let currentAnswer = 0;
  let currentQuestionLabel = '';

  function buildSessionId(){
    const d = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    return `s_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function sanitizeDigitInput(input){
    input.addEventListener('input', ()=>{
      const onlyDigits = input.value.replace(/\D/g, '');
      input.value = onlyDigits.slice(0, 1);
    });
  }

  function setDefaultInputs(){
    els.dec.value = '';
    els.uni.value = '0';
  }

  function setGameControlsEnabled(enabled){
    els.btn.disabled = !enabled;
    els.btnSkip.disabled = !enabled;
    els.dec.disabled = !enabled;
    els.uni.disabled = !enabled;
  }

  function getCurrentLevel(){
    return config.levels[state.levelIndex];
  }


  function beginQuestionInteraction(){
    state.isReadyToAnswer = true;
    setGameControlsEnabled(true);
    els.panelOperacion.classList.remove('disabled-panel');
    els.dec.focus();
    clearInterval(state.timer);
    state.timer = setInterval(()=>{
      state.time++;
      els.tiempo.innerText = state.time;
      handleTimeLimit();
    },1000);
  }

  function generateQuestion(){
    clearInterval(state.timer);
    state.time = 0;
    els.tiempo.innerText = '0';
    const lvl = getCurrentLevel();
    let a,b;
    if(lvl.type === 'add'){
      a = rand(1,20);
      b = rand(1,20);
      currentAnswer = a+b;
      els.signo.innerText = '+';
      currentQuestionLabel = `${a} + ${b}`;
    } else if(lvl.type === 'sub'){
      a = rand(10,50);
      b = rand(1,30);
      if(b>a){ [a,b]=[b,a]; }
      currentAnswer = a-b;
      els.signo.innerText = '-';
      currentQuestionLabel = `${a} - ${b}`;
    } else {
      a = rand(2,6);
      b = rand(2,6);
      currentAnswer = a*b;
      els.signo.innerText = '×';
      currentQuestionLabel = `${a} × ${b}`;
    }
    els.d1.innerText = Math.floor(a/10) || '';
    els.u1.innerText = a%10;
    els.d2.innerText = Math.floor(b/10) || '';
    els.u2.innerText = b%10;
    setDefaultInputs();
    state.lastQuestionCreatedAt = Date.now();
    state.isReadyToAnswer = false;
    els.countdown.innerText = '';

    if(state.hasStarted){
      els.btnIniciar.style.display = 'none';
      beginQuestionInteraction();
    } else {
      setGameControlsEnabled(false);
      els.panelOperacion.classList.add('disabled-panel');
      els.btnIniciar.disabled = false;
      els.btnIniciar.style.display = 'inline-block';
    }

    updateHUD();
  }

  function updateHearts(animatedLostIndex){
    els.vidasUI.innerHTML = '';
    for(let i = 0; i < config.maxLives; i++){
      const heart = document.createElement('span');
      heart.className = `heart ${i < state.lives ? 'alive' : 'lost'}`;
      heart.innerText = '❤';
      if(i === animatedLostIndex){
        heart.classList.add('life-loss');
      }
      els.vidasUI.appendChild(heart);
    }
  }

  function updateHUD(){
    const lvl = getCurrentLevel();
    const currentProgress = state.questionCount + 1;
    els.puntos.innerText = state.points;
    els.vidas.innerText = state.lives;
    els.nivelTxt.innerText = lvl.name;
    els.categoriaTxt.innerText = `${lvl.name} (${Math.min(currentProgress, lvl.questions)}/${lvl.questions})`;
    els.progresoNivelFill.style.width = `${(state.questionCount / lvl.questions) * 100}%`;
    els.xpText.innerText = state.xp;
    els.xpTarget.innerText = state.xpTarget;
    els.xpFill.style.width = Math.min(100, (state.xp/state.xpTarget)*100) + '%';
    updateHearts();
  }

  function giveMedal(name){
    if(!state.medals.includes(name)){
      state.medals.push(name);
      els.medalla.innerText = '🏅 ' + name;
    }
  }

  function endGame(reason){
    clearInterval(state.timer);
    saveLocal();
    els.mensaje.innerText = reason + ' · Progreso guardado localmente.';
    setTimeout(()=>{ resetAll(); }, 1400);
  }

  function resetAll(){
    state = {
      levelIndex:0, questionCount:0, attemptsLeft: config.levels[0].attempts,
      points:0, lives:config.maxLives, xp:0, xpTarget:100, timer:null, time:0,
      lastQuestionCreatedAt: Date.now(), medals: [],
      sessionId: buildSessionId(),
      sessionStartedAt: Date.now(),
      totalAttempts: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalTimeMs: 0,
      isReadyToAnswer: false,
      hasStarted: false
    };
    updateHUD();
    generateQuestion();
  }

  function handleTimeLimit(){
    const lvl = getCurrentLevel();
    if(state.time < lvl.timeLimitSec){ return; }
    clearInterval(state.timer);
    applyWrongAnswer(`⌛ Se acabó el tiempo (${lvl.timeLimitSec}s). La respuesta era ${currentAnswer}`, state.time);
  }

  function startCountdown(){
    if(state.isReadyToAnswer){ return; }
    const sequence = ['3', '2', '1', '¡YA!'];
    let idx = 0;
    els.btnIniciar.disabled = true;
    els.countdown.classList.remove('countdown-pop');

    const tick = ()=>{
      const val = sequence[idx];
      els.countdown.innerText = val;
      els.countdown.classList.remove('countdown-pop');
      void els.countdown.offsetWidth;
      els.countdown.classList.add('countdown-pop');
      sCountdown.currentTime = 0;
      sCountdown.play().catch(()=>{});
      idx++;

      if(idx < sequence.length){
        setTimeout(tick, 550);
        return;
      }

      setTimeout(()=>{
        els.countdown.innerText = '';
        state.hasStarted = true;
        els.btnIniciar.style.display = 'none';
        beginQuestionInteraction();
      }, 500);
    };

    tick();
  }

  function applyWrongAnswer(baseMessage, spentSeconds){
    const lostIndex = state.lives - 1;
    state.lives--;
    state.attemptsLeft--;
    state.totalWrong++;
    state.totalAttempts++;
    state.totalTimeMs += (spentSeconds || 0) * 1000;
    sGood.currentTime = 0; sGood.play();
    sLifeLost.currentTime = 0; sLifeLost.play().catch(()=>{});
    updateHearts(lostIndex);
    els.mensaje.innerText = baseMessage;
    state.points = Math.max(0, state.points - 2);

    if(state.attemptsLeft <= 0){
      els.mensaje.innerText += ' — Perdiste las oportunidades de este nivel, se reinicia nivel.';
      state.questionCount = 0;
      state.attemptsLeft = getCurrentLevel().attempts;
    }

    if(state.lives <= 0){
      endGame('💥 Te quedaste sin vidas');
      return;
    }

    updateHUD();
    saveLocal();
    saveAttempt(null, spentSeconds, false);
    scheduleNextQuestion();
  }


  function scheduleNextQuestion(delayMs = 3000){
    state.isReadyToAnswer = false;
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    sNextQuestion.currentTime = 0;
    sNextQuestion.play().catch(()=>{});
    setTimeout(()=> generateQuestion(), delayMs);
  }

  function verifyAnswer(){
    if(!state.isReadyToAnswer){
      els.mensaje.innerText = 'Presiona "Iniciar" para comenzar.';
      return;
    }
    clearInterval(state.timer);
    const dec = parseInt(els.dec.value || '0',10);
    const uni = parseInt(els.uni.value || '0',10);
    const answer = dec*10 + uni;
    const spent = state.time;

    if(answer === currentAnswer){
      state.totalAttempts++;
      state.totalTimeMs += spent * 1000;
      state.totalCorrect++;
      sBad.currentTime = 0; sBad.play();
      const bonus = Math.max(0, config.timeBonusMax - spent);
      const gained = config.basePoints + bonus;
      state.points += gained;
      state.questionCount++;

      if(spent <= 3){ giveMedal('Velocidad'); }
      state.xp += 12 + Math.floor(bonus/2);
      if(state.xp >= state.xpTarget){
        state.xp -= state.xpTarget;
        state.xpTarget = Math.round(state.xpTarget * 1.25);
        giveMedal('SubisteNivel');
      }

      els.mensaje.innerText = `✅ Correcto! +${gained} pts (tiempo ${spent}s)`;

      if(state.questionCount >= getCurrentLevel().questions){
        state.levelIndex++;
        state.questionCount = 0;
        if(state.levelIndex >= config.levels.length){
          endGame('🎉 ¡Misión completa!');
          return;
        }
        state.attemptsLeft = getCurrentLevel().attempts;
        els.mensaje.innerText += ' 🚀 Subiste de nivel!';
      }

      updateHUD();
      saveLocal();
      saveAttempt(answer, spent, true);
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
    state.totalAttempts++;
    state.totalWrong++;
    state.attemptsLeft--;
    els.mensaje.innerText = '⏭ Pregunta saltada, una oportunidad menos.';
    if(state.attemptsLeft <= 0){
      els.mensaje.innerText += ' — Sin oportunidades, se reinicia nivel.';
      state.questionCount = 0;
      state.attemptsLeft = getCurrentLevel().attempts;
    }
    updateHUD();
    saveLocal();
    saveAttempt(null, state.time, false, true);
    scheduleNextQuestion();
  }

  function saveAttempt(answer, spentSeconds, isCorrect, skipped){
    if(window.AppStorage && typeof window.AppStorage.saveAttempt === 'function'){
      window.AppStorage.saveAttempt({
        sessionId: state.sessionId,
        attemptNumber: state.totalAttempts,
        question: skipped ? `${currentQuestionLabel} (saltada)` : currentQuestionLabel,
        expectedAnswer: currentAnswer,
        userAnswer: skipped ? -1 : answer,
        isCorrect,
        timeMs: (spentSeconds || 0) * 1000,
        difficulty: getCurrentLevel()?.name || 'general',
        mode: getCurrentLevel()?.type || 'general',
        totalAttempts: state.totalAttempts,
        correct: state.totalCorrect,
        wrong: state.totalWrong,
        durationMs: Date.now() - state.sessionStartedAt,
        points: state.points,
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform || 'unknown',
          language: navigator.language || 'es-MX'
        },
        clientDate: new Date().toISOString()
      });
    }
  }

  function saveLocal(){
    if(window.AppStorage && typeof window.AppStorage.save === 'function'){
      window.AppStorage.save({
        points: state.points,
        xp: state.xp,
        levelIndex: state.levelIndex,
        medals: state.medals,
        date: new Date().toISOString()
      });
    }
  }

  async function setupLoginOverlay(){
    if(!els.overlay || !els.btnIngresar){ return; }
    setGameControlsEnabled(false);

    const syncOverlayPlayers = async ()=>{
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
      if(window.FirebasePlaceholder){
        window.FirebasePlaceholder.setActivePlayer(selected);
        try {
          await window.FirebasePlaceholder.logLogin({ playerId: selected });
        } catch (error) {
          console.warn('No se pudo registrar login en Firestore.', error);
        }
      }
      els.overlay.classList.add('hidden');
      els.mensaje.innerText = `Hola ${selected}, presiona Iniciar para arrancar.`;
    });

    await syncOverlayPlayers();
    window.addEventListener('firebase-ready', syncOverlayPlayers);
  }

  els.btn.addEventListener('click', verifyAnswer);
  els.btnSkip.addEventListener('click', skipQuestion);
  els.btnIniciar.addEventListener('click', startCountdown);
  sanitizeDigitInput(els.dec);
  sanitizeDigitInput(els.uni);

  updateHUD();
  state.sessionId = buildSessionId();
  generateQuestion();
  setupLoginOverlay();

  window.__misiones_state = state;
})();
