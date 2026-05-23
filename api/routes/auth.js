const express   = require('express');
const bcrypt    = require('bcryptjs');
const crypto    = require('crypto');
const db        = require('../db');

const router = express.Router();

// ── Email (opcional — só envia se SMTP configurado) ───────────
let _transporter = null;
try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
} catch (_) {}

async function _sendResetEmail(email, link) {
  const html = `
    <p>Olá,</p>
    <p>Recebemos um pedido de redefinição de senha para sua conta InvestAI.</p>
    <p><a href="${link}" style="background:#B8965A;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Redefinir senha</a></p>
    <p style="color:#888;font-size:12px">O link expira em 1 hora. Se você não solicitou, ignore este e-mail.</p>
    <p style="color:#888;font-size:12px">Link direto: ${link}</p>
  `;
  if (_transporter) {
    try {
      await _transporter.sendMail({
        from:    process.env.SMTP_FROM || 'InvestAI <noreply@investai.com>',
        to:      email,
        subject: 'InvestAI — Redefinição de senha',
        html,
      });
      return;
    } catch (e) {
      console.error('[email]', e.message);
    }
  }
  console.log(`[INVESTAI RESET LINK] ${email} → ${link}`);
}

// ── Helpers ───────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const RESET_TTL   = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

function _token() { return crypto.randomBytes(32).toString('hex'); }

function _requireToken(req) {
  const h = req.headers['authorization'] || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function _sessionUser(req, res) {
  const token = _requireToken(req);
  if (!token) { res.status(401).json({ error: 'Token ausente.' }); return null; }
  const s = db.getSession(token);
  if (!s) { res.status(401).json({ error: 'Sessão inválida ou expirada.' }); return null; }
  return { token, email: s.email };
}

function _buildSession(token, user, expiresAt) {
  if (!user) throw new Error('Usuário não encontrado após criação.');
  return {
    token,
    expiresAt,
    user: {
      id:      user.email,
      name:    user.name,
      email:   user.email,
      avatar:  user.avatar  || null,
      plan:    user.plan    || 'free',
      planExp: user.plan_exp || null,
      profile: (() => { try { return user.profile ? JSON.parse(user.profile) : null; } catch { return null; } })(),
    },
  };
}

// ── POST /api/auth/register ───────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || String(name).trim().length < 2)
      return res.status(400).json({ error: 'Nome deve ter ao menos 2 caracteres.' });
    const emailClean = String(email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(emailClean))
      return res.status(400).json({ error: 'Formato de e-mail inválido.' });
    if (!password || password.length < 6 || password.length > 128)
      return res.status(400).json({ error: 'Senha deve ter entre 6 e 128 caracteres.' });

    if (db.getUserByEmail(emailClean))
      return res.status(400).json({ error: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.createUser(emailClean, name.trim(), hash);

    const token = _token();
    const expiresAt = Date.now() + SESSION_TTL;
    db.createSession(token, emailClean, expiresAt);

    const user = db.getUserByEmail(emailClean);
    res.json(_buildSession(token, user, expiresAt));
  } catch (err) {
    console.error('[auth/register]', err.message, err.stack);
    next(err);
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const emailClean = String(email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(emailClean))
      return res.status(400).json({ error: 'Formato de e-mail inválido.' });
    if (!password)
      return res.status(400).json({ error: 'Senha obrigatória.' });

    const user = db.getUserByEmail(emailClean);
    if (!user)
      return res.status(401).json({ error: 'E-mail não encontrado.', code: 'USER_NOT_FOUND' });
    if (!user.password_hash)
      return res.status(401).json({ error: 'Conta Google — use o botão "Entrar com Google".' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Senha incorreta.' });

    const token = _token();
    const expiresAt = Date.now() + SESSION_TTL;
    db.createSession(token, emailClean, expiresAt);

    res.json(_buildSession(token, user, expiresAt));
  } catch (err) {
    console.error('[auth/login]', err.message, err.stack);
    next(err);
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────
router.post('/logout', (req, res) => {
  const token = _requireToken(req);
  if (token) db.deleteSession(token);
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', (req, res) => {
  const s = _sessionUser(req, res);
  if (!s) return;
  const user = db.getUserByEmail(s.email);
  if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' });
  res.json({
    id:      user.email,
    name:    user.name,
    email:   user.email,
    avatar:  user.avatar || null,
    plan:    user.plan || 'free',
    planExp: user.plan_exp || null,
    profile: user.profile ? JSON.parse(user.profile) : null,
  });
});

// ── POST /api/auth/reset-request ─────────────────────────────
router.post('/reset-request', async (req, res, next) => {
  res.json({ ok: true }); // sempre 200 para não vazar existência do email
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!EMAIL_RE.test(email)) return;
    const user = db.getUserByEmail(email);
    if (!user) return;

    const token = _token();
    db.createPasswordReset(token, email, Date.now() + RESET_TTL);

    const base = process.env.APP_BASE_URL || 'http://localhost:3001';
    const link = `${base}/investai/login.html?reset=${token}`;
    await _sendResetEmail(email, link);
  } catch (err) {
    console.error('[auth/reset-request]', err.message);
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Token obrigatório.' });
    if (!password || password.length < 6 || password.length > 128)
      return res.status(400).json({ error: 'Senha deve ter entre 6 e 128 caracteres.' });

    const reset = db.getPasswordReset(token);
    if (!reset) return res.status(400).json({ error: 'Link inválido ou expirado.' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.updatePassword(reset.email, hash);
    db.markPasswordResetUsed(token);
    db.deleteUserSessions(reset.email);

    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/reset-password]', err.message, err.stack);
    next(err);
  }
});

// ── POST /api/auth/update-profile ────────────────────────────
router.post('/update-profile', (req, res) => {
  const s = _sessionUser(req, res);
  if (!s) return;
  const { profile } = req.body || {};
  if (profile) db.updateUserProfile(s.email, JSON.stringify(profile));
  res.json({ ok: true });
});

module.exports = router;
