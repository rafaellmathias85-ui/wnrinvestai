/**
 * alertas.js — Aba de Alertas em Tempo Real
 * Monitoramento de cripto e ações BR com sinais de IA (Comprar / Aguardar / Vender)
 */

// ── Estado ─────────────────────────────────────────────
const AlertasState = {
  STORAGE_KEY: 'investai_alertas_v1',
  crypto:   ['BTC', 'ETH', 'SOL'],
  stocks:   ['PETR4', 'VALE3', 'ITUB4', 'WEGE3'],
  prices:   {},          // preços atuais
  signals:  {},          // { symbol: { sinal, confianca, razao, preco_alvo, stop_loss, ts } }
  alerts:   [],          // alertas de preço configurados
  pollId:   null,
  loadFromStorage() {
    const s = Storage.get(this.STORAGE_KEY) || {};
    this.crypto  = s.crypto  || this.crypto;
    this.stocks  = s.stocks  || this.stocks;
    this.alerts  = s.alerts  || [];
    this.signals = s.signals || {};
  },
  save() {
    Storage.set(this.STORAGE_KEY, {
      crypto:  this.crypto,
      stocks:  this.stocks,
      alerts:  this.alerts,
      signals: this.signals,
    });
  },
};

// ── Render principal ────────────────────────────────────
function renderAlertas() {
  if (typeof planGate === 'function' && planGate('alertas', 'panel-alertas', 'pro')) return;
  AlertasState.loadFromStorage();

  document.getElementById('panel-alertas').innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Alertas &amp; Sinais em Tempo Real</div>
        <div class="ia-sec-sub">Preços ao vivo · sinais de compra/venda por IA · alertas de preço</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span id="al-status" class="al-status-dot" title="Atualizando…"></span>
        <button class="ia-btn-ghost" onclick="alertasRefresh()">Atualizar agora</button>
      </div>
    </div>

    <div style="background:var(--amber-dim);border:1px solid rgba(192,122,43,.3);border-radius:var(--radius-md);padding:10px 14px;font-size:11px;color:var(--amber);margin-bottom:16px;line-height:1.7">
      ⚠ Os sinais da IA são análises técnicas automatizadas e <strong>não constituem recomendação financeira</strong>. Sempre consulte um assessor antes de operar.
    </div>

    <!-- CRIPTO ─────────────────────────────────────── -->
    <div class="ia-sec-hd" style="margin-top:4px">
      <div class="ia-sec-title" style="font-size:14px">Criptomoedas</div>
      <button class="ia-btn-ghost" style="font-size:10px" onclick="addWatchItem('crypto')">+ Adicionar</button>
    </div>
    <div id="crypto-grid" class="al-grid"></div>

    <!-- AÇÕES ──────────────────────────────────────── -->
    <div class="ia-sec-hd" style="margin-top:8px">
      <div class="ia-sec-title" style="font-size:14px">Ações Brasileiras (B3)</div>
      <button class="ia-btn-ghost" style="font-size:10px" onclick="addWatchItem('stocks')">+ Adicionar</button>
    </div>
    <div id="stocks-grid" class="al-grid"></div>

    <!-- ANÁLISE GERAL DA IA ─────────────────────────── -->
    <div class="ia-sec-hd" style="margin-top:8px">
      <div class="ia-sec-title" style="font-size:14px">Visão Geral do Mercado</div>
      <button class="ia-btn-gold" onclick="analiseMercadoIA()">Analisar tudo com IA</button>
    </div>
    <div class="ia-ai-box">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Análise integrada de mercado</span></div>
      <div class="ia-ai-bd" id="al-overview">Clique em "Analisar tudo com IA" para uma visão completa do cenário atual.</div>
    </div>

    <!-- ALERTAS DE PREÇO ────────────────────────────── -->
    <div class="ia-sec-hd" style="margin-top:8px">
      <div class="ia-sec-title" style="font-size:14px">Alertas de Preço Configurados</div>
      <button class="ia-btn-ghost" style="font-size:10px" onclick="addPriceAlert()">+ Novo alerta</button>
    </div>
    <div id="al-price-alerts"></div>
  `;

  _renderPriceAlerts();
  alertasRefresh();

  // Polling a cada 90 segundos
  if (AlertasState.pollId) clearInterval(AlertasState.pollId);
  AlertasState.pollId = setInterval(alertasRefresh, 90000);
}

// ── Refresh de preços ───────────────────────────────────
async function alertasRefresh() {
  const dot = document.getElementById('al-status');
  if (dot) dot.classList.add('syncing');

  RealTime.clearCache();

  await Promise.allSettled([
    _refreshCrypto(),
    _refreshStocks(),
  ]);

  _checkPriceAlerts();
  AlertasState.save();
  if (dot) dot.classList.remove('syncing');
}

async function _refreshCrypto() {
  try {
    const data = await RealTime.fetchCrypto(AlertasState.crypto);
    Object.assign(AlertasState.prices, data);
    _renderCryptoGrid(data);
  } catch(e) {
    const g = document.getElementById('crypto-grid');
    if (g) g.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px;padding:8px">Dados cripto indisponíveis: ${e.message}</div>`;
  }
}

