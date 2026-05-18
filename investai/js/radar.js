/**
 * radar.js
 * --------
 * Renders the Radar Macro panel and triggers AI analysis.
 */

const MACRO_DATA = [
  { l: 'Selic',      v: '14,50%',    s: 'Meta Copom atual',    t: 'Ciclo de alta', c: 'ia-warn' },
  { l: 'IPCA 12m',   v: '5,53%',     s: 'Acima da meta 3,5%',  t: 'Pressão alta',  c: 'ia-warn' },
  { l: 'Dólar',      v: 'R$ 5,70',   s: 'Nível de atenção',    t: 'Volatilidade',  c: 'ia-warn' },
  { l: 'VIX Global', v: '22,1',      s: 'Medo elevado',        t: 'Cautela',       c: 'ia-warn' },
  { l: 'Ibovespa',   v: '135.800',   s: 'Pontos',              t: 'Alta recente',  c: 'ia-pos' },
  { l: 'Bitcoin',    v: 'US$ 103k',  s: 'Dominância 58%',      t: 'Ciclo de alta', c: 'ia-pos' },
];

function renderRadar() {
  let h = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Indicadores macroeconômicos</div>
        <div class="ia-sec-sub">Atualizado maio 2026</div>
      </div>
    </div>
    <div class="ia-macro-grid">
  `;

  MACRO_DATA.forEach(m => {
    h += `
      <div class="ia-macro-card">
        <div class="m-label">${m.l}</div>
        <div class="m-val ${m.c}">${m.v}</div>
        <div class="m-sub">${m.s}</div>
        <div class="m-trend ${m.c}">${m.t}</div>
      </div>
    `;
  });

  h += `
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

  document.getElementById('panel-radar').innerHTML = h;
}

async function radarIA(tipo) {
  const bd = document.getElementById('radar-bd');
  bd.innerHTML = dots();

  const portfolio = App.filtered().map(i => `${i.tipo} ${i.nome} ${fmtR(i.saldo)}`).join(', ') || 'portfólio vazio';

  const prompts = {
    cenario: `Selic 14,50%, IPCA 5,53%, dólar R$5,70, VIX 22,1. Portfólio: ${portfolio}. Leitura completa e impacto em cada ativo. 4 parágrafos.`,
    selic:   `Selic 14,50%, ciclo de alta Copom. Portfólio: ${portfolio}. Impacto por tipo de ativo e o que fazer antes.`,
    dolar:   `Dólar R$5,70 em alta volatilidade. Portfólio: ${portfolio}. Exposição cambial e estratégias de proteção.`,
    btc:     `Bitcoin $103.000, dominância 58%, ciclo de alta. Portfólio: ${portfolio}. Fase do ciclo e perspectiva 6-12 meses.`,
    ibov:    `Ibovespa 135.800, em alta recente. Portfólio: ${portfolio}. Setores com potencial e quais evitar.`,
  };

  const sys = 'Analista macroeconômico sênior brasileiro. Português, direto, dados concretos. Máximo 4 parágrafos.';

  try {
    const res = await API.ask(prompts[tipo], sys);
    bd.innerHTML = fmt(res);
  } catch {
    bd.innerHTML = 'Erro de conexão. Tente novamente.';
  }
}
