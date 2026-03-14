// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:5, attempts:2 },
      { id:2, name:'Restas', type:'sub', questions:5, attempts:2 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:5, attempts:2 }
    ],
    basePoints: 10,
    timeBonusMax: 10
  };

  let state = {
    levelIndex:0,
    questionCount:0,
    attemptsLeft: config.levels[0].attempts,
    points:0,
    lives:2,
    xp:0,
    xpTarget:100,
    enemyHP:100,
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
    isReadyToAnswer: false
  };

  const sGood = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');
  const sBad = new Audio('https://actions.google.com/sounds/v1/cartoon/boing.ogg');
  const sCountdown = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
  const sLifeLost = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');

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
    progreso: document.getElementById('progreso'),
    progresoNivelFill: document.getElementById('progresoNivelFill'),
    vidaEnemigo: document.getElementById('vidaEnemigo'),
    mensaje: document.getElementById('mensaje'),
    medalla: document.getElementById('medalla'),
    xpFill: document.getElementById('xpFill'),
    xpText: document.getElementById('xp'),
    xpTarget: document.getElementById('xpTarget'),
    panelQuick: document.getElementById('panelQuick'),
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

  function generateQuestion(){
    clearInterval(state.timer);
    state.time = 0;
    els.tiempo.innerText = '0';
    const lvl = config.levels[state.levelIndex];
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
    setGameControlsEnabled(false);
    els.panelOperacion.classList.add('disabled-panel');
    els.btnIniciar.disabled = false;
    els.countdown.innerText = '';
  }

  function updateHearts(animatedLostIndex){
    els.vidasUI.innerHTML = '';
    for(let i = 0; i < 2; i++){
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
    const lvl = config.levels[state.levelIndex];
    els.puntos.innerText = state.points;
    els.vidas.innerText = state.lives;
    els.progreso.innerText = state.questionCount + '/' + lvl.questions;
    els.vidaEnemigo.style.width = Math.max(0, state.enemyHP) + '%';
    els.nivelTxt.innerText = lvl.name;
    els.categoriaTxt.innerText = lvl.name;
    els.progresoNivelFill.style.width = `${(state.questionCount / lvl.questions) * 100}%`;
    els.xpText.innerText = state.xp;
    els.xpTarget.innerText = state.xpTarget;
    els.xpFill.style.width = Math.min(100, (state.xp/state.xpTarget)*100) + '%';
    els.panelQuick.innerText = `Nivel ${lvl.name} — Medallas: ${state.medals.join(', ') || 'ninguna'}`;
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
      points:0, lives:2, xp:0, xpTarget:100, enemyHP:100, timer:null, time:0,
      lastQuestionCreatedAt: Date.now(), medals: [],
      sessionId: buildSessionId(),
      sessionStartedAt: Date.now(),
      totalAttempts: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalTimeMs: 0,
      isReadyToAnswer: false
    };
    updateHUD();
    generateQuestion();
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
        state.isReadyToAnswer = true;
        setGameControlsEnabled(true);
        els.panelOperacion.classList.remove('disabled-panel');
        els.dec.focus();
        state.timer = setInterval(()=>{
          state.time++;
          els.tiempo.innerText = state.time;
        },1000);
      }, 500);
    };

    tick();
  }

  function verifyAnswer(){
    if(!state.isReadyToAnswer){
      els.mensaje.innerText = 'Presiona "Iniciar" para comenzar.';
      return;
    }
    const dec = parseInt(els.dec.value || '0',10);
    const uni = parseInt(els.uni.value || '0',10);
    const answer = dec*10 + uni;
    clearInterval(state.timer);
    const spent = state.time;
    state.totalAttempts++;
    state.totalTimeMs += spent * 1000;

    if(answer === currentAnswer){
      sGood.currentTime = 0; sGood.play();
      const bonus = Math.max(0, config.timeBonusMax - spent);
      const gained = config.basePoints + bonus;
      state.points += gained;
      state.enemyHP = Math.max(0, state.enemyHP - Math.round(100/config.levels[state.levelIndex].questions));
      state.questionCount++;
      state.totalCorrect++;
      if(spent <= 3){ giveMedal('Velocidad'); }
      state.xp += 12 + Math.floor(bonus/2);
      if(state.xp >= state.xpTarget){
        state.xp -= state.xpTarget;
        state.xpTarget = Math.round(state.xpTarget * 1.25);
        giveMedal('SubisteNivel');
      }
      els.mensaje.innerText = `✅ Correcto! +${gained} pts (tiempo ${spent}s)`;
      if(state.questionCount >= config.levels[state.levelIndex].questions){
        state.levelIndex++;
        state.questionCount = 0;
        state.attemptsLeft = config.levels[Math.min(state.levelIndex, config.levels.length-1)].attempts || 2;
        state.enemyHP = 100;
        if(state.levelIndex >= config.levels.length){
          endGame('🎉 ¡Misión completa!');
          return;
        }
        els.mensaje.innerText += ' 🚀 Subiste de nivel!';
      }
    } else {
      sBad.currentTime = 0; sBad.play();
      const lostIndex = state.lives - 1;
      state.lives--;
      state.attemptsLeft--;
      sLifeLost.currentTime = 0;
      sLifeLost.play().catch(()=>{});
      updateHearts(lostIndex);
      els.mensaje.innerText = `❌ Incorrecto — la respuesta era ${currentAnswer}`;
      state.points = Math.max(0, state.points - 2);
      state.totalWrong++;
      if(state.attemptsLeft <= 0){
        els.mensaje.innerText += ' — Perdiste las oportunidades de este nivel, se reinicia nivel.';
        state.questionCount = 0;
        state.attemptsLeft = config.levels[state.levelIndex].attempts;
        state.enemyHP = 100;
      }
      if(state.lives <= 0){
        endGame('💥 Te quedaste sin vidas');
        return;
      }
    }

    updateHUD();
    saveLocal();
    saveAttempt(answer, spent, answer === currentAnswer);
    setTimeout(()=> generateQuestion(), 900);
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
      state.attemptsLeft = config.levels[state.levelIndex].attempts;
      state.enemyHP = 100;
    }
    updateHUD();
    saveLocal();
    saveAttempt(null, state.time, false, true);
    setTimeout(()=> generateQuestion(), 700);
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
        difficulty: config.levels[state.levelIndex]?.name || 'general',
        mode: config.levels[state.levelIndex]?.type || 'general',
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
    } else {
      localStorage.setItem('misiones_state', JSON.stringify({
        points: state.points, xp: state.xp, levelIndex: state.levelIndex, medals: state.medals
      }));
    }
  }

  async function setupLoginOverlay(){
    if(!els.overlay || !els.btnIngresar){ return; }
    setGameControlsEnabled(false);

    const syncOverlayPlayers = async ()=>{
      if(!window.AppStorage || !window.AppStorage.syncPlayersUI){
        return;
      }
      await window.AppStorage.syncPlayersUI();
      const baseSelect = document.getElementById('playerSelect');
      els.overlayPlayerSelect.innerHTML = baseSelect.innerHTML;
      els.overlayPlayerSelect.value = baseSelect.value;
      els.overlayStatus.innerText = 'Selecciona y presiona Ingresar';
    };

    els.btnIngresar.addEventListener('click', async ()=>{
      const selected = els.overlayPlayerSelect.value;
      if(!selected){
        els.overlayStatus.innerText = 'Debes seleccionar un jugador.';
        return;
      }
      if(window.FirebasePlaceholder){
        window.FirebasePlaceholder.setActivePlayer(selected);
        await window.FirebasePlaceholder.logLogin({ playerId: selected });
      }
      const baseSelect = document.getElementById('playerSelect');
      if(baseSelect){ baseSelect.value = selected; }
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

  document.getElementById('btnExport').addEventListener('click', ()=>{
    const data = { points: state.points, xp: state.xp, medals: state.medals, date:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'progreso_misones.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  updateHUD();
  state.sessionId = buildSessionId();
  generateQuestion();
  setupLoginOverlay();

  window.__misiones_state = state;
})();
