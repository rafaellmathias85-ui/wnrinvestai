const path = require('path');

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
} catch (_) {
  console.warn('[db] better-sqlite3 indisponível — usando mock em memória (somente dev)');
  const _plans = new Map();
  const _users = new Map();
  const _sessions = new Map();
  const _resets = new Map();

  _real = {
    getPlan(email) { return _plans.get(email) || null; },
    setPlan(email, plan, days) {
      const plan_exp = Date.now() + days * 86400000;
      _plans.set(email, { email, plan, plan_exp, updated_at: Date.now() });
      const u = _users.get(email);
      if (u) { u.plan = plan; u.plan_exp = plan_exp; }
    },
    createUser(email, name, passwordHash, googleId = null, avatar = null) {
      _users.set(email, { email, name, password_hash: passwordHash, google_id: googleId, avatar, profile: null, plan: 'free', plan_exp: null, created_at: Date.now() });
    },
    getUserByEmail(email) { return _users.get(email) || null; },
    updatePassword(email, hash) { const u = _users.get(email); if (u) u.password_hash = hash; },
    updateUserProfile(email, profileJson) { const u = _users.get(email); if (u) u.profile = profileJson; },
    createSession(token, email, expiresAt) { _sessions.set(token, { token, email, expires_at: expiresAt, created_at: Date.now() }); },
    getSession(token) { const s = _sessions.get(token); return (s && s.expires_at > Date.now()) ? s : null; },
    deleteSession(token) { _sessions.delete(token); },
    deleteUserSessions(email) { _sessions.forEach((v, k) => { if (v.email === email) _sessions.delete(k); }); },
    deleteExpiredSessions() { const now = Date.now(); _sessions.forEach((v, k) => { if (v.expires_at < now) _sessions.delete(k); }); },
    createPasswordReset(token, email, expiresAt) {
      _resets.forEach((v, k) => { if (v.email === email && !v.used) v.used = true; });
      _resets.set(token, { token, email, expires_at: expiresAt, used: false });
    },
    getPasswordReset(token) { const r = _resets.get(token); return (r && !r.used && r.expires_at > Date.now()) ? r : null; },
    markPasswordResetUsed(token) { const r = _resets.get(token); if (r) r.used = true; },
  };
}

module.exports = _real;
