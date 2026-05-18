/**
 * portfolio.js — Portfólio com liquidez, IR/IOF, benchmark CDI e alerta de fundo emergência.
 */

let formOpen   = false;
let editingIdx = -1;

const CDI_AA  = 14.15;  // CDI atual (sincronizado com RealTime.macro)
const IPCA_AA = 5.53;

function renderPortfolio() {
  const list = App.filtered();
  const tot  = list.reduce((s, i) => s + i.saldo, 0);
  const rec  = list.reduce((s, i) => s + i.recorrencia, 0);
  const ap   = list.reduce((s, i) => s + i.aporte, 0);
  const rent = list.length ? list.reduce((s, i) => s + i.rendimento, 0) / list.length : 0;
  const rentLiq = _rentLiquida(list, tot);

  // ── Alerta fundo de emergência ────────────────────────
  const user       = typeof Auth !== 'undefined' ? Auth.currentUser() : null;
  const semReserva = user?.profile && !user.profile.hasEmergencia;
  const emergAlert = semReserva
    ? `<div style="background:var(--amber-dim);border:1px solid rgba(192,122,43,.3);border-radius:var(--radius-md);padding:10px 14px;font-size:12px;color:var(--amber);margin-bottom:16px;line-height:1.7">
        ⚠ <strong>Fundo de emergência:</strong> Você não possui reserva de emergência. Antes de investir, guarde de 3 a 6 meses de gastos em Tesouro Selic ou CDB com liquidez diária.
       </div>`
    : '';

  // ── Benchmark ─────────────────────────────────────────
  const cdiColor = rent >= CDI_AA ? 'ia-pos' : 'ia-neg';
  const cdiLabel = rent >= CDI_AA ? `▲ ${(rent - CDI_AA).toFixed(1)}% acima do CDI` : `▼ ${(CDI_AA - rent).toFixed(1)}% abaixo do CDI`;

  let h = `
    ${emergAlert}
    <div class="ia-metrics">
      <div class="ia-mc"><div class="ia-ml">Patrimônio</div><div class="ia-mv ia-gold">${fmtR(tot)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Rentab. bruta média</div><div class="ia-mv ia-pos">${rent.toFixed(1)}% a.a.</div></div>
      <div class="ia-mc"><div class="ia-ml">Rentab. líquida est.</div><div class="ia-mv ${cdiColor}">${rentLiq.toFixed(1)}% a.a.</div></div>
      <div class="ia-mc"><div class="ia-ml">vs CDI (${CDI_AA}%)</div><div class="ia-mv ${cdiColor}" style="font-size:12px">${cdiLabel}</div></div>
      <div class="ia-mc"><div class="ia-ml">Recorrência/mês</div><div class="ia-mv">${fmtR(rec)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Aportes pontuais</div><div class="ia-mv">${fmtR(ap)}</div></div>
    </div>

    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Investimentos ativos</div>
        <div class="ia-sec-sub">${App.currentMode === 'cons' ? 'Perfil conservador' : 'Perfil avançado'} · Clique no tipo para ver o glossário</div>
      </div>
      <button class="ia-btn-ghost" onclick="togglePortForm()">+ Adicionar</button>
    </div>
    <div id="port-form-area"></div>
  `;

  if (!list.length) {
    h += `<div class="ia-empty"><span>∅</span>Nenhum investimento cadastrado.<br>Adicione seu primeiro ativo para iniciar o monitoramento.</div>`;
  } else {
    h += `
      <table class="ia-table">
        <thead>
          <tr>
            <th>Produto</th><th>Instituição</th><th>Saldo</th>
            <th>Bruto a.a.</th><th>Líq. est.</th><th>Liquidez</th><th>Recorrência</th><th></th>
          </tr>
        </thead>
        <tbody>
    `;
    list.forEach(inv => {
      const gi     = App.portfolio.indexOf(inv);
      const liq    = _liqLabel(inv);
      const liqIR  = _calcIRliq(inv);

      h += `
        <tr>
          <td>
            <span class="ia-badge ${badgeClass(inv.tipo)}" style="cursor:pointer" onclick="showGlossario('${inv.tipo}')" title="Ver glossário">${inv.tipo}</span>
            <span style="color:#8A8F9A;margin-left:6px">${inv.nome}</span>
          </td>
          <td style="color:#6B7280">${inv.banco}</td>
          <td style="font-family:'DM Mono',monospace">${fmtR(inv.saldo)}</td>
          <td class="ia-pos" style="font-family:'DM Mono',monospace">${inv.rendimento}%</td>
          <td class="${liqIR.css}" style="font-family:'DM Mono',monospace" title="${liqIR.tooltip}">${liqIR.display}</td>
          <td><span class="ia-badge ${liq.cls}">${liq.label}</span></td>
          <td style="font-family:'DM Mono',monospace;color:#6B7280">${fmtR(inv.recorrencia)}</td>
          <td style="display:flex;gap:5px;flex-wrap:nowrap">
            <button class="ia-btn-ghost" style="font-size:10px;padding:4px 9px" onclick="editInv(${gi})">Editar</button>
            <button class="ia-btn-ghost" style="font-size:10px;padding:4px 9px;color:var(--red)" onclick="removeInv(${gi})">Remover</button>
          </td>
        </tr>
      `;
    });
    h += `</tbody></table>`;

    // ── Calculadora IR/IOF ─────────────────────────────
    h += buildIRCalc(list, tot);
    h += buildEvolution(list);
  }

  document.getElementById('panel-portfolio').innerHTML = h;
  if (typeof patchBadges === 'function') setTimeout(patchBadges, 50);

  if (formOpen) {
    buildPortForm();
    if (editingIdx >= 0) setTimeout(() => document.getElementById('port-form-area')?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 60);
  }
}

