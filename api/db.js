const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS plans (
    email    TEXT PRIMARY KEY,
    plan     TEXT NOT NULL DEFAULT 'free',
    plan_exp INTEGER,
    updated_at INTEGER NOT NULL
  )
`);

module.exports = {
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
