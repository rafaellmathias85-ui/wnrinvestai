#!/usr/bin/env node
/**
 * Cria ou redefine a senha do admin no banco SQLite.
 * Uso: node api/seed-admin.js
 *
 * Execute na VPS dentro de /var/www/wnrinvestai
 */
const path    = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const bcrypt   = require('bcryptjs');
const Database = require('better-sqlite3');

const ADMIN_EMAIL = 'rafaellmathias85@gmail.com';
const ADMIN_NAME  = 'Rafael';
const ADMIN_PASS  = 'Winner@123!';
const ADMIN_PLAN  = 'premium';

const db = new Database(path.join(__dirname, 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT,
    google_id TEXT, avatar TEXT, profile TEXT,
    plan TEXT NOT NULL DEFAULT 'free', plan_exp INTEGER, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plans (
    email TEXT PRIMARY KEY, plan TEXT NOT NULL DEFAULT 'free',
    plan_exp INTEGER, updated_at INTEGER NOT NULL
  );
`);

const hash = bcrypt.hashSync(ADMIN_PASS, 10);
const now  = Date.now();

const existing = db.prepare('SELECT email FROM users WHERE email = ?').get(ADMIN_EMAIL);

if (existing) {
  db.prepare('UPDATE users SET password_hash=?, plan=?, plan_exp=NULL WHERE email=?')
    .run(hash, ADMIN_PLAN, ADMIN_EMAIL);
  console.log(`[seed] Senha e plano atualizados para ${ADMIN_EMAIL}`);
} else {
  db.prepare(`INSERT INTO users (email,name,password_hash,plan,plan_exp,created_at) VALUES (?,?,?,?,NULL,?)`)
    .run(ADMIN_EMAIL, ADMIN_NAME, hash, ADMIN_PLAN, now);
  console.log(`[seed] Usuário ${ADMIN_EMAIL} criado com plano ${ADMIN_PLAN}`);
}

db.prepare(`
  INSERT INTO plans (email,plan,plan_exp,updated_at) VALUES (?,?,NULL,?)
  ON CONFLICT(email) DO UPDATE SET plan=excluded.plan, plan_exp=NULL, updated_at=excluded.updated_at
`).run(ADMIN_EMAIL, ADMIN_PLAN, now);

console.log('[seed] Concluído. Teste o login agora.');
db.close();
