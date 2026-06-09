const path = require('path');
const fs = require('fs');

let _real = null;
try {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(__dirname, 'data.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      email      TEXT PRIMARY KEY,
      plan       TEXT NOT NULL DEFAULT 'free',
      plan_exp   INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      email         TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      password_hash TEXT,
      google_id     TEXT,
      avatar        TEXT,
      profile       TEXT,
      plan          TEXT NOT NULL DEFAULT 'free',
      plan_exp      INTEGER,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS password_resets (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    );
  `);

  _real = {
    // ── Plans (existente) ───────────────────────────────────
    getPlan(email) {
      return db.prepare('SELECT * FROM plans WHERE email = ?').get(email) || null;
    },
    setPlan(email, plan, days) {
      const planExp = Date.now() + days * 86400000;
      db.prepare(`
        INSERT INTO plans (email, plan, plan_exp, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET plan=excluded.plan, plan_exp=excluded.plan_exp, updated_at=excluded.updated_at
      `).run(email, plan, planExp, Date.now());
      // Sincroniza plan na tabela users também
      db.prepare('UPDATE users SET plan=?, plan_exp=? WHERE email=?').run(plan, planExp, email);
    },

    // ── Users ───────────────────────────────────────────────
    createUser(email, name, passwordHash, googleId = null, avatar = null) {
      db.prepare(`
        INSERT INTO users (email, name, password_hash, google_id, avatar, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(email, name, passwordHash, googleId, avatar, Date.now());
    },
    getUserByEmail(email) {
      return db.prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
    },
    updatePassword(email, hash) {
      db.prepare('UPDATE users SET password_hash=? WHERE email=?').run(hash, email);
    },
    updateUserProfile(email, profileJson) {
      db.prepare('UPDATE users SET profile=? WHERE email=?').run(profileJson, email);
    },

    // ── Sessions ────────────────────────────────────────────
    createSession(token, email, expiresAt) {
      db.prepare('INSERT INTO sessions (token,email,expires_at,created_at) VALUES (?,?,?,?)')
        .run(token, email, expiresAt, Date.now());
    },
    getSession(token) {
      const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
      if (!s || s.expires_at < Date.now()) return null;
      return s;
    },
    deleteSession(token) {
      db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    },
    deleteUserSessions(email) {
      db.prepare('DELETE FROM sessions WHERE email=?').run(email);
    },
    deleteExpiredSessions() {
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    },

    // ── Password reset ──────────────────────────────────────
    createPasswordReset(token, email, expiresAt) {
      // invalida tokens anteriores não usados
      db.prepare('UPDATE password_resets SET used=1 WHERE email=? AND used=0').run(email);
      db.prepare('INSERT INTO password_resets (token,email,expires_at,used) VALUES (?,?,?,0)')
        .run(token, email, expiresAt);
    },
    getPasswordReset(token) {
      const r = db.prepare('SELECT * FROM password_resets WHERE token=? AND used=0').get(token);
      if (!r || r.expires_at < Date.now()) return null;
      return r;
    },
    markPasswordResetUsed(token) {
      db.prepare('UPDATE password_resets SET used=1 WHERE token=?').run(token);
    },
  };
} catch (e) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[db] better-sqlite3 indisponivel em producao:', e.message);
    throw e;
  }
  console.warn('[db] better-sqlite3 indisponivel; usando api/data.local.json persistente (dev):', String(e.message).split('\n')[0]);
  const STORE_FILE = path.join(__dirname, 'data.local.json');
  const _empty = () => ({ plans: {}, users: {}, sessions: {}, resets: {} });
  let _store = _empty();

  function _load() {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
        _store = {
          plans: raw.plans || {},
          users: raw.users || {},
          sessions: raw.sessions || {},
          resets: raw.resets || {},
        };
      }
    } catch (err) {
      console.warn('[db] falha ao ler data.local.json; iniciando vazio:', err.message);
      _store = _empty();
    }
  }

  function _save() {
    const tmp = `${STORE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(_store, null, 2));
    fs.renameSync(tmp, STORE_FILE);
  }

  _load();

  _real = {
    getPlan(email) { return _store.plans[email] || null; },
    setPlan(email, plan, days) {
      const plan_exp = Date.now() + days * 86400000;
      _store.plans[email] = { email, plan, plan_exp, updated_at: Date.now() };
      const u = _store.users[email];
      if (u) { u.plan = plan; u.plan_exp = plan_exp; }
      _save();
    },
    createUser(email, name, passwordHash, googleId = null, avatar = null) {
      _store.users[email] = { email, name, password_hash: passwordHash, google_id: googleId, avatar, profile: null, plan: 'free', plan_exp: null, created_at: Date.now() };
      _save();
    },
    getUserByEmail(email) { return _store.users[email] || null; },
    updatePassword(email, hash) { const u = _store.users[email]; if (u) { u.password_hash = hash; _save(); } },
    updateUserProfile(email, profileJson) { const u = _store.users[email]; if (u) { u.profile = profileJson; _save(); } },
    createSession(token, email, expiresAt) { _store.sessions[token] = { token, email, expires_at: expiresAt, created_at: Date.now() }; _save(); },
    getSession(token) { const s = _store.sessions[token]; return (s && s.expires_at > Date.now()) ? s : null; },
    deleteSession(token) { delete _store.sessions[token]; _save(); },
    deleteUserSessions(email) { Object.entries(_store.sessions).forEach(([k, v]) => { if (v.email === email) delete _store.sessions[k]; }); _save(); },
    deleteExpiredSessions() { const now = Date.now(); Object.entries(_store.sessions).forEach(([k, v]) => { if (v.expires_at < now) delete _store.sessions[k]; }); _save(); },
    createPasswordReset(token, email, expiresAt) {
      Object.values(_store.resets).forEach(v => { if (v.email === email && !v.used) v.used = true; });
      _store.resets[token] = { token, email, expires_at: expiresAt, used: false };
      _save();
    },
    getPasswordReset(token) { const r = _store.resets[token]; return (r && !r.used && r.expires_at > Date.now()) ? r : null; },
    markPasswordResetUsed(token) { const r = _store.resets[token]; if (r) { r.used = true; _save(); } },
  };
}

module.exports = _real;
