const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const db        = require('./db');
const authRoutes = require('./routes/auth');

const app = express();

// Confia no primeiro proxy (nginx) para ler o IP real via X-Forwarded-For.
// Sem isso, todos os clientes aparecem como 127.0.0.1 e compartilham o rate limit.
app.set('trust proxy', 1);

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
  origin: [
    'https://wnrtecnologia.com.br',
    'http://localhost:3001',
    'http://localhost:8080',
    'http://127.0.0.1:3001',
  ],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

const apiPaths = pathName => [`/api${pathName}`, `/wnrinvestai/api${pathName}`];

function _isPlaceholder(value) {
  return !value || /x{8,}|sua_chave|placeholder|apiXX/i.test(value);
}

function _devAiResponse(message = '', system = '') {
  if (/ACELERAR_META/i.test(message)) {
    return [
      'Quer tentar chegar mais rápido nessa meta? Existem dois caminhos principais: encurtar o prazo aumentando aporte mensal, ou manter o prazo e buscar uma combinação mais eficiente entre liquidez, risco e rentabilidade esperada. Abaixo vai um plano educacional para estudar, não uma recomendação de compra.',
      '',
      '**3 caminhos para acelerar**',
      '',
      '1. Conservador: manter a maior parte em Tesouro Selic, CDB liquidez diária ou LCI/LCA de curto prazo e aumentar o aporte mensal de forma gradual. É o caminho mais previsível.',
      '2. Equilibrado: separar uma reserva de liquidez e direcionar parte para IPCA+ de prazo compatível, fundos de renda fixa crédito privado ou CDBs com prêmio sobre CDI. Exige atenção a liquidez, emissor e IR.',
      '3. Acelerado: aceitar mais volatilidade em uma fatia pequena com ETFs, FIIs ou ações/cripto de alta qualidade. Só faz sentido se o prazo e o emocional suportarem oscilações.',
      '',
      '**Opções para estudar por horizonte**',
      '',
      '1 ano: Tesouro Selic, CDB liquidez diária, fundos DI de baixo custo, LCI/LCA curta. Prioridade: não perder o prazo.',
      '2 anos: CDBs 100%-120% CDI, LCI/LCA, Tesouro Selic e uma pequena diversificação em crédito privado de baixo risco.',
      '3 anos: IPCA+ curto/intermediário, CDB/LCI/LCA com vencimento alinhado, FIIs de papel de qualidade em parcela controlada.',
      '4 anos: combinação de IPCA+, crédito privado, FIIs diversificados e ETFs amplos, mantendo liquidez para imprevistos.',
      '5 anos: carteira mais diversificada com renda fixa IPCA/CDI, ETFs globais, FIIs e uma pequena exposição a cripto apenas se fizer sentido para seu perfil.',
      '',
      '**Cuidados essenciais**',
      '',
      'Valide liquidez, taxa líquida após IR, risco do emissor, garantia, prazo de vencimento e concentração. Para metas importantes, evite depender de ativos muito voláteis para dinheiro que será usado perto do prazo.',
      '',
      '**Próximos 7 dias**',
      '',
      '1. Confirmar quanto falta e qual aporte mensal real cabe no orçamento.',
      '2. Separar o dinheiro da meta da reserva de emergência.',
      '3. Comparar 3 alternativas líquidas e 3 alternativas com prazo compatível.',
      '4. Rebalancear a meta mensalmente e revisar se o prazo ainda é realista.'
    ].join('\n');
  }

  const wantsJson = /somente com json|json valido|json válido/i.test(`${message}\n${system}`);
  if (wantsJson) {
    return JSON.stringify({
      analise: 'Plano educacional gerado localmente para desenvolvimento. A estrategia prioriza diversificacao, liquidez e coerencia entre prazo, perfil e capacidade de aporte. Antes de investir, valide produtos, taxas, tributacao e adequacao com um assessor financeiro certificado.',
      alocacao: [
        { classe: 'Reserva e liquidez', produto: 'Tesouro Selic ou CDB liquidez diaria', percentual: 25, justificativa: 'Mantem seguranca e acesso rapido ao capital.' },
        { classe: 'Renda fixa inflacao', produto: 'Tesouro IPCA+ com vencimento compativel', percentual: 25, justificativa: 'Protege poder de compra no longo prazo.' },
        { classe: 'Renda fixa CDI', produto: 'CDB/LCI/LCA de bancos solidos', percentual: 20, justificativa: 'Equilibra previsibilidade e retorno pos-fixado.' },
        { classe: 'Fundos imobiliarios', produto: 'FIIs diversificados como KNRI11/HGLG11', percentual: 15, justificativa: 'Adiciona renda recorrente e diversificacao.' },
        { classe: 'ETFs e acoes', produto: 'BOVA11, IVVB11 e acoes de qualidade', percentual: 15, justificativa: 'Busca crescimento com risco controlado.' }
      ],
      projecao: {
        conservadora: 'R$ 410.000',
        realista: 'R$ 520.000',
        otimista: 'R$ 650.000'
      },
      proximos_passos: '1. Definir reserva de emergencia antes de elevar risco.\n2. Aportar mensalmente com rebalanceamento trimestral.\n3. Comparar taxas, liquidez e tributacao antes de contratar produtos.'
    });
  }

  return [
    'Analise local de desenvolvimento:',
    '',
    'Com os dados informados, a leitura inicial e priorizar diversificacao, controle de risco e consistencia nos aportes. Use esta resposta como apoio educacional, nao como recomendacao de compra ou venda.',
    '',
    'Proximos passos praticos: revise sua reserva de emergencia, compare rentabilidade liquida contra CDI/IPCA, evite concentracao excessiva e rebalanceie a carteira periodicamente.',
    '',
    'Consulte um assessor financeiro certificado antes de tomar qualquer decisao de investimento.'
  ].join('\n');
}

