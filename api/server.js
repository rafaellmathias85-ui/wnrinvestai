require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(cors({
  origin: ['https://wnrtecnologia.com.br', 'http://localhost:8080'],
}));

const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

const PLANS = {
  pro:     { label: 'InvestAI Pro',     monthly: 29.00, annual: 276.00 },
  premium: { label: 'InvestAI Premium', monthly: 59.00, annual: 564.00 },
};

// GET /api/plan?email=xxx  — frontend consulta plano do usuário
app.get('/api/plan', (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.json({ plan: 'free' });
  const row = db.getPlan(email);
  if (!row) return res.json({ plan: 'free' });
  if (row.plan_exp && Date.now() > row.plan_exp) return res.json({ plan: 'free' });
  res.json({ plan: row.plan, planExp: row.plan_exp });
});

// POST /api/checkout  { email, plan, billing }  — cria preferência MP
app.post('/api/checkout', async (req, res) => {
  const { email, plan, billing } = req.body;
  const planData = PLANS[plan];
  if (!planData || !email) return res.status(400).json({ error: 'Dados inválidos' });

  const price = billing === 'annual' ? planData.annual : planData.monthly;
  const label = `${planData.label} ${billing === 'annual' ? 'Anual' : 'Mensal'}`;
  const days  = billing === 'annual' ? 365 : 30;

  try {
    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [{ title: label, unit_price: price, quantity: 1, currency_id: 'BRL' }],
        payer: { email },
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
        metadata: { email: email.toLowerCase(), plan, billing, days },
      },
    });
    res.json({ url: result.init_point });
  } catch (e) {
    console.error('Checkout error:', e.message);
    res.status(500).json({ error: 'Erro ao criar checkout' });
  }
});

// POST /api/webhook  — recebe notificação do Mercado Pago
app.post('/api/webhook', async (req, res) => {
  res.sendStatus(200);
  const { type, data } = req.body;
  if (type !== 'payment' || !data?.id) return;

  try {
    const payment = new Payment(mp);
    const p = await payment.get({ id: data.id });
    if (p.status === 'approved') {
      const { email, plan, days } = p.metadata || {};
      if (email && plan && days) {
        db.setPlan(email.toLowerCase(), plan, Number(days));
        console.log(`[webhook] Plano ${plan} ativado para ${email}`);
      }
    }
  } catch (e) {
    console.error('Webhook error:', e.message);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '127.0.0.1', () => console.log(`InvestAI API rodando na porta ${PORT}`));
