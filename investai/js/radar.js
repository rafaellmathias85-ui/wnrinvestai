/**
 * radar.js — Indicadores macro com dados em tempo real + auto-refresh de 1h
 */

let _radarTimer = null;

function _macroCards(m) {
  const fmtPct = v => v.toFixed(2).replace('.', ',') + '%';
  const fmtBRL = v => 'R$ ' + v.toFixed(2).replace('.', ',');
  const fmtK   = v => v >= 1000 ? 'US$ ' + Math.round(v / 1000) + 'k' : 'US$ ' + v.toLocaleString('en-US');

  return [
    {
      l: 'SELIC',
      v: fmtPct(m.selic),
      s: 'Meta Copom atual',
      t: m.selic >= 13 ? 'Ciclo de alta' : m.selic >= 10 ? 'Neutro' : 'Ciclo de baixa',
      c: m.selic >= 12 ? 'ia-warn' : 'ia-pos',
    },
    {
      l: 'IPCA 12m',
      v: fmtPct(m.ipca),
      s: m.ipca > 4.5 ? 'Acima da meta 3,5%' : 'Dentro da meta',
      t: m.ipca > 5 ? 'Pressão alta' : m.ipca > 3.5 ? 'Atenção' : 'Controlado',
      c: m.ipca > 4.5 ? 'ia-warn' : 'ia-pos',
    },
    {
      l: 'Dólar',
      v: fmtBRL(m.dolar),
      s: 'Cotação atual',
      t: m.dolar >= 5.5 ? 'Volatilidade' : m.dolar >= 5.0 ? 'Atenção' : 'Estável',
      c: m.dolar >= 5.5 ? 'ia-warn' : 'ia-pos',
    },
    {
      l: 'VIX Global',
      v: m.vix.toFixed(1).replace('.', ','),
      s: m.vix >= 30 ? 'Pânico no mercado' : m.vix >= 20 ? 'Medo elevado' : 'Sentimento neutro',
      t: m.vix >= 30 ? 'Pânico' : m.vix >= 20 ? 'Cautela' : 'Tranquilo',
      c: m.vix >= 20 ? 'ia-warn' : 'ia-pos',
    },
    {
      l: 'Ibovespa',
      v: Math.round(m.ibov).toLocaleString('pt-BR'),
      s: 'Pontos',
      t: m.ibov >= 130000 ? 'Alta recente' : m.ibov >= 100000 ? 'Neutro' : 'Correção',
      c: m.ibov >= 100000 ? 'ia-pos' : 'ia-warn',
    },
    {
      l: 'Bitcoin',
      v: fmtK(m.btc),
      s: 'Dominância ~58%',
      t: m.btc >= 80000 ? 'Ciclo de alta' : m.btc >= 40000 ? 'Consolidação' : 'Correção',
      c: m.btc >= 60000 ? 'ia-pos' : 'ia-warn',
    },
  ];
}

function _fmtUpdated(ts) {
  if (!ts) return 'Atualizando…';
  const d = new Date(ts);
  return 'Atualizado às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function _renderRadarCards(macro) {
  const cards  = _macroCards(macro);
  const panel  = document.getElementById('panel-radar');
  if (!panel) return;

  const gridEl = panel.querySelector('.ia-macro-grid');
  const subEl  = panel.querySelector('.ia-sec-sub');

  if (subEl) subEl.textContent = _fmtUpdated(macro.updatedAt);

  if (gridEl) {
    gridEl.innerHTML = cards.map(m => `
      <div class="ia-macro-card">
        <div class="m-label">${m.l}</div>
        <div class="m-val ${m.c}">${m.v}</div>
        <div class="m-sub">${m.s}</div>
        <div class="m-trend ${m.c}">${m.t}</div>
      </div>
    `).join('');
    return;
  }

  // Primeira renderização completa
  let h = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Indicadores macroeconômicos</div>
        <div class="ia-sec-sub">${_fmtUpdated(macro.updatedAt)}</div>
      </div>
    </div>
    <div class="ia-macro-grid">
      ${cards.map(m => `
        <div class="ia-macro-card">
          <div class="m-label">${m.l}</div>
          <div class="m-val ${m.c}">${m.v}</div>
          <div class="m-sub">${m.s}</div>
          <div class="m-trend ${m.c}">${m.t}</div>
        </div>
      `).join('')}
    </div>

    <div class="ia-ai-box">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Interpretação — IA Analista</span></div>
      <div class="ia-ai-bd" id="radar-bd">Selecione uma análise abaixo.</div>
    </div>

    <div class="ia-chips">
      <span class="ia-chip" onclick="radarIA('cenario')">Cenário geral</span>
      <span class="ia-chip" onclick="radarIA('selic')">Impacto da Selic</span>
      <span class="ia-chip" onclick="radarIA('dolar')">Risco cambial</span>
      <span class="ia-chip" onclick="radarIA('btc')">Ciclo Bitcoin</span>
      <span class="ia-chip" onclick="radarIA('ibov')">Perspectiva Ibovespa</span>
    </div>
  `;
  panel.innerHTML = h;
}

async function renderRadar() {
  // Renderiza imediatamente com dados em memória (ou fallback)
  _renderRadarCards(RealTime.macro);

  // Busca dados atualizados
  await RealTime.fetchMacro();
  _renderRadarCards(RealTime.macro);

  // Auto-refresh a cada 1 hora
  if (!_radarTimer) {
    _radarTimer = setInterval(async () => {
      await RealTime.fetchMacro(true);
      _renderRadarCards(RealTime.macro);
    }, 60 * 60 * 1000);
  }
}

async function radarIA(tipo) {
  const bd = document.getElementById('radar-bd');
  bd.innerHTML = dots();

  const m  = RealTime.macro;
  const pf = App.filtered().map(i => `${i.tipo} ${i.nome} ${fmtR(i.saldo)}`).join(', ') || 'portfólio vazio';

  const fmtS = v => v.toFixed(2).replace('.', ',');

  const prompts = {
    cenario: `Selic ${fmtS(m.selic)}%, IPCA 12m ${fmtS(m.ipca)}%, dólar R$${fmtS(m.dolar)}, VIX ${m.vix.toFixed(1)}, Ibovespa ${Math.round(m.ibov).toLocaleString('pt-BR')}, Bitcoin US$${Math.round(m.btc).toLocaleString('en-US')}. Portfólio: ${pf}. Leitura completa e impacto em cada ativo. 4 parágrafos.`,
    selic:   `Selic ${fmtS(m.selic)}%, CDI ${fmtS(m.cdi)}%, ciclo de alta Copom. Portfólio: ${pf}. Impacto por tipo de ativo e o que fazer agora.`,
    dolar:   `Dólar R$${fmtS(m.dolar)} com volatilidade. Portfólio: ${pf}. Exposição cambial e estratégias de proteção.`,
    btc:     `Bitcoin US$${Math.round(m.btc).toLocaleString('en-US')}, ciclo ${m.btc >= 80000 ? 'de alta' : 'de consolidação'}. Portfólio: ${pf}. Fase do ciclo e perspectiva 6-12 meses.`,
    ibov:    `Ibovespa ${Math.round(m.ibov).toLocaleString('pt-BR')} pontos. Portfólio: ${pf}. Setores com potencial e quais evitar agora.`,
  };

  const sys = 'Analista macroeconômico sênior brasileiro. Português, direto, dados concretos. Máximo 4 parágrafos.';

  try {
    const res = await API.ask(prompts[tipo], sys);
    bd.innerHTML = fmt(res);
  } catch {
    bd.innerHTML = 'Erro de conexão. Tente novamente.';
  }
}