async function _refreshStocks() {
  try {
    const data = await RealTime.fetchStocks(AlertasState.stocks);
    Object.assign(AlertasState.prices, data);
    _renderStocksGrid(data);
  } catch(e) {
    const g = document.getElementById('stocks-grid');
    if (g) g.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px;padding:8px">Dados B3 indisponíveis: ${e.message}</div>`;
  }
}

// ── Render de card de ativo ─────────────────────────────
function _renderCryptoGrid(data) {
  const grid = document.getElementById('crypto-grid');
  if (!grid) return;
  grid.innerHTML = AlertasState.crypto.map(sym => {
    const d = data[sym];
    if (!d) return `<div class="al-card al-card-err">${sym}<br><small>Não encontrado</small></div>`;
    const sig = AlertasState.signals[sym];
    return _assetCard({
      symbol:   sym,
      name:     sym,
      price:    `R$ ${_fmtPrice(d.priceBRL)}`,
      priceUSD: `US$ ${_fmtPrice(d.priceUSD)}`,
      change:   d.change24h,
      signal:   sig,
      type:     'crypto',
    });
  }).join('');
}

function _renderStocksGrid(data) {
  const grid = document.getElementById('stocks-grid');
  if (!grid) return;
  grid.innerHTML = AlertasState.stocks.map(sym => {
    const d = data[sym];
    if (!d) return `<div class="al-card al-card-err">${sym}<br><small>Não encontrado</small></div>`;
    const sig = AlertasState.signals[sym];
    return _assetCard({
      symbol:  sym,
      name:    d.name,
      price:   `R$ ${_fmtPrice(d.price)}`,
      change:  d.change24h,
      signal:  sig,
      type:    'stock',
    });
  }).join('');
}

function _assetCard({ symbol, name, price, priceUSD, change, signal, type }) {
  const chg     = (change || 0).toFixed(2);
  const chgCls  = change >= 0 ? 'ia-pos' : 'ia-neg';
  const chgSign = change >= 0 ? '+' : '';

  const sigHtml = signal
    ? `<div class="al-signal al-sig-${signal.sinal.toLowerCase()}">${signal.sinal}</div>
       <div class="al-sig-conf">Confiança: ${signal.confianca}</div>`
    : `<button class="ia-btn-ghost" style="font-size:10px;padding:4px 10px;margin-top:4px" onclick="getSignal('${symbol}','${type}')">Pedir sinal IA</button>`;

  const removeBtn = `<button class="al-remove" onclick="removeWatch('${symbol}','${type}')" title="Remover">✕</button>`;

  const ts = signal ? `<div class="al-sig-ts">${_timeAgo(signal.ts)}</div>` : '';
  const sub = priceUSD ? `<div style="font-size:10px;color:var(--text-tertiary)">${priceUSD}</div>` : '';

  return `
    <div class="al-card" id="card-${symbol}">
      ${removeBtn}
      <div class="al-card-symbol">${symbol}</div>
      <div class="al-card-name">${name}</div>
      <div class="al-card-price">${price}</div>
      ${sub}
      <div class="al-card-chg ${chgCls}">${chgSign}${chg}% 24h</div>
      <div class="al-card-sig">
        ${sigHtml}
        ${ts}
        ${signal ? `<button class="ia-btn-ghost" style="font-size:10px;padding:3px 8px;margin-top:6px" onclick="getSignal('${symbol}','${type}')">Atualizar sinal</button>` : ''}
      </div>
      ${signal && signal.razao ? `<div class="al-razao">${signal.razao}</div>` : ''}
      ${signal && signal.preco_alvo ? `<div class="al-targets"><span class="al-target-buy">Alvo: ${signal.preco_alvo}</span><span class="al-target-stop">Stop: ${signal.stop_loss || '—'}</span></div>` : ''}
    </div>`;
}

