/**
 * storage.js — Wrapper multi-usuário sobre localStorage.
 * Prefixa automaticamente as chaves com o ID do usuário logado,
 * garantindo isolamento total de dados entre contas.
 */
const Storage = {
  _pfx() {
    // Auth pode não estar disponível na página de login
    if (typeof Auth === 'undefined') return '';
    return Auth.prefix();
  },

  get(key) {
    try {
      const raw = localStorage.getItem(this._pfx() + key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  set(key, value) {
    try {
      localStorage.setItem(this._pfx() + key, JSON.stringify(value));
      return true;
    } catch { return false; }
  },

  remove(key) {
    try { localStorage.removeItem(this._pfx() + key); return true; }
    catch { return false; }
  },
};
