/**
 * oportunidades.js  ·  calendario.js  ·  simulador.js  ·  diario.js
 * ------------------------------------------------------------------
 * All remaining panel modules in one file for convenience.
 * Split into separate files if the project grows.
 */

// ═══════════════════════════════════════════════════════
//  OPORTUNIDADES
// ═══════════════════════════════════════════════════════

// Portfolio summary stored at module level — avoids embedding user data in onclick attributes
let _oResumo = '';

function renderOport() {
  _oResumo = App.filtered().map(i => `${i.tipo} ${i.nome} ${fmtR(i.saldo)} ${i.rendimento}%`).join('; ') || 'portfólio vazio';

  document.getElementById('panel-oport').innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Oportunidades identificadas</div>
        <div class="ia-sec-sub">Baseado no portfólio e cenário maio 2026</div>
      </div>
    </div>

    <div class="ia-ai-box">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Análise em tempo real</span></div>
      <div class="ia-ai-bd" id="oport-bd">Selecione uma análise ou faça uma pergunta.</div>
    </div>

    <div class="ia-chips">
      <span class="ia-chip" onclick="oportunidadeIA('geral')">Análise geral</span>
      <span class="ia-chip" onclick="oportunidadeIA('momento')">Melhor momento</span>
      <span class="ia-chip" onclick="oportunidadeIA('diversif')">Diversificação</span>
      <span class="ia-chip" onclick="oportunidadeIA('saida')">Ativos para sair</span>
      <span class="ia-chip" onclick="oportunidadeIA('hedge')">Proteção / Hedge</span>
    </div>

    <div class="ia-divider"></div>

    <div class="ia-sec-hd"><div class="ia-sec-title">Consultar a IA</div></div>
    <textarea class="ia-ai-input" id="oport-input" rows="2"
      placeholder="Ex: Vale aportar em Tesouro IPCA+ agora ou aguardar o Copom?"></textarea>
    <div style="display:flex;justify-content:flex-end;margin-top:8px;margin-bottom:14px">
      <button class="ia-btn-gold" id="oport-send" onclick="oportunidadeCustom()">Consultar</button>
    </div>
    <div id="oport-custom" style="font-size:13px;line-height:1.8;color:#8A8F9A"></div>
  `;
}

async function oportunidadeIA(tipo) {
  const bd = document.getElementById('oport-bd');
  bd.innerHTML = dots();

  const prompts = {
    geral:   `Portfólio: ${_oResumo}. Selic 14,50%, IPCA 5,53%, dólar R$5,70. 3 oportunidades principais agora.`,
    momento: `Portfólio: ${_oResumo}. Timing ideal para próximo aporte. Produto específico e justificativa.`,
    diversif:`Portfólio: ${_oResumo}. Classes ausentes. 2-3 produtos com percentual de alocação.`,
    saida:   `Portfólio: ${_oResumo}. Ativos com risco de desvalorização nos próximos 6 meses.`,
    hedge:   `Portfólio: ${_oResumo}. Estratégias de proteção cambial, inflacionária e de mercado.`,
  };

  try {
    const r = await API.ask(prompts[tipo], 'Estrategista sênior. Português, específico, acionável. Máximo 4 parágrafos.');
    bd.innerHTML = fmt(r);
  } catch { bd.innerHTML = 'Erro de conexão.'; }
}

async function oportunidadeCustom() {
  const inp  = document.getElementById('oport-input');
  const btn  = document.getElementById('oport-send');
  const chat = document.getElementById('oport-custom');
  const msg  = inp.value.trim();
  if (!msg) return;

  inp.value = ''; btn.disabled = true;
  chat.innerHTML = dots();

  try {
    const r = await API.ask(msg, `Consultor financeiro. Portfólio: ${_oResumo}. Selic 14,50%. Português, máximo 4 parágrafos.`);
    chat.innerHTML = fmt(r);
  } catch { chat.innerHTML = 'Erro de conexão.'; }

  btn.disabled = false;
}


// ═══════════════════════════════════════════════════════
//  CALENDÁRIO
// ═══════════════════════════════════════════════════════

const EVENTOS = [
  { d:'20 mai 2026', t:'Reunião Copom',           desc:'Expectativa de manutenção em 14,50%. Comunicado sinaliza teto do ciclo.',    b:'ia-b-amber', imp:'Renda Fixa' },
  { d:'09 jun 2026', t:'IPCA — Maio',             desc:'Projeção 0,38%. Acima de 0,50% pode reacender debate de alta adicional.',    b:'ia-b-amber', imp:'IPCA+' },
  { d:'17 jun 2026', t:'FOMC — Fed EUA',          desc:'Sinal hawkish fortalece dólar e pressiona emergentes.',                      b:'ia-b-red',   imp:'Câmbio / BTC' },
  { d:'14 jul 2026', t:'Resultado Petrobras 2T26', desc:'Expectativa de dividendos. Resultado abaixo pressiona PETR4.',               b:'ia-b-blue',  imp:'Ações' },
  { d:'05 ago 2026', t:'Copom — Janela de corte', desc:'Possível início de ciclo de queda se IPCA ceder abaixo de 5%.',              b:'ia-b-green', imp:'Ações / Prefixado' },
  { d:'11 ago 2026', t:'IPCA — Julho',            desc:'Dado crítico para confirmar tendência de desinflação.',                      b:'ia-b-amber', imp:'Todos' },
];

function renderCalendario() {
  let h = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Calendário de risco</div>
        <div class="ia-sec-sub">Próximos 3 meses</div>
      </div>
    </div>
    <div class="ia-cal-list">
  `;

  EVENTOS.forEach(e => {
    h += `
      <div class="ia-cal-item">
        <div class="ia-cal-date">${e.d}<br><span class="ia-badge ${e.b}" style="margin-top:5px">${e.imp}</span></div>
        <div><div class="ia-cal-title">${e.t}</div><div class="ia-cal-desc">${e.desc}</div></div>
      </div>
    `;
  });

  h += `
    </div>
    <div class="ia-ai-box">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Como se posicionar antes de cada evento</span></div>
      <div class="ia-ai-bd" id="cal-bd">Selecione um evento.</div>
    </div>
    <div class="ia-chips">
      <span class="ia-chip" onclick="calIA('copom')">Antes do Copom</span>
      <span class="ia-chip" onclick="calIA('ipca')">Antes do IPCA</span>
      <span class="ia-chip" onclick="calIA('fomc')">Antes do FOMC</span>
      <span class="ia-chip" onclick="calIA('resultados')">Antes de resultados</span>
    </div>
  `;

  document.getElementById('panel-calendario').innerHTML = h;
}

