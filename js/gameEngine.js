
// Core game engine
(function(){
  const config = {
    levels: [
      { id:1, name:'Sumas', type:'add', questions:5, attempts:2 },
      { id:2, name:'Restas', type:'sub', questions:5, attempts:2 },
      { id:3, name:'Multiplicaciones', type:'mul', questions:5, attempts:2 }
    ],
    basePoints: 10,
    timeBonusMax: 10 // extra points if very fast
  };

  let state = {
    levelIndex:0, // index in config.levels
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
    totalTimeMs: 0
  };

  // sounds
  const sGood = new Audio('https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg');
  const sBad = new Audio('https://actions.google.com/sounds/v1/cartoon/boing.ogg');

  // DOM
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
    puntos: document.getElementById('puntos'),
    vidas: document.getElementById('vidas'),
    tiempo: document.getElementById('tiempo'),
    nivelTxt: document.getElementById('nivelTxt'),
    progreso: document.getElementById('progreso'),
    vidaEnemigo: document.getElementById('vidaEnemigo'),
    mensaje: document.getElementById('mensaje'),
    medalla: document.getElementById('medalla'),
    xpFill: document.getElementById('xpFill'),
    xpText: document.getElementById('xp'),
    xpTarget: document.getElementById('xpTarget'),
    panelQuick: document.getElementById('panelQuick')
  };

  // util
  function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

  // question generator based on level
  let currentAnswer = 0;
  let currentQuestionLabel = '';
  function buildSessionId(){
    const d = new Date();
    const pad = (n) => String(n).padStart(2,'0');
    return `s_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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
    els.dec.value = '';
    els.uni.value = '';
    els.dec.focus();
    state.lastQuestionCreatedAt = Date.now();

    // start per-question timer
    state.timer = setInterval(()=>{
      state.time++;
      els.tiempo.innerText = state.time;
    },1000);
  }

  function updateHUD(){
    els.puntos.innerText = state.points;
    els.vidas.innerText = state.lives;
    els.progreso.innerText = state.questionCount + '/' + config.levels[state.levelIndex].questions;
    els.vidaEnemigo.style.width = Math.max(0, state.enemyHP) + '%';
    els.nivelTxt.innerText = config.levels[state.levelIndex].name;
    els.xpText.innerText = state.xp;
    els.xpTarget.innerText = state.xpTarget;
    els.xpFill.style.width = Math.min(100, (state.xp/state.xpTarget)*100) + '%';
    els.panelQuick.innerText = `Nivel ${config.levels[state.levelIndex].name} — Medallas: ${state.medals.join(', ') || 'ninguna'}`;
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
    // simple alert and reset
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
      totalTimeMs: 0
    };
    updateHUD();
    generateQuestion();
  }

  // verifying answer
  function verifyAnswer(){
    const dec = parseInt(els.dec.value || '0',10);
    const uni = parseInt(els.uni.value || '0',10);
    const answer = dec*10 + uni;
    clearInterval(state.timer); // stop timer for current question
    const spent = state.time;
    state.totalAttempts++;
    state.totalTimeMs += spent * 1000;
    if(answer === currentAnswer){
      sGood.currentTime = 0; sGood.play();
      // points: base + time bonus (faster -> more)
      const bonus = Math.max(0, config.timeBonusMax - spent);
      const gained = config.basePoints + bonus;
      state.points += gained;
      state.enemyHP = Math.max(0, state.enemyHP - Math.round(100/config.levels[state.levelIndex].questions));
      state.questionCount++;
      state.totalCorrect++;
      // speed medal
      if(spent <= 3){ giveMedal('Velocidad'); }
      // XP and racha simplified
      state.xp += 12 + Math.floor(bonus/2);
      if(state.xp >= state.xpTarget){
        state.xp -= state.xpTarget;
        state.xpTarget = Math.round(state.xpTarget * 1.25);
        giveMedal('SubisteNivel');
      }
      els.mensaje.innerText = `✅ Correcto! +${gained} pts (tiempo ${spent}s)`;
      // if completed level
      if(state.questionCount >= config.levels[state.levelIndex].questions){
        // advance level or finish
        state.levelIndex++;
        state.questionCount = 0;
        state.attemptsLeft = config.levels[Math.min(state.levelIndex, config.levels.length-1)].attempts || 2;
        state.enemyHP = 100;
        if(state.levelIndex >= config.levels.length){
          endGame('🎉 ¡Misión completa!');
          return;
        } else {
          els.mensaje.innerText += ' 🚀 Subiste de nivel!';
        }
      }
    } else {
      sBad.currentTime = 0; sBad.play();
      state.lives--;
      state.attemptsLeft--;
      els.mensaje.innerText = `❌ Incorrecto — la respuesta era ${currentAnswer}`;
      // small penalty
      state.points = Math.max(0, state.points - 2);
      state.totalWrong++;
      // if attempts for level exhausted -> reset level progress
      if(state.attemptsLeft <= 0){
        els.mensaje.innerText += ' — Perdiste las oportunidades de este nivel, se reinicia nivel.';
        // reset current level progress
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
    // next question after small delay
    setTimeout(()=> generateQuestion(), 900);
  }

  // skip question (counts as an attempt use)
  function skipQuestion(){
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
        points: state.points
      });
    }
  }

  // local persistence helpers (uses storage.js API if present)
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

  // wiring buttons
  els.btn.addEventListener('click', verifyAnswer);
  els.btnSkip.addEventListener('click', skipQuestion);
  document.getElementById('btnExport').addEventListener('click', ()=>{
    const data = { points: state.points, xp: state.xp, medals: state.medals, date:new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'progreso_misones.json'; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  // start
  updateHUD();
  state.sessionId = buildSessionId();
  generateQuestion();

  // expose for debug
  window.__misiones_state = state;

})();