// ── Rentabilidade líquida estimada ─────────────────────
function _rentLiquida(list, tot) {
  if (!tot) return 0;
  const ISENTOS = ['LCI/LCA', 'FII'];  // FII tem dividendos isentos
  const soma = list.reduce((s, inv) => {
    const pct  = inv.saldo / tot;
    const isento = ISENTOS.includes(inv.tipo);
    // Aproximação: IR de 15% após 720 dias para renda fixa
    const taxaLiq = isento ? inv.rendimento : inv.rendimento * (1 - 0.15);
    return s + taxaLiq * pct;
  }, 0);
  return soma;
}

// ── Rentabilidade líquida por ativo ────────────────────
function _calcIRliq(inv) {
  const ISENTOS = ['LCI/LCA'];
  if (ISENTOS.includes(inv.tipo)) {
    return { display: `${inv.rendimento}% ✓`, css: 'ia-pos', tooltip: 'Isento de IR' };
  }
  const liq = inv.rendimento * 0.85;  // IR 15% (longo prazo)
  const css = liq >= CDI_AA * 0.85 ? 'ia-pos' : liq >= CDI_AA * 0.70 ? '' : 'ia-neg';
  return { display: `${liq.toFixed(1)}%`, css, tooltip: `Bruto: ${inv.rendimento}% — IR 15% aprox. (longo prazo)` };
}

// ── Liquidez label ─────────────────────────────────────
function _liqLabel(inv) {
  const liq = inv.liquidez || 'media';
  const map = {
    diaria:  { label: 'Diária',    cls: 'ia-b-green' },
    media:   { label: 'Média',     cls: 'ia-b-blue'  },
    baixa:   { label: 'Baixa',     cls: 'ia-b-amber' },
    venc:    { label: 'No venc.',  cls: 'ia-b-neutral'},
  };
  return map[liq] || map.media;
}