async function calIA(tipo) {
  const bd = document.getElementById('cal-bd');
  bd.innerHTML = dots();

  const port = App.filtered().map(i => `${i.tipo} ${i.nome}`).join(', ') || 'vazio';

  const prompts = {
    copom:      `Copom 20 mai 2026, Selic 14,50%. Portfólio: ${port}. O que fazer antes? Prático.`,
    ipca:       `IPCA maio sai 9 jun 2026, projeção 0,38%. Portfólio: ${port}. Impacto e ação.`,
    fomc:       `FOMC 17 jun 2026. Portfólio: ${port}. Impacto em dólar, BTC e ações. O que proteger.`,
    resultados: `Resultados 2T26 julho. Portfólio: ${port}. Setores com potencial de surpresa.`,
  };

  try {
    const res = await API.ask(prompts[tipo], 'Estrategista de mercado. Prático. Português. Máximo 4 parágrafos.');
    bd.innerHTML = fmt(res);
  } catch { bd.innerHTML = 'Erro de conexão.'; }
}


// ═══════════════════════════════════════════════════════
//  SIMULADOR
// ═══════════════════════════════════════════════════════

function renderSimulador() {
  if (typeof planGate === 'function' && planGate('simulador', 'panel-simulador', 'pro')) return;
  const base = App.filtered().reduce((s, i) => s + i.saldo, 0) || 100000;

  document.getElementById('panel-simulador').innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Simulador de cenários</div>
        <div class="ia-sec-sub">Impacto no patrimônio por variação de indicadores</div>
      </div>
    </div>

    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:16px;font-size:12px;color:var(--text-secondary);line-height:1.8">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin-bottom:8px">Como funciona</div>
      <p>Os sliders representam <strong style="color:var(--text-primary)">variações em relação ao nível atual</strong> de cada indicador (Selic base: 14,50%). O impacto estimado é calculado pela sensibilidade típica de cada classe:</p>
      <ul style="margin:8px 0 0 16px;list-style:disc">
        <li><strong style="color:var(--text-primary)">Variação Selic:</strong> alta pressiona preço de títulos pré-fixados e FIIs; CDI/pós-fixados ganham.</li>
        <li><strong style="color:var(--text-primary)">Dólar:</strong> impacta Ouro e ativos dolarizados — dólar mais alto valoriza essas posições.</li>
        <li><strong style="color:var(--text-primary)">Bitcoin:</strong> impacta diretamente posições em cripto.</li>
        <li><strong style="color:var(--text-primary)">Ibovespa:</strong> afeta ações e FIIs.</li>
      </ul>
      <p style="margin-top:8px">Ajuste os sliders para o cenário desejado e clique em <strong style="color:var(--text-primary)">Analisar cenário</strong> para a IA detalhar impactos e sugerir ações preventivas.</p>
    </div>

    <div class="ia-sim-block">
      <div class="ia-sim-row"><span class="ia-sim-label">Variação Selic</span><input type="range" id="s-selic" min="-3" max="3" step="0.25" value="0" oninput="simUpdate()"><span class="ia-sim-val" id="sv-selic">0%</span></div>
      <div class="ia-sim-row"><span class="ia-sim-label">Dólar (R$)</span><input type="range" id="s-dolar" min="4.5" max="7.5" step="0.1" value="5.70" oninput="simUpdate()"><span class="ia-sim-val" id="sv-dolar">R$ 5,70</span></div>
      <div class="ia-sim-row"><span class="ia-sim-label">Bitcoin</span><input type="range" id="s-btc" min="-60" max="100" step="5" value="0" oninput="simUpdate()"><span class="ia-sim-val" id="sv-btc">0%</span></div>
      <div class="ia-sim-row"><span class="ia-sim-label">Ibovespa</span><input type="range" id="s-ibov" min="-40" max="40" step="2" value="0" oninput="simUpdate()"><span class="ia-sim-val" id="sv-ibov">0%</span></div>
    </div>

    <div class="ia-metrics" id="sim-metrics" style="margin-bottom:16px">
      <div class="ia-mc"><div class="ia-ml">Saldo atual</div><div class="ia-mv">${fmtR(base)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Impacto estimado</div><div class="ia-mv" id="sim-imp">R$ 0</div></div>
      <div class="ia-mc"><div class="ia-ml">Saldo projetado</div><div class="ia-mv" id="sim-proj">${fmtR(base)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Variação</div><div class="ia-mv" id="sim-var">0,0%</div></div>
    </div>

    <div class="ia-ai-box">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Análise do cenário</span></div>
      <div class="ia-ai-bd" id="sim-bd">Ajuste os indicadores e clique em analisar.</div>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button class="ia-btn-gold" onclick="simIA()">Analisar cenário</button>
    </div>
  `;
}

function simUpdate() {
  const sel  = parseFloat(document.getElementById('s-selic').value);
  const dol  = parseFloat(document.getElementById('s-dolar').value);
  const btc  = parseFloat(document.getElementById('s-btc').value);
  const ibov = parseFloat(document.getElementById('s-ibov').value);

  document.getElementById('sv-selic').textContent = (sel >= 0 ? '+' : '') + sel + '%';
  document.getElementById('sv-dolar').textContent = 'R$ ' + dol.toFixed(2).replace('.', ',');
  document.getElementById('sv-btc').textContent   = (btc >= 0 ? '+' : '') + btc + '%';
  document.getElementById('sv-ibov').textContent  = (ibov >= 0 ? '+' : '') + ibov + '%';

  const list = App.filtered();
  const tot  = list.reduce((s, i) => s + i.saldo, 0) || 100000;
  let imp = 0;

  list.forEach(i => {
    if (['CDB', 'Tesouro Direto', 'LCI/LCA'].includes(i.tipo)) imp += i.saldo * (sel * -0.02);
    if (i.tipo === 'Ações')  imp += i.saldo * (ibov / 100 * 0.8);
    if (i.tipo === 'Cripto') imp += i.saldo * (btc  / 100 * 0.9);
    if (i.tipo === 'Ouro')   imp += i.saldo * ((dol - 5.70) / 5.70 * 0.6);
    if (i.tipo === 'FII')    imp += i.saldo * (sel * -0.03 + ibov / 100 * 0.3);
  });

  if (!list.length) imp = (sel * -0.02 + ibov / 100 * 0.4 + btc / 100 * 0.1) * tot / 3;

  const proj = tot + imp;
  const varP = tot > 0 ? imp / tot * 100 : 0;

  const ie = document.getElementById('sim-imp');
  ie.textContent = fmtR(imp);
  ie.className = 'ia-mv ' + (imp >= 0 ? 'ia-pos' : 'ia-neg');

  document.getElementById('sim-proj').textContent = fmtR(proj);

  const ve = document.getElementById('sim-var');
  ve.textContent = (varP >= 0 ? '+' : '') + varP.toFixed(1) + '%';
  ve.className = 'ia-mv ' + (varP >= 0 ? 'ia-pos' : 'ia-neg');
}

async function simIA() {
  const bd = document.getElementById('sim-bd');
  bd.innerHTML = dots();

  const sel  = document.getElementById('s-selic').value;
  const dol  = document.getElementById('s-dolar').value;
  const btc  = document.getElementById('s-btc').value;
  const ibov = document.getElementById('s-ibov').value;
  const port = App.filtered().map(i => `${i.tipo} ${i.nome} ${fmtR(i.saldo)}`).join(', ') || 'vazio';

  try {
    const res = await API.ask(
      `Base: Selic 14,50%, dólar R$5,70. Cenário simulado: Selic ${parseFloat(sel) >= 0 ? '+' : ''}${sel}%, dólar R$${parseFloat(dol).toFixed(2)}, Bitcoin ${parseFloat(btc) >= 0 ? '+' : ''}${btc}%, Ibovespa ${parseFloat(ibov) >= 0 ? '+' : ''}${ibov}%. Portfólio: ${port}. Impacto real e o que fazer preventivamente. Máximo 4 parágrafos.`,
      'Gestor de risco. Prático. Português.'
    );
    bd.innerHTML = fmt(res);
  } catch { bd.innerHTML = 'Erro de conexão.'; }
}


// ═══════════════════════════════════════════════════════
//  DIÁRIO
// ═══════════════════════════════════════════════════════

let diaryFormOpen = false;

function renderDiario() {
  if (typeof planGate === 'function' && planGate('diario', 'panel-diario', 'pro')) return;
  let h = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Diário de decisões</div>
        <div class="ia-sec-sub">Registro e avaliação de cada operação pela IA</div>
      </div>
      <button class="ia-btn-ghost" onclick="toggleDiaryForm()">+ Registrar</button>
    </div>
    <div id="diary-form-area"></div>
  `;

  if (!App.diary.length) {
    h += `<div class="ia-empty"><span>✦</span>Nenhuma decisão registrada.<br>Registre operações para que a IA avalie sua disciplina ao longo do tempo.</div>`;
  } else {
    App.diary.slice().reverse().forEach((d, ri) => {
      const gi = App.diary.length - 1 - ri;
      const bc = { Compra:'ia-b-green', Venda:'ia-b-red', Aporte:'ia-b-blue', Resgate:'ia-b-amber' }[d.tipo] || 'ia-b-neutral';

      let evalHtml = '';
      if (d.avaliacao) {
        const usefulBtn = d.useful
          ? `<span style="font-size:10px;color:var(--gold);margin-left:2px">★ Salvo como útil</span>`
          : `<button class="ia-btn-ghost" style="font-size:10px;padding:3px 9px" onclick="markUseful(${gi})">★ Marcar como útil</button>`;
        const clearBtn = `<button class="ia-btn-ghost" style="font-size:10px;padding:3px 9px" onclick="clearEval(${gi})">Apagar avaliação</button>`;
        evalHtml = `
          <div class="ia-diary-eval">${d.avaliacao}</div>
          <div style="display:flex;gap:6px;margin-top:8px;align-items:center">${usefulBtn}${clearBtn}</div>
        `;
      } else {
        evalHtml = `<button class="ia-btn-ghost" style="font-size:10px;margin-top:8px" onclick="avaliarDecisao(${gi})">Avaliar com IA</button>`;
      }

      h += `
        <div class="ia-diary-item">
          <div class="ia-diary-top">
            <span class="ia-badge ${bc}">${d.tipo}</span>
            <span class="ia-diary-title">${d.ativo}</span>
            <span class="ia-diary-date">${d.data}</span>
            <button class="ia-btn-ghost" style="font-size:10px;padding:2px 8px;margin-left:auto;color:#C0392B;border-color:rgba(192,57,43,.2)" onclick="deleteEntry(${gi})">Apagar</button>
          </div>
          <div class="ia-diary-text">${fmtR(d.valor)} — ${d.justificativa}</div>
          ${evalHtml}
        </div>
      `;
    });
  }

  document.getElementById('panel-diario').innerHTML = h;
}

function toggleDiaryForm() {
  diaryFormOpen = !diaryFormOpen;
  const area = document.getElementById('diary-form-area');
  if (!diaryFormOpen) { area.innerHTML = ''; return; }

  area.innerHTML = `
    <div class="ia-form-box">
      <div class="ia-fgrid">
        <div class="ia-fg">
          <label>Tipo</label>
          <select id="df-tipo"><option>Compra</option><option>Venda</option><option>Aporte</option><option>Resgate</option></select>
        </div>
        <div class="ia-fg"><label>Ativo / Produto</label><input id="df-ativo" placeholder="Ex: PETR4, Tesouro IPCA+"></div>
      </div>
      <div class="ia-fgrid">
        <div class="ia-fg"><label>Valor (R$)</label><input id="df-valor" placeholder="0" oninput="fmtI(this)"></div>
        <div class="ia-fg"><label>Data</label><input id="df-data" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
      </div>
      <div class="ia-fg" style="margin-bottom:0">
        <label>Justificativa</label>
        <textarea class="ia-ai-input" id="df-just" rows="2" placeholder="Por que tomou essa decisão?"></textarea>
      </div>
      <div class="ia-form-actions">
        <button class="ia-btn-ghost" onclick="toggleDiaryForm()">Cancelar</button>
        <button class="ia-btn-gold"  onclick="saveDiaryEntry()">Registrar</button>
      </div>
    </div>
  `;
}

function saveDiaryEntry() {
  const g  = id => document.getElementById(id);
  const dv = g('df-data').value;

  App.diary.push({
    tipo:          g('df-tipo').value,
    ativo:         g('df-ativo').value || '—',
    valor:         parseVal('df-valor'),
    data:          dv ? new Date(dv + 'T12:00:00').toLocaleDateString('pt-BR') : today(),
    justificativa: g('df-just').value || '—',
    avaliacao:     '',
    useful:        false,
  });

  diaryFormOpen = false;
  App.saveDiary();
  renderDiario();
}

async function avaliarDecisao(i) {
  const d = App.diary[i];
  try {
    const r = await API.ask(
      `Avalie: ${d.tipo} em ${d.ativo}, valor ${fmtR(d.valor)}, data ${d.data}. Justificativa: "${d.justificativa}". Cenário: Selic 14,50%, IPCA 5,53%. Boa decisão? O que faria diferente? Máximo 3 frases.`,
      'Gestor de portfólio. Honesto, construtivo. Português. Conciso.'
    );
    App.diary[i].avaliacao = r.replace(/\*\*(.*?)\*\*/g, '$1');
    App.saveDiary();
    renderDiario();
  } catch { alert('Erro de conexão.'); }
}

function markUseful(i) {
  App.diary[i].useful = true;
  App.saveDiary();
  renderDiario();
}

function clearEval(i) {
  App.diary[i].avaliacao = '';
  App.diary[i].useful    = false;
  App.saveDiary();
  renderDiario();
}

function deleteEntry(i) {
  App.diary.splice(i, 1);
  App.saveDiary();
  renderDiario();
}