// ── Sinal de IA por ativo ───────────────────────────────
async function getSignal(symbol, type) {
  const card = document.getElementById('card-' + symbol);
  if (!card) return;
  const sigDiv = card.querySelector('.al-card-sig');
  sigDiv.innerHTML = `<div style="font-size:11px;color:var(--text-tertiary)">${dots()} Analisando…</div>`;

  const d    = AlertasState.prices[symbol];
  const port = App.portfolio.map(i => `${i.tipo} ${i.nome}`).join(', ') || 'sem posição';
  const user = Auth.currentUser();
  const perfil = user?.profile?.perfil || App.currentMode === 'cons' ? 'Conservador' : 'Moderado';

  const isStock  = type === 'stock';
  const priceStr = isStock ? `R$ ${_fmtPrice(d?.price)}` : `R$ ${_fmtPrice(d?.priceBRL)} / US$ ${_fmtPrice(d?.priceUSD)}`;
  const chgStr   = (d?.change24h || 0).toFixed(2) + '%';

  const prompt = `
Ativo: ${symbol}${isStock ? ' (B3)' : ' (cripto)'}
Preço atual: ${priceStr}
Variação 24h: ${chgStr}
${!isStock ? `Volume 24h: R$ ${_fmtPrice(d?.vol24h)}` : ''}
Cenário macro: Selic ${RealTime.macro.selic}% a.a., IPCA ${RealTime.macro.ipca}%, dólar R$ ${RealTime.macro.dolar}, VIX ${RealTime.macro.vix}
Portfólio do usuário: ${port}
Perfil de risco: ${perfil}

Avalie tendência técnica e fundamentos. Forneça sinal de trading.
Responda SOMENTE com JSON válido:
{"sinal":"COMPRAR"|"AGUARDAR"|"VENDER","confianca":"Alta"|"Média"|"Baixa","preco_alvo":"valor ou null","stop_loss":"valor ou null","razao":"1-2 frases diretas e objetivas."}`;

  const system = `Analista técnico e fundamentalista sênior, especialista em mercado brasileiro e cripto.
Responde em português, de forma direta e prática. JSON apenas, sem texto fora do JSON.`;

  try {
    const raw  = await API.ask(prompt, system, 400);
    const json = raw.trim().replace(/^```json?\s*/i,'').replace(/```\s*$/,'').trim();
    const sig  = JSON.parse(json);
    sig.ts     = Date.now();
    AlertasState.signals[symbol] = sig;
    AlertasState.save();

    // Re-render apenas o card
    const d2   = AlertasState.prices[symbol];
    const html = type === 'crypto'
      ? _assetCard({ symbol, name: symbol, price: `R$ ${_fmtPrice(d2?.priceBRL)}`, priceUSD: `US$ ${_fmtPrice(d2?.priceUSD)}`, change: d2?.change24h, signal: sig, type })
      : _assetCard({ symbol, name: d2?.name || symbol, price: `R$ ${_fmtPrice(d2?.price)}`, change: d2?.change24h, signal: sig, type });

    card.outerHTML = html;

    // Toast
    const emoji = sig.sinal === 'COMPRAR' ? '🟢' : sig.sinal === 'VENDER' ? '🔴' : '🟡';
    showToast(`${emoji} ${symbol}: ${sig.sinal} — ${sig.confianca} confiança`);
  } catch(e) {
    if (sigDiv) sigDiv.innerHTML = `<span style="color:var(--red);font-size:11px">Erro: ${e.message}</span>`;
  }
}

// ── Análise geral do mercado ────────────────────────────
async function analiseMercadoIA() {
  const bd = document.getElementById('al-overview');
  if (!bd) return;
  bd.innerHTML = dots();

  const cryptoPrices = AlertasState.crypto.map(s => {
    const d = AlertasState.prices[s];
    return d ? `${s}: R$${_fmtPrice(d.priceBRL)} (${(d.change24h||0).toFixed(1)}% 24h)` : s + ': sem dado';
  }).join(' | ');

  const stockPrices = AlertasState.stocks.map(s => {
    const d = AlertasState.prices[s];
    return d ? `${s}: R$${_fmtPrice(d.price)} (${(d.change24h||0).toFixed(1)}% 24h)` : s + ': sem dado';
  }).join(' | ');

  const sinaisAtivos = Object.entries(AlertasState.signals)
    .map(([s, v]) => `${s}:${v.sinal}(${v.confianca})`).join(', ') || 'nenhum ainda';

  const prompt = `
Faça uma análise completa do mercado com base nos dados atuais:

CRIPTO: ${cryptoPrices}
AÇÕES BR: ${stockPrices}
SINAIS IA ATIVOS: ${sinaisAtivos}
MACRO: Selic ${RealTime.macro.selic}%, IPCA ${RealTime.macro.ipca}%, Dólar R$${RealTime.macro.dolar}, VIX ${RealTime.macro.vix}
PORTFÓLIO DO USUÁRIO: ${App.portfolio.map(i=>`${i.tipo} ${i.nome} ${fmtR(i.saldo)}`).join('; ') || 'vazio'}

Responda em 4 parágrafos:
1. Sentimento geral do mercado agora
2. Melhores oportunidades de entrada neste momento
3. Posições com risco elevado para sair ou reduzir
4. Estratégia recomendada para as próximas 48 horas`;

  try {
    const r = await API.ask(prompt, 'Gestor de carteiras sênior, especialista em Brasil e cripto. Português direto, acionável.', 900);
    bd.innerHTML = fmt(r);
  } catch(e) { bd.innerHTML = `<span style="color:var(--red)">Erro: ${e.message}</span>`; }
}