// ── Calculadora de IR/IOF ──────────────────────────────
function buildIRCalc(list, tot) {
  const rfList = list.filter(i => ['CDB','Tesouro Direto','LCI/LCA','Fundo'].includes(i.tipo));
  if (!rfList.length) return '';

  const ALIQ_IR = [22.5, 20, 17.5, 15];  // <180d, 180-360d, 361-720d, >720d
  const PRAZO_LABELS = ['< 180 dias', '180–360 dias', '361–720 dias', '> 720 dias'];

  const rows = rfList.map(inv => {
    const ganho = inv.saldo * (inv.rendimento / 100);
    const isento = inv.tipo === 'LCI/LCA';
    const liqRows = isento
      ? `<td colspan="4" style="color:var(--green);text-align:center">Isento de IR ✓</td>`
      : ALIQ_IR.map((al, i) => {
          const net = ganho * (1 - al / 100);
          return `<td style="font-family:var(--font-mono);font-size:11px">${fmtR(net)}<br><span style="color:var(--text-tertiary);font-size:9px">${al}%</span></td>`;
        }).join('');
    return `<tr>
      <td><span class="ia-badge ${badgeClass(inv.tipo)}">${inv.tipo}</span> ${inv.nome}</td>
      <td style="font-family:var(--font-mono)">${fmtR(ganho)}</td>
      ${liqRows}
    </tr>`;
  }).join('');

  return `
    <div class="ia-sec-hd" style="margin-top:22px">
      <div>
        <div class="ia-sec-title">Calculadora de Ganho Líquido (IR)</div>
        <div class="ia-sec-sub">Ganho anual estimado descontando o imposto de renda por prazo de resgate</div>
      </div>
    </div>
    <div style="overflow-x:auto;margin-bottom:16px">
      <table class="ia-table" style="font-size:11px;min-width:600px">
        <thead>
          <tr>
            <th>Produto</th><th>Ganho bruto/ano</th>
            ${PRAZO_LABELS.map(p => `<th>${p}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Evolução projetada ─────────────────────────────────
function buildEvolution(list) {
  const tot = list.reduce((s, i) => s + i.saldo, 0);
  if (!tot) return '';

  const rec   = list.reduce((s, i) => s + i.recorrencia, 0);
  const wavg  = list.reduce((s, i) => s + i.rendimento * i.saldo, 0) / tot;
  const mRate = wavg / 100 / 12;

  const now = new Date();
  let bal = tot, totalJuros = 0, rows = '';

  for (let i = 1; i <= 12; i++) {
    const d      = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label  = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    const juros  = bal * mRate;
    totalJuros  += juros;
    const endBal = bal + juros + rec;
    rows += `<tr>
      <td style="color:var(--text-tertiary)">${label}</td>
      <td style="font-family:'DM Mono',monospace;color:var(--text-secondary)">${fmtR(bal)}</td>
      <td class="ia-pos" style="font-family:'DM Mono',monospace">+${fmtR(juros)}</td>
      <td style="font-family:'DM Mono',monospace;color:#6B7280">${rec > 0 ? '+' + fmtR(rec) : '—'}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:500;color:var(--text-primary)">${fmtR(endBal)}</td>
    </tr>`;
    bal = endBal;
  }

  const ganho = bal - tot;
  const ganhoP = tot > 0 ? (ganho / tot * 100) : 0;
  const cdiProj = tot * Math.pow(1 + CDI_AA / 100, 1) + rec * 12;

  return `
    <div class="ia-sec-hd" style="margin-top:22px">
      <div>
        <div class="ia-sec-title">Evolução projetada — 12 meses</div>
        <div class="ia-sec-sub">Taxa ponderada ${wavg.toFixed(2)}% a.a. · CDI ${CDI_AA}% a.a.</div>
      </div>
    </div>
    <div class="ia-metrics" style="margin-bottom:14px">
      <div class="ia-mc"><div class="ia-ml">Hoje</div><div class="ia-mv ia-gold">${fmtR(tot)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Juros em 12 meses</div><div class="ia-mv ia-pos">+${fmtR(totalJuros)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Projeção 12 meses</div><div class="ia-mv ia-pos">${fmtR(bal)} <span style="font-size:10px">(+${ganhoP.toFixed(1)}%)</span></div></div>
      <div class="ia-mc"><div class="ia-ml">Se fosse CDI puro</div><div class="ia-mv" style="color:var(--text-tertiary)">${fmtR(cdiProj)}</div></div>
    </div>
    <table class="ia-table" style="font-size:11px">
      <thead><tr><th>Mês</th><th>Saldo início</th><th>Juros mês</th><th>Recorrência</th><th>Saldo fim</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── Form ───────────────────────────────────────────────
function togglePortForm() {
  // Plano free: limite de 3 ativos
  if (!formOpen && editingIdx < 0) {
    const limit = (typeof Auth !== 'undefined') ? Auth.getPlanConfig().portfolioLimit : 3;
    if (App.filtered().length >= limit) {
      const planLbl = limit === 3 ? 'Pro ou Premium' : '';
      alert(`Limite de ${limit} ativo${limit===1?'':'s'} no plano Gratuito.\nFaça upgrade para adicionar mais.`);
      window.open('landing.html#planos', '_blank');
      return;
    }
  }
  formOpen   = !formOpen;
  editingIdx = -1;
  formOpen ? buildPortForm() : (document.getElementById('port-form-area').innerHTML = '');
}

function editInv(gi) { editingIdx = gi; formOpen = true; renderPortfolio(); }

function cancelPortForm() {
  formOpen = false; editingIdx = -1;
  document.getElementById('port-form-area').innerHTML = '';
}

function buildPortForm() {
  const inv    = editingIdx >= 0 ? App.portfolio[editingIdx] : null;
  const isEdit = inv !== null;
  let tipos    = App.currentMode === 'cons'
    ? ['CDB', 'Tesouro Direto', 'LCI/LCA', 'Ouro', 'Fundo']
    : ['Ações', 'Cripto', 'FII', 'ETF', 'CDB', 'Fundo'];
  if (isEdit && !tipos.includes(inv.tipo)) tipos = [inv.tipo, ...tipos];
  const q      = s => (s || '').replace(/"/g, '&quot;');
  const selOpts = tipos.map(t => `<option${isEdit && inv.tipo === t ? ' selected' : ''}>${t}</option>`).join('');
  const liqSel = ['diaria','media','baixa','venc'].map(v => {
    const lbl = { diaria:'Diária', media:'Média (30-360 dias)', baixa:'Baixa (>360 dias)', venc:'Somente no vencimento' }[v];
    return `<option value="${v}"${isEdit && (inv.liquidez||'media') === v ? ' selected' : ''}>${lbl}</option>`;
  }).join('');

  document.getElementById('port-form-area').innerHTML = `
    <div class="ia-form-box">
      ${isEdit ? `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--gold);margin-bottom:10px">Editando: ${q(inv.nome)}</div>` : ''}
      <div class="ia-fgrid">
        <div class="ia-fg"><label>Tipo</label><select id="f-tipo">${selOpts}</select></div>
        <div class="ia-fg"><label>Nome / Descrição</label><input id="f-nome" placeholder="Ex: Tesouro IPCA+ 2029" value="${isEdit ? q(inv.nome) : ''}"></div>
      </div>
      <div class="ia-fgrid ia-fgrid3">
        <div class="ia-fg"><label>Instituição</label><input id="f-banco" placeholder="Ex: XP, Nubank" value="${isEdit ? q(inv.banco) : ''}"></div>
        <div class="ia-fg"><label>Saldo atual (R$)</label><input id="f-saldo" placeholder="0" oninput="fmtI(this)" value="${isEdit ? Math.round(inv.saldo).toLocaleString('pt-BR') : ''}"></div>
        <div class="ia-fg"><label>Rentabilidade (% a.a.)</label><input id="f-rend" type="number" step="0.1" placeholder="10.5" value="${isEdit ? inv.rendimento : ''}"></div>
      </div>
      <div class="ia-fgrid ia-fgrid3">
        <div class="ia-fg"><label>Recorrência mensal (R$)</label><input id="f-rec" placeholder="0" oninput="fmtI(this)" value="${isEdit ? Math.round(inv.recorrencia).toLocaleString('pt-BR') : ''}"></div>
        <div class="ia-fg"><label>Aporte pontual (R$)</label><input id="f-ap" placeholder="0" oninput="fmtI(this)" value="${isEdit ? Math.round(inv.aporte).toLocaleString('pt-BR') : ''}"></div>
        <div class="ia-fg"><label>Liquidez</label><select id="f-liq">${liqSel}</select></div>
      </div>
      <div class="ia-form-actions">
        <button class="ia-btn-ghost" onclick="cancelPortForm()">Cancelar</button>
        <button class="ia-btn-gold"  onclick="saveInv()">${isEdit ? 'Atualizar' : 'Salvar'}</button>
      </div>
    </div>`;
}

function saveInv() {
  const g  = id => document.getElementById(id);
  const pv = id => parseFloat((g(id).value || '0').replace(/\./g,'').replace(',','.')) || 0;
  const entry = {
    mode:        App.currentMode,
    tipo:        g('f-tipo').value,
    nome:        g('f-nome').value || '—',
    banco:       g('f-banco').value || '—',
    saldo:       pv('f-saldo'),
    rendimento:  parseFloat(g('f-rend').value) || 0,
    recorrencia: pv('f-rec'),
    aporte:      pv('f-ap'),
    liquidez:    g('f-liq').value,
    data:        editingIdx >= 0 ? App.portfolio[editingIdx].data : today(),
  };
  if (editingIdx >= 0) { App.portfolio[editingIdx] = entry; editingIdx = -1; }
  else App.portfolio.push(entry);
  formOpen = false;
  App.savePortfolio();
  renderPortfolio();
}

function removeInv(i) {
  if (!confirm('Remover este investimento?')) return;
  if (editingIdx === i) { formOpen = false; editingIdx = -1; }
  App.portfolio.splice(i, 1);
  App.savePortfolio();
  renderPortfolio();
}
