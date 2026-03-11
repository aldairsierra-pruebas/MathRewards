
// Simple storage wrapper and Firebase placeholder hook.
window.AppStorage = (function(){
  const KEY = 'misiones_v1_store';

  function save(obj){
    try{
      const raw = JSON.stringify(obj);
      localStorage.setItem(KEY, raw);
      // optional hook to firebase
      if(window.FirebasePlaceholder && typeof window.FirebasePlaceholder.save === 'function'){
        window.FirebasePlaceholder.save('progress', obj).catch(e=>console.warn('firebase save failed',e));
      }
    }catch(e){ console.warn('save failed', e); }
  }

  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  return { save, load };
})();
