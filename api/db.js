const path = require('path');

// Tenta carregar better-sqlite3 (nativo — requer compilação no Windows).
// Em dev local sem build tools, cai no mock em memória automaticamente.
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
    )
  `);
  _real = {
    getPlan(email) {
      return db.prepare('SELECT * FROM plans WHERE email = ?').get(email) || null;
    },
    setPlan(email, plan, days) {
      const planExp = Date.now() + days * 86400000;
      db.prepare(`
        INSERT INTO plans (email, plan, plan_exp, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          plan       = excluded.plan,
          plan_exp   = excluded.plan_exp,
          updated_at = excluded.updated_at
      `).run(email, plan, planExp, Date.now());
    },
  };
} catch (_) {
  // Módulo nativo indisponível (ex: Windows sem VS Build Tools, Node 24+).
  // Mock em memória: planos não persistem entre reinicializações — aceitável em dev.
  console.warn('[db] better-sqlite3 indisponível — usando mock em memória (somente dev)');
  const _store = new Map();
  _real = {
    getPlan(email) { return _store.get(email) || null; },
    setPlan(email, plan, days) {
      _store.set(email, { email, plan, plan_exp: Date.now() + days * 86400000, updated_at: Date.now() });
    },
  };
}

module.exports = _real;