// ── Auth routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
// O frontend vive sob /wnrinvestai e chama este prefixo. Em producao o nginx
// tambem reescreve, mas manter o alias aqui preserva o dev local.
app.use('/wnrinvestai/api/auth', authRoutes);

// Limpeza periódica de sessões expiradas (a cada 6h)
setInterval(() => db.deleteExpiredSessions(), 6 * 60 * 60 * 1000);

// ── GET /api/health ───────────────────────────────────────────
app.get(apiPaths('/health'), (req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), uptime: Math.round(process.uptime()) });
});

// ── GET /api/plan ─────────────────────────────────────────────
app.get(apiPaths('/plan'), (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email || !EMAIL_RE.test(email)) return res.json({ plan: 'free' });
  const row = db.getPlan(email);
  if (!row) return res.json({ plan: 'free' });
  if (row.plan_exp && Date.now() > row.plan_exp) return res.json({ plan: 'free' });
  res.json({ plan: row.plan, planExp: row.plan_exp });
});

// ── POST /api/checkout ────────────────────────────────────────
app.post(apiPaths('/checkout'), checkoutLimiter, async (req, res) => {
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
          success: 'https://wnrtecnologia.com.br/wnrinvestai/app',
          failure: 'https://wnrtecnologia.com.br/wnrinvestai#planos',
          pending: 'https://wnrtecnologia.com.br/wnrinvestai/app',
        },
        auto_return: 'approved',
        notification_url: 'https://wnrtecnologia.com.br/wnrinvestai/api/webhook',
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
app.post(apiPaths('/webhook'), async (req, res) => {
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
app.post(apiPaths('/ai'), aiLimiter, async (req, res) => {
  const { message, system, maxTokens } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 8000)
    return res.status(400).json({ error: 'Mensagem inválida.' });
  if (_isPlaceholder(process.env.ANTHROPIC_API_KEY))
    return res.json({ text: _devAiResponse(message, system) });

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

app.get(apiPaths('/b3quote'), async (req, res) => {
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
    } catch (e) { log('warn', 'b3quote_brapi_fail', { msg: e.message }); }
  }

  res.json(result);
});

// ── Frontend estático (dev local e fallback) ──────────────────
// Em produção o nginx serve os estáticos antes de chegar aqui.
// Em localhost, o servidor Node serve diretamente.
const FRONTEND = path.join(__dirname, '..', 'investai');
app.get('/',                  (_req, res) => res.redirect('/wnrinvestai'));
app.get('/wnrinvestai',       (_req, res) => res.sendFile(path.join(FRONTEND, 'landing.html')));
app.get('/wnrinvestai/app',   (_req, res) => res.sendFile(path.join(FRONTEND, 'index.html')));
app.get('/wnrinvestai/login', (_req, res) => res.sendFile(path.join(FRONTEND, 'login.html')));
app.use('/wnrinvestai',       express.static(FRONTEND));

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ── Error handler global ──────────────────────────────────────
app.use((err, req, res, _next) => {
  log('error', 'unhandled_error', { msg: err.message, path: req.path });
  res.status(500).json({ error: 'Erro interno. Tente novamente.' });
});

function startServer(port = process.env.PORT || 3001, host = '127.0.0.1') {
  const server = app.listen(port, host, () => {
    const address = server.address();
    log('info', 'server_started', { port: address && address.port ? address.port : Number(port) });
  });
  return server;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, '127.0.0.1', () => {
    log('info', 'server_started', { port: Number(PORT) });
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

module.exports = { app, startServer };
