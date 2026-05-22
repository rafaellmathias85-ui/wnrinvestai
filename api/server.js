require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('./db');

const app = express();

// ── Logging estruturado ───────────────────────────────────────
const log = (level, msg, data = {}) => {
  const entry = { ts: new Date().toISOString(), level, msg, ...data };
  (level === 'error' ? console.error : console.log)(JSON.stringify(entry));
};

// ── Segurança: headers HTTP ───────────────────────────────────
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: false,      // gerenciado pelo nginx
  crossOriginEmbedderPolicy: false,  // compatibilidade com MP redirect
}));

// ── CORS restrito às origens autorizadas ──────────────────────
app.use(cors({
  origin: ['https://wnrtecnologia.com.br', 'http://localhost:8080'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '32kb' }));

// ── Rate limiters ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas de pagamento. Aguarde um momento.' },
});

// IA proxy: 15 chamadas/min por IP (camada server-side)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições de IA. Aguarde um momento.' },
});

app.use('/api/', generalLimiter);

// ── Validações ────────────────────────────────────────────────
const EMAIL_RE      = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const VALID_PLANS   = new Set(['pro', 'premium']);
const VALID_BILLING = new Set(['monthly', 'annual']);

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

const PLANS = {
  pro:     { label: 'InvestAI Pro',     monthly: 29.00, annual: 276.00 },
  premium: { label: 'InvestAI Premium', monthly: 59.00, annual: 564.00 },
};

// ── GET /api/health ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), uptime: Math.round(process.uptime()) });
});

// ── GET /api/plan ─────────────────────────────────────────────
app.get('/api/plan', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !EMAIL_RE.test(email)) return res.json({ plan: 'free' });
  const row = db.getPlan(email);
  if (!row) return res.json({ plan: 'free' });
  if (row.plan_exp && Date.now() > row.plan_exp) return res.json({ plan: 'free' });
  res.json({ plan: row.plan, planExp: row.plan_exp });
});

// ── POST /api/checkout ────────────────────────────────────────
app.post('/api/checkout', checkoutLimiter, async (req, res) => {
  const { email, plan, billing } = req.body || {};
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim()))
    return res.status(400).json({ error: 'E-mail inválido.' });
  if (!VALID_PLANS.has(plan))
    return res.status(400).json({ error: 'Plano inválido.' });
  if (!VALID_BILLING.has(billing))
    return res.status(400).json({ error: 'Período de cobrança inválido.' });

  const cleanEmail = email.toLowerCase().trim();
  const planData   = PLANS[plan];
  const price      = billing === 'annual' ? planData.annual : planData.monthly;
  const label      = `${planData.label} ${billing === 'annual' ? 'Anual' : 'Mensal'}`;
  const days       = billing === 'annual' ? 365 : 30;

  try {
    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [{ title: label, unit_price: price, quantity: 1, currency_id: 'BRL' }],
        payer: { email: cleanEmail },
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }],
          installments: billing === 'annual' ? 12 : 1,
        },
        back_urls: {
          success: 'https://wnrtecnologia.com.br/investai/app',
          failure: 'https://wnrtecnologia.com.br/investai#planos',
          pending: 'https://wnrtecnologia.com.br/investai/app',
        },
        auto_return: 'approved',
        notification_url: 'https://wnrtecnologia.com.br/api/webhook',
        metadata: { email: cleanEmail, plan, billing, days },
      },
    });
    res.json({ url: result.init_point });
  } catch (e) {
    log('error', 'checkout_error', { msg: e.message });
    res.status(500).json({ error: 'Erro ao criar checkout. Tente novamente.' });
  }
});

// ── POST /api/webhook ─────────────────────────────────────────
app.post('/api/webhook', async (req, res) => {
  res.sendStatus(200);
  const { type, data } = req.body || {};
  if (type !== 'payment' || !data?.id) return;
  try {
    const payment = new Payment(mp);
    const p = await payment.get({ id: data.id });
    if (p.status === 'approved') {
      const { email, plan, days } = p.metadata || {};
      if (email && VALID_PLANS.has(plan) && Number(days) > 0) {
        db.setPlan(email.toLowerCase(), plan, Number(days));
        log('info', 'plan_activated', { email, plan });
      }
    }
  } catch (e) {
    log('error', 'webhook_error', { msg: e.message });
  }
});

// ── POST /api/ai — Proxy seguro para Anthropic ────────────────
// A chave API fica no servidor; o browser não a vê.
app.post('/api/ai', aiLimiter, async (req, res) => {
  const { message, system, maxTokens } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 8000)
    return res.status(400).json({ error: 'Mensagem inválida.' });
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ error: 'Serviço de IA não configurado.' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: Math.min(Number(maxTokens) || 900, 4096),
        system:     typeof system === 'string' ? system.slice(0, 4000) : '',
        messages:   [{ role: 'user', content: message }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'Erro da IA.' });
    }

    const data = await r.json();
    res.json({ text: data.content?.[0]?.text || '' });
  } catch (e) {
    log('error', 'ai_proxy_error', { msg: e.message });
    res.status(500).json({ error: 'Erro ao conectar com a IA. Tente novamente.' });
  }
});

// ── GET /api/b3quote — Proxy B3/FIIs sem CORS ─────────────────
// Cache in-memory de 1 minuto; Brapi como fonte; sem dependências extras.
const _b3Cache  = new Map();   // ticker -> { data, ts }
const B3_TTL_MS = 60 * 1000;  // 1 minuto

app.get('/api/b3quote', async (req, res) => {
  const rawList = (req.query.tickers || '').toUpperCase().split(',');
  const tickers = rawList
    .map(t => t.trim())
    .filter(t => /^[A-Z0-9^]{1,12}$/.test(t))
    .slice(0, 20);

  if (!tickers.length)
    return res.status(400).json({ error: 'Informe ao menos um ticker válido.' });

  const now    = Date.now();
  const result = {};
  const missing = [];

  tickers.forEach(sym => {
    const c = _b3Cache.get(sym);
    if (c && (now - c.ts) < B3_TTL_MS) result[sym] = c.data;
    else missing.push(sym);
  });

  if (missing.length) {
    try {
      const url = `https://brapi.dev/api/quote/${missing.join(',')}?fundamental=false`;
      const r   = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const raw = await r.json();
        (raw.results || []).forEach(q => {
          if (q.regularMarketPrice > 0) {
            const item = {
              symbol:    q.symbol,
              name:      q.shortName || q.symbol,
              price:     q.regularMarketPrice,
              change24h: q.regularMarketChangePercent || 0,
              change:    q.regularMarketChange || 0,
              high:      q.regularMarketDayHigh,
              low:       q.regularMarketDayLow,
              vol:       q.regularMarketVolume,
              updatedAt: q.regularMarketTime,
            };
            _b3Cache.set(q.symbol, { data: item, ts: now });
            result[q.symbol] = item;
          }
        });
      }
    } catch (_) { /* retorna o que estiver em cache mesmo que Brapi falhe */ }
  }

  res.json(result);
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, _next) => {
  log('error', 'unhandled_error', { msg: err.message, path: req.path });
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => log('info', 'server_started', { port: PORT }));