// ── Adicionar ativo à watchlist ─────────────────────────
function addWatchItem(type) {
  const label = type === 'crypto' ? 'símbolo cripto (ex: DOGE, ADA, BNB)' : 'ticker B3 (ex: BBAS3, MGLU3, RENT3)';
  const val   = prompt(`Digite o ${label}:`);
  if (!val) return;
  const sym = val.toUpperCase().trim();

  if (type === 'crypto' && !AlertasState.crypto.includes(sym)) {
    AlertasState.crypto.push(sym);
  } else if (type === 'stocks' && !AlertasState.stocks.includes(sym)) {
    AlertasState.stocks.push(sym);
  }
  AlertasState.save();
  alertasRefresh();
}

function removeWatch(symbol, type) {
  if (type === 'crypto') AlertasState.crypto = AlertasState.crypto.filter(s => s !== symbol);
  else AlertasState.stocks = AlertasState.stocks.filter(s => s !== symbol);
  delete AlertasState.signals[symbol];
  AlertasState.save();
  renderAlertas();
}

// ── Alertas de preço ────────────────────────────────────
function addPriceAlert() {
  const sym  = prompt('Símbolo (ex: BTC, PETR4):');
  if (!sym) return;
  const dir  = confirm('Alertar quando o preço SUBIR acima de um valor? (OK = sim, Cancelar = quando cair abaixo)');
  const val  = parseFloat(prompt(`Valor de referência (R$):`));
  if (isNaN(val)) return;

  AlertasState.alerts.push({
    id:        Date.now(),
    symbol:    sym.toUpperCase(),
    direction: dir ? 'acima' : 'abaixo',
    value:     val,
    triggered: false,
    createdAt: new Date().toLocaleString('pt-BR'),
  });
  AlertasState.save();
  _renderPriceAlerts();
}

function _renderPriceAlerts() {
  const el = document.getElementById('al-price-alerts');
  if (!el) return;
  if (!AlertasState.alerts.length) {
    el.innerHTML = `<div style="color:var(--text-tertiary);font-size:12px;padding:8px 0">Nenhum alerta configurado. Clique em "+ Novo alerta" para criar.</div>`;
    return;
  }
  el.innerHTML = AlertasState.alerts.map(a => `
    <div class="al-alert-row ${a.triggered ? 'al-alert-done' : ''}">
      <span class="ia-badge ${a.triggered ? 'ia-b-green' : 'ia-b-amber'}">${a.triggered ? 'Disparado' : 'Ativo'}</span>
      <span style="font-weight:500">${a.symbol}</span>
      <span style="color:var(--text-tertiary)">Alertar quando preço ficar ${a.direction} de</span>
      <span style="font-family:var(--font-mono);color:var(--gold)">R$ ${_fmtPrice(a.value)}</span>
      <span style="color:var(--text-tertiary);font-size:10px;margin-left:auto">Criado ${a.createdAt}</span>
      <button class="al-remove" onclick="removePriceAlert(${a.id})">✕</button>
    </div>`).join('');
}

function removePriceAlert(id) {
  AlertasState.alerts = AlertasState.alerts.filter(a => a.id !== id);
  AlertasState.save();
  _renderPriceAlerts();
}

function _checkPriceAlerts() {
  let triggered = false;
  AlertasState.alerts.forEach(a => {
    if (a.triggered) return;
    const d = AlertasState.prices[a.symbol];
    const price = d?.priceBRL || d?.price;
    if (!price) return;
    if (a.direction === 'acima'  && price >= a.value) { a.triggered = true; triggered = true; showToast(`🔔 ${a.symbol} está acima de R$ ${_fmtPrice(a.value)}! Preço atual: R$ ${_fmtPrice(price)}`); }
    if (a.direction === 'abaixo' && price <= a.value) { a.triggered = true; triggered = true; showToast(`🔔 ${a.symbol} está abaixo de R$ ${_fmtPrice(a.value)}! Preço atual: R$ ${_fmtPrice(price)}`); }
  });
  if (triggered) _renderPriceAlerts();
}

// ── Toast notification ──────────────────────────────────
function showToast(msg) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:340px';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'ia-toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('ia-toast-hide'); setTimeout(() => toast.remove(), 400); }, 5000);
}

// ── Helpers ─────────────────────────────────────────────
function _fmtPrice(v) {
  if (!v && v !== 0) return '—';
  if (v >= 1000) return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1)    return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

function _timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60)   return `há ${sec}s`;
  if (sec < 3600) return `há ${Math.floor(sec/60)}min`;
  return `há ${Math.floor(sec/3600)}h`;
}
