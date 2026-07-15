// On-device persistence for the offline app. Exposed as window.Store.
// All data lives in localStorage under a single namespaced JSON blob, so the
// app is fully self-contained — no server, works offline on the phone.
(function () {
  const KEY = 'hwp_mobile_v1';

  const EMPTY = {
    seq: 1,
    users: [],
    session: null, // { userId }
    pets: [],
    weights: [],
    vaccinations: [],
    medications: [],
    training: [],
    meals: [],
    expenses: [],
    activities: [],
    documents: [],
  };

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(EMPTY));
    } catch {
      cache = JSON.parse(JSON.stringify(EMPTY));
    }
    // ensure all tables exist (forward-compat)
    for (const k of Object.keys(EMPTY)) if (!(k in cache)) cache[k] = JSON.parse(JSON.stringify(EMPTY[k]));
    return cache;
  }

  function save() {
    if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  }

  function nextId() {
    const db = load();
    return db.seq++;
  }

  // Simple SHA-256 hex (for light password hygiene on-device).
  async function hash(str) {
    if (window.crypto && window.crypto.subtle) {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return 'plain:' + btoa(unescape(encodeURIComponent(str)));
  }

  function reset() { localStorage.removeItem(KEY); cache = null; }

  window.Store = { load, save, nextId, hash, reset, KEY };
})();
