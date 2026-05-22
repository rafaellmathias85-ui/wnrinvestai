require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('./db');

const app = express();

// ── Segurança: headers HTTP ───────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,      // gerenciado pelo nginx
  crossOriginEmbedderPolicy: false,  // compatibilidade com MP redirect
}));

// ── CORS restrito às origens autorizadas ──────────────────────
app.use(cors({
  origin: ['https://wnrtecnologia.com.br', 'http://localhost:8080'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '32kb' }));  // limita tamanho do body

// ── Rate limiting ─────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
});

// Checkout: máximo 5 tentativas por IP/minuto (evita abuso)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de pagamento. Aguarde um momento.' },
});

app.use('/api/', generalLimiter);

// ── Validação de e-mail ───────────────────────────────────────
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const VALID_PLANS    = new Set(['pro', 'premium']);
const VALID_BILLING  = new Set(['monthly', 'annual']);

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

const PLANS = {
  pro:     { label: 'InvestAI Pro',     monthly: 29.00, annual: 276.00 },
  premium: { label: 'InvestAI Premium', monthly: 59.00, annual: 564.00 },
};

// GET /api/plan?email=xxx  — frontend consulta plano do usuário
app.get('/api/plan', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !EMAIL_RE.test(email)) return res.json({ plan: 'free' });
  const row = db.getPlan(email);
  if (!row) return res.json({ plan: 'free' });
  if (row.plan_exp && Date.now() > row.plan_exp) return res.json({ plan: 'free' });
  res.json({ plan: row.plan, planExp: row.plan_exp });
});

// POST /api/checkout  { email, plan, billing }  — cria preferência MP
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
    console.error('Checkout error:', e.message);
    res.status(500).json({ error: 'Erro ao criar checkout. Tente novamente.' });
  }
});

// POST /api/webhook  — recebe notificação do Mercado Pago
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
        console.log(`[webhook] Plano ${plan} ativado para ${email}`);
      }
    }
  } catch (e) {
    console.error('Webhook error:', e.message);
  }
});

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ── Error handler global (sem stack trace em produção) ────────
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => console.log(`InvestAI API rodando na porta ${PORT}`));
