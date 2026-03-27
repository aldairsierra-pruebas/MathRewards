window.AppStorage = (function(){
  const PROGRESS_KEY = 'math_rewards_progress';

  function readAllProgress(){
    try{
      return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    }catch(_e){
      return {};
    }
  }

  function writeAllProgress(value){
    try{
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(value || {}));
    }catch(e){
      console.warn('local progress save failed', e);
    }
  }

  async function save(obj){
    const playerId = obj?.playerId || (window.FirebasePlaceholder && typeof window.FirebasePlaceholder.getActivePlayer === 'function' ? window.FirebasePlaceholder.getActivePlayer() : 'anon');
    const all = readAllProgress();
    all[playerId] = { ...obj, savedAt: new Date().toISOString() };
    writeAllProgress(all);
    if(window.FirebasePlaceholder && typeof window.FirebasePlaceholder.save === 'function'){
      try {
        await window.FirebasePlaceholder.save('progress', obj);
      } catch(e){
        console.warn('firebase save failed', e);
      }
    }
  }

  async function saveAttempt(payload){
    if(window.FirebasePlaceholder && typeof window.FirebasePlaceholder.saveAttempt === 'function'){
      try {
        await window.FirebasePlaceholder.saveAttempt(payload);
      } catch(e){
        console.warn('firebase attempt save failed', e);
      }
    }
  }

  function load(playerId){
    const target = playerId || (window.FirebasePlaceholder && typeof window.FirebasePlaceholder.getActivePlayer === 'function' ? window.FirebasePlaceholder.getActivePlayer() : 'anon');
    const all = readAllProgress();
    return all[target] || null;
  }

  async function syncPlayersUI(){
    const select = document.getElementById('playerSelect');
    const status = document.getElementById('playerStatus');
    if(!select || !status || !window.FirebasePlaceholder) return;

    status.innerText = 'Sincronizando jugadores con Firestore...';
    try{
      await window.FirebasePlaceholder.ensureDefaultPlayers();
      const players = await window.FirebasePlaceholder.listPlayers();
      select.innerHTML = '';
      players.forEach((p)=>{
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.id}${p.displayName && p.displayName !== p.id ? ` (${p.displayName})` : ''}`;
        select.appendChild(option);
      });

      const active = window.FirebasePlaceholder.getActivePlayer();
      const fallback = players[0]?.id || '';
      const exists = players.some((p)=>p.id === active);
      select.value = exists ? active : fallback;
      if(!exists && select.value){
        window.FirebasePlaceholder.setActivePlayer(select.value);
      }
      status.innerText = `Jugador activo: ${window.FirebasePlaceholder.getActivePlayer()}`;
    }catch(e){
      console.warn(e);
      status.innerText = 'No se pudo leer Firestore.';
    }
  }

  function setupPlayerUI(){
    const btnSet = document.getElementById('btnSetPlayer');
    const btnRefresh = document.getElementById('btnRefreshPlayers');
    const select = document.getElementById('playerSelect');
    const status = document.getElementById('playerStatus');

    if(btnSet && select && status){
      btnSet.addEventListener('click', ()=>{
        if(!select.value) return;
        if(window.FirebasePlaceholder){
          window.FirebasePlaceholder.setActivePlayer(select.value);
          status.innerText = `Jugador activo confirmado: ${select.value}`;
        }
      });
    }

    if(btnRefresh){
      btnRefresh.addEventListener('click', ()=>{ syncPlayersUI(); });
    }

    window.addEventListener('firebase-ready', ()=> syncPlayersUI());

    if(window.FirebasePlaceholder){
      syncPlayersUI();
    }
  }

  document.addEventListener('DOMContentLoaded', setupPlayerUI);

  return { save, saveAttempt, load, syncPlayersUI };
})();
