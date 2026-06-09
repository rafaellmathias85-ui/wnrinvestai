/**
 * metas.js — Aba de Metas Financeiras
 * Rastreia objetivos com progresso, prazo e orientação por IA.
 */
const METAS_KEY = 'investai_metas_v1';

function _getMetas() { return Storage.get(METAS_KEY) || []; }
function _saveMetas(m) { Storage.set(METAS_KEY, m); }

function renderMetas() {
  if (typeof planGate === 'function' && planGate('metas', 'panel-metas', 'pro')) return;
  const metas = _getMetas();
  const panel = document.getElementById('panel-metas');

  panel.innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Metas Financeiras</div>
        <div class="ia-sec-sub">Acompanhe seus objetivos e receba orientação de quanto aportar por mês</div>
      </div>
      <button class="ia-btn-gold" onclick="abrirFormMeta()">+ Nova meta</button>
    </div>

    <div id="meta-form-area"></div>

    ${!metas.length
      ? `<div class="ia-empty"><span>◎</span>Nenhuma meta cadastrada.<br>Crie sua primeira meta e veja quanto precisa poupar por mês para alcançá-la.</div>`
      : metas.map((m, i) => _metaCard(m, i)).join('')
    }
  `;
}

function _metaCard(m, idx) {
  const hoje      = new Date();
  const prazo     = new Date(m.prazo + 'T12:00:00');
  const mesesLeft = Math.max(0, Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24 * 30.44)));
  const pct       = Math.min(100, Math.round((m.atual / m.valor) * 100));
  const falta     = Math.max(0, m.valor - m.atual);
  const aporteMes = mesesLeft > 0 ? Math.ceil(falta / mesesLeft) : falta;
  const barColor  = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--gold)' : 'var(--blue)';
  const statusLabel = pct >= 100 ? '✓ Concluída' : mesesLeft <= 0 ? 'Prazo vencido' : `${mesesLeft} meses restantes`;
  const statusColor = pct >= 100 ? 'var(--green)' : mesesLeft <= 0 ? 'var(--red)' : 'var(--text-tertiary)';

  return `
    <div class="ia-sim-block" style="margin-bottom:12px" id="meta-card-${idx}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
        <div>
          <div style="font-size:15px;font-weight:500;color:var(--platinum);margin-bottom:3px">${m.nome}</div>
          <div style="font-size:11px;color:var(--text-tertiary)">${m.descricao || ''}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button class="ia-btn-ghost" style="font-size:10px" onclick="aportarMeta(${idx})">Registrar aporte</button>
          <button class="ia-btn-ghost" style="font-size:10px" onclick="analisarMeta(${idx})">Analisar com IA</button>
          <button class="ia-btn-gold" style="font-size:10px;padding:8px 12px" onclick="acelerarMeta(${idx})">Acelerar com IA</button>
          <button class="ia-btn-ghost" style="font-size:10px;color:var(--red)" onclick="deletarMeta(${idx})">Apagar</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Meta</div>
          <div style="font-family:var(--font-mono);font-size:14px">${fmtR(m.valor)}</div></div>
        <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Acumulado</div>
          <div style="font-family:var(--font-mono);font-size:14px;color:var(--green)">${fmtR(m.atual)}</div></div>
        <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Falta</div>
          <div style="font-family:var(--font-mono);font-size:14px;color:var(--red)">${fmtR(falta)}</div></div>
        <div><div style="font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Aporte/mês</div>
          <div style="font-family:var(--font-mono);font-size:14px;color:var(--gold)">${fmtR(aporteMes)}</div></div>
      </div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="flex:1;background:var(--surface-3);border-radius:100px;height:8px;overflow:hidden">
          <div style="background:${barColor};height:100%;width:${pct}%;border-radius:100px;transition:width .5s ease"></div>
        </div>
        <span style="font-family:var(--font-mono);font-size:12px;color:${barColor};min-width:36px">${pct}%</span>
      </div>

      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span style="color:${statusColor}">${statusLabel}</span>
        <span style="color:var(--text-tertiary)">Prazo: ${new Date(m.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
      </div>

      <div id="meta-ia-${idx}" style="margin-top:10px;display:none"></div>
    </div>`;
}

function abrirFormMeta() {
  const area = document.getElementById('meta-form-area');
  if (area.innerHTML) { area.innerHTML = ''; return; }
  area.innerHTML = `
    <div class="ia-form-box" style="margin-bottom:16px">
      <div style="font-size:12px;color:var(--gold);font-weight:500;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px">Nova Meta</div>
      <div class="ia-fgrid">
        <div class="ia-fg"><label>Nome da meta</label>
          <input id="mt-nome" placeholder="Ex: Comprar imóvel, Aposentadoria, Viagem…" /></div>
        <div class="ia-fg"><label>Prazo (data)</label>
          <input id="mt-prazo" type="date" /></div>
      </div>
      <div class="ia-fgrid ia-fgrid3">
        <div class="ia-fg"><label>Valor alvo (R$)</label>
          <input id="mt-valor" type="number" placeholder="Ex: 100000" min="0" /></div>
        <div class="ia-fg"><label>Já tenho guardado (R$)</label>
          <input id="mt-atual" type="number" placeholder="0" min="0" /></div>
        <div class="ia-fg"><label>Aporte mensal atual (R$)</label>
          <input id="mt-aporte" type="number" placeholder="0" min="0" /></div>
      </div>
      <div class="ia-fg" style="margin-bottom:0">
        <label>Descrição (opcional)</label>
        <input id="mt-desc" placeholder="Detalhes sobre esse objetivo…" />
      </div>
      <div class="ia-form-actions">
        <button class="ia-btn-ghost" onclick="document.getElementById('meta-form-area').innerHTML=''">Cancelar</button>
        <button class="ia-btn-gold" onclick="salvarMeta()">Salvar meta</button>
      </div>
    </div>`;
}

function salvarMeta() {
  const nome   = document.getElementById('mt-nome').value.trim();
  const prazo  = document.getElementById('mt-prazo').value;
  const valor  = parseFloat(document.getElementById('mt-valor').value) || 0;
  const atual  = parseFloat(document.getElementById('mt-atual').value) || 0;
  const aporte = parseFloat(document.getElementById('mt-aporte').value) || 0;
  const desc   = document.getElementById('mt-desc').value.trim();
  if (!nome || !prazo || !valor) { alert('Preencha nome, valor alvo e prazo.'); return; }

  const metas = _getMetas();
  metas.push({ nome, prazo, valor, atual, aporte, descricao: desc, criadaEm: new Date().toISOString(), aportes: [] });
  _saveMetas(metas);
  document.getElementById('meta-form-area').innerHTML = '';
  renderMetas();
}

function aportarMeta(idx) {
  const val = parseFloat(prompt('Valor do aporte (R$):'));
  if (isNaN(val) || val <= 0) return;
  const metas = _getMetas();
  metas[idx].atual = (metas[idx].atual || 0) + val;
  metas[idx].aportes = metas[idx].aportes || [];
  metas[idx].aportes.push({ val, data: new Date().toLocaleDateString('pt-BR') });
  _saveMetas(metas);
  renderMetas();
}

function deletarMeta(idx) {
  if (!confirm('Apagar esta meta?')) return;
  const metas = _getMetas();
  metas.splice(idx, 1);
  _saveMetas(metas);
  renderMetas();
}

async function analisarMeta(idx) {
  const m   = _getMetas()[idx];
  const box = document.getElementById(`meta-ia-${idx}`);
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = `<div class="ia-ai-box"><div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Análise da Meta</span></div><div class="ia-ai-bd">${dots()}</div></div>`;

  const hoje  = new Date();
  const prazo = new Date(m.prazo + 'T12:00:00');
  const meses = Math.ceil((prazo - hoje) / (30.44 * 86400000));
  const falta = Math.max(0, m.valor - m.atual);
  const pct   = Math.round((m.atual / m.valor) * 100);

  try {
    const r = await API.ask(
      `Meta: "${m.nome}". Valor alvo: R$ ${Math.round(m.valor).toLocaleString('pt-BR')}. Acumulado: R$ ${Math.round(m.atual).toLocaleString('pt-BR')} (${pct}%). Prazo: ${meses > 0 ? meses + ' meses' : 'vencido'}. Aporte mensal atual: R$ ${Math.round(m.aporte || 0).toLocaleString('pt-BR')}. Cenário atual: Selic ${(RealTime.macro.selic||14.50).toFixed(2)}%, CDI ${(RealTime.macro.cdi||14.40).toFixed(2)}%, IPCA ${(RealTime.macro.ipca||5.53).toFixed(2)}%. Analise a viabilidade desta meta, sugira o aporte mensal ideal, os produtos mais adequados para guardá-la (liquidez x rentabilidade), e o que fazer nos próximos 30 dias. Máximo 3 parágrafos.`,
      'Planejador financeiro pessoal. Português claro e objetivo.',
      700
    );
    box.innerHTML = `<div class="ia-ai-box"><div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Análise da Meta — ${m.nome}</span></div><div class="ia-ai-bd">${fmt(r)}</div></div>`;
  } catch(e) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px">Erro: ${e.message}</div>`;
  }
}

async function acelerarMeta(idx) {
  const m   = _getMetas()[idx];
  const box = document.getElementById(`meta-ia-${idx}`);
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = `<div class="ia-ai-box"><div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Acelerando meta com IA</span></div><div class="ia-ai-bd">${dots()}</div></div>`;

  const hoje  = new Date();
  const prazo = new Date(m.prazo + 'T12:00:00');
  const meses = Math.max(0, Math.ceil((prazo - hoje) / (30.44 * 86400000)));
  const falta = Math.max(0, m.valor - m.atual);
  const pct   = Math.round((m.atual / m.valor) * 100);
  const aporteNecessario = meses > 0 ? Math.ceil(falta / meses) : falta;
  const aporteAtual = Math.round(m.aporte || 0);
  const deficitMensal = Math.max(0, aporteNecessario - aporteAtual);
  const portfolio = (App.portfolio || [])
    .map(i => `${i.tipo} ${i.nome}: ${fmtR(i.saldo)} a ${i.rendimento}% a.a.`)
    .join('; ') || 'sem investimentos cadastrados';

  try {
    const r = await API.ask(
      [
        'ACELERAR_META',
        `Meta: "${m.nome}".`,
        `Descricao: ${m.descricao || 'sem descricao'}.`,
        `Valor alvo: R$ ${Math.round(m.valor).toLocaleString('pt-BR')}.`,
        `Acumulado: R$ ${Math.round(m.atual).toLocaleString('pt-BR')} (${pct}%).`,
        `Falta: R$ ${Math.round(falta).toLocaleString('pt-BR')}.`,
        `Prazo: ${meses > 0 ? meses + ' meses' : 'vencido'}.`,
        `Aporte mensal atual: R$ ${aporteAtual.toLocaleString('pt-BR')}.`,
        `Aporte mensal necessario sem rentabilidade: R$ ${aporteNecessario.toLocaleString('pt-BR')}.`,
        `Deficit mensal: R$ ${deficitMensal.toLocaleString('pt-BR')}.`,
        `Cenario atual: Selic ${(RealTime.macro.selic||14.50).toFixed(2)}%, CDI ${(RealTime.macro.cdi||14.40).toFixed(2)}%, IPCA ${(RealTime.macro.ipca||5.53).toFixed(2)}%, dolar R$ ${(RealTime.macro.dolar||5.20).toFixed(2)}.`,
        `Portfolio atual: ${portfolio}.`,
        'Entregue em portugues do Brasil, com linguagem direta.',
        'Inclua: 1) pergunta inicial se o usuario quer tentar encurtar prazo ou reduzir aporte; 2) tres caminhos numericos para acelerar a meta; 3) opcoes educacionais de investimento para horizontes de 1, 2, 3, 4 e 5 anos; 4) riscos e cuidados; 5) proximos 7 dias.',
        'Nao prometa rentabilidade e nao trate como recomendacao de compra. Use "opcoes para estudar" e cite que deve validar suitability, liquidez, taxas e IR.'
      ].join('\n'),
      'Planejador financeiro e estrategista de alocacao. Nao de recomendacao personalizada de compra; entregue alternativas educacionais, numericas e acionaveis.',
      1200
    );
    box.innerHTML = `<div class="ia-ai-box"><div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Plano para acelerar — ${m.nome}</span></div><div class="ia-ai-bd">${fmt(r)}</div></div>`;
  } catch(e) {
    box.innerHTML = `<div style="color:var(--red);font-size:12px">Erro: ${e.message}</div>`;
  }
}
