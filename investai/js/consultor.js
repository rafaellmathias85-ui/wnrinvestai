/**
 * consultor.js
 * ------------
 * Consultor de Investimentos com IA.
 * O usuário informa objetivo, prazo, valor inicial e aporte mensal;
 * a IA gera um plano de alocação personalizado com diversificação.
 */

let _consultorSaved = null;
let _consultorChart = null;

const CHART_COLORS = [
  '#B8965A', '#4A8EC4', '#3D9970', '#C07A2B',
  '#7B68EE', '#E74C3C', '#1ABC9C', '#9B59B6',
];

function renderConsultor() {
  if (typeof planGate === 'function' && planGate('consultor', 'panel-consultor', 'premium')) return;
  const panel = document.getElementById('panel-consultor');

  panel.innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Consultor de Investimentos</div>
        <div class="ia-sec-sub">Defina seu objetivo e receba um plano com alocação de ativos personalizada</div>
      </div>
    </div>

    <div class="ia-form-box">
      <div class="ia-fgrid" style="grid-template-columns:1fr;margin-bottom:10px">
        <div class="ia-fg">
          <label>Qual é o seu objetivo financeiro?</label>
          <textarea class="ia-ai-input" id="cons-objetivo" rows="2"
            placeholder="Ex: Aposentadoria, comprar imóvel, independência financeira, fundo de emergência..."></textarea>
        </div>
      </div>

      <div class="ia-fgrid" style="margin-bottom:10px">
        <div class="ia-fg">
          <label>O que exatamente você quer alcançar?</label>
          <textarea class="ia-ai-input" id="cons-meta" rows="2"
            placeholder="Ex: Acumular R$ 1 milhão em 10 anos para renda passiva de R$ 5.000/mês..."></textarea>
        </div>
        <div class="ia-fg">
          <label>Prazo estimado</label>
          <select id="cons-prazo">
            <option value="6 meses">Curto prazo — 6 meses</option>
            <option value="1 ano">Curto prazo — 1 ano</option>
            <option value="2 anos">Curto prazo — 2 anos</option>
            <option value="3 anos" selected>Médio prazo — 3 anos</option>
            <option value="5 anos">Médio prazo — 5 anos</option>
            <option value="7 anos">Longo prazo — 7 anos</option>
            <option value="10 anos">Longo prazo — 10 anos</option>
            <option value="15 anos">Longo prazo — 15 anos</option>
            <option value="20 anos ou mais">Muito longo prazo — 20+ anos</option>
          </select>
        </div>
      </div>

      <div class="ia-fgrid ia-fgrid3">
        <div class="ia-fg">
          <label>Valor inicial disponível (R$)</label>
          <input type="number" id="cons-inicial" placeholder="Ex: 10000" min="0" step="100" />
        </div>
        <div class="ia-fg">
          <label>Aporte mensal recorrente (R$)</label>
          <input type="number" id="cons-recorrente" placeholder="Ex: 1000" min="0" step="50" />
        </div>
        <div class="ia-fg">
          <label>Perfil de risco</label>
          <select id="cons-perfil">
            <option value="Conservador" ${App.currentMode === 'cons' ? 'selected' : ''}>Conservador</option>
            <option value="Moderado">Moderado</option>
            <option value="Arrojado" ${App.currentMode === 'av' ? 'selected' : ''}>Arrojado</option>
          </select>
        </div>
      </div>

      <div class="ia-form-actions" style="margin-top:14px">
        <button class="ia-btn-gold" id="cons-btn" onclick="gerarPlano()">
          Gerar Plano de Investimento
        </button>
      </div>
    </div>

    <div id="cons-resultado" style="display:none">

      <div style="display:grid;grid-template-columns:230px 1fr;gap:16px;margin-bottom:16px;align-items:start">

        <div class="ia-sim-block" style="display:flex;flex-direction:column;align-items:center;padding:20px 16px">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:14px">
            Alocação Sugerida
          </div>
          <canvas id="cons-chart" width="180" height="180"></canvas>
          <div id="cons-legend" style="margin-top:16px;width:100%;display:flex;flex-direction:column;gap:6px;font-size:11px"></div>
        </div>

        <div>
          <div class="ia-ai-box">
            <div class="ia-ai-hd">
              <span class="ia-pulse"></span>
              <span class="ia-ai-label">Análise do Consultor IA</span>
            </div>
            <div class="ia-ai-bd" id="cons-analise" style="font-size:13px;line-height:1.85"></div>
          </div>

          <div id="cons-projecao" class="ia-sim-block" style="display:none">
            <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:12px">
              Projeção Estimada ao Final do Prazo
            </div>
            <div id="cons-proj-vals" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"></div>
          </div>
        </div>
      </div>

      <div class="ia-sim-block" style="margin-bottom:16px">
        <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:12px">
          Ativos Recomendados com Diversificação
        </div>
        <table class="ia-table">
          <thead>
            <tr>
              <th>Classe</th>
              <th>Produto</th>
              <th style="text-align:center">%</th>
              <th>Valor Inicial</th>
              <th>Aporte Mensal</th>
              <th>Justificativa</th>
            </tr>
          </thead>
          <tbody id="cons-tabela"></tbody>
        </table>
      </div>

      <div class="ia-ai-box" id="cons-proximos-box" style="display:none">
        <div class="ia-ai-hd">
          <span class="ia-pulse"></span>
          <span class="ia-ai-label">Próximos Passos</span>
        </div>
        <div class="ia-ai-bd" id="cons-proximos" style="font-size:13px;line-height:1.85"></div>
      </div>

    </div>
  `;

  if (_consultorSaved) _renderConsultorResult(_consultorSaved);
}

async function gerarPlano() {
  const objetivo   = document.getElementById('cons-objetivo').value.trim();
  const meta       = document.getElementById('cons-meta').value.trim();
  const prazo      = document.getElementById('cons-prazo').value;
  const inicial    = parseFloat(document.getElementById('cons-inicial').value) || 0;
  const recorrente = parseFloat(document.getElementById('cons-recorrente').value) || 0;
  const perfil     = document.getElementById('cons-perfil').value;

  if (!objetivo && !meta) {
    alert('Descreva seu objetivo ou meta financeira antes de gerar o plano.');
    return;
  }

  const btn = document.getElementById('cons-btn');
  btn.disabled = true;
  btn.textContent = 'Gerando plano…';

  document.getElementById('cons-resultado').style.display = 'none';

  const vlrIni = inicial    ? `R$ ${fmtBRLint(inicial)}`    : 'não informado';
  const vlrMes = recorrente ? `R$ ${fmtBRLint(recorrente)}` : 'não informado';

  // Obtém indicadores macro em tempo real (usa cache de 1h se disponível)
  let macro = RealTime.macro;
  try { macro = await RealTime.fetchMacro(); } catch (_) {}

  const fmtPct = v => Number(v).toFixed(2).replace('.', ',') + '%';
  const cenario = [
    `Selic: ${fmtPct(macro.selic)} a.a.`,
    `CDI: ${fmtPct(macro.cdi)} a.a.`,
    `IPCA 12m: ${fmtPct(macro.ipca)} a.a.`,
    `Dólar: R$ ${Number(macro.dolar).toFixed(2).replace('.', ',')}`,
    `Ibovespa: ${Math.round(macro.ibov).toLocaleString('pt-BR')} pts`,
    `Bitcoin: US$ ${Math.round(macro.btc).toLocaleString('en-US')}`,
    `VIX: ${Number(macro.vix).toFixed(1)}`,
  ].join(' | ');

  const prompt = `
Você é um consultor financeiro sênior especialista no mercado brasileiro.
Crie um plano de investimento personalizado com base nos dados abaixo.

DADOS DO INVESTIDOR:
- Objetivo: ${objetivo || 'não informado'}
- Meta específica: ${meta || 'não informada'}
- Prazo: ${prazo}
- Valor inicial disponível: ${vlrIni}
- Aporte mensal: ${vlrMes}
- Perfil de risco: ${perfil}

CENÁRIO ECONÔMICO ATUAL:
- ${cenario}

INSTRUÇÕES — responda SOMENTE com JSON válido, sem markdown nem texto fora do JSON:
{
  "analise": "2 parágrafos curtos sobre perfil, objetivos e estratégia geral.",
  "alocacao": [
    { "classe": "Nome curto da classe", "produto": "Produto real do mercado BR", "percentual": 30, "justificativa": "1 frase." }
  ],
  "projecao": {
    "conservadora": "ex: R$ 180.000",
    "realista": "ex: R$ 230.000",
    "otimista": "ex: R$ 310.000"
  },
  "proximos_passos": "3 ações práticas curtas, separadas por \\n."
}

Regras:
- Soma dos percentuais = 100 exatamente
- 4 a 6 classes adequadas ao perfil e prazo
- Produtos reais: Tesouro IPCA+ 2035, CDB Inter 120% CDI, KNRI11, IVVB11, VALE3, etc.
- Seja breve — cada campo deve ser conciso`;

  const system = `Você é um estrategista de investimentos sênior com 20 anos de experiência no mercado brasileiro.
Domina renda fixa, renda variável, FIIs, ETFs, BDRs e criptoativos.
Responde sempre em português brasileiro com linguagem clara e objetiva.
Suas recomendações são personalizadas, realistas e fundamentadas no cenário econômico atual.
CRÍTICO: Responda SOMENTE com JSON válido, sem nenhum texto adicional fora do JSON.`;

  try {
    const raw  = await API.ask(prompt, system, 4000);
    const json = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const data = JSON.parse(json);
    _consultorSaved = { data, inicial, recorrente };
    _renderConsultorResult(_consultorSaved);
  } catch (e) {
    document.getElementById('cons-resultado').style.display = 'block';
    document.getElementById('cons-analise').innerHTML =
      `<span style="color:var(--red)">Erro ao gerar o plano. Tente novamente.</span>` +
      `<br><small style="color:var(--text-tertiary);font-size:11px">${e.message}</small>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gerar Plano de Investimento';
  }
}

function _renderConsultorResult({ data, inicial, recorrente }) {
  document.getElementById('cons-resultado').style.display = 'block';

  document.getElementById('cons-analise').innerHTML = fmt(data.analise || '');

  const alocacao = data.alocacao || [];
  const labels   = alocacao.map(a => a.classe);
  const values   = alocacao.map(a => Number(a.percentual));
  const colors   = alocacao.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  if (_consultorChart) { _consultorChart.destroy(); _consultorChart = null; }

  const ctx = document.getElementById('cons-chart').getContext('2d');
  _consultorChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }],
    },
    options: {
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${c.parsed}%` } },
      },
      animation: { duration: 700 },
    },
  });

  document.getElementById('cons-legend').innerHTML = alocacao.map((a, i) => `
    <div style="display:flex;align-items:center;gap:7px">
      <span style="width:9px;height:9px;border-radius:2px;background:${colors[i]};flex-shrink:0"></span>
      <span style="color:var(--text-secondary);flex:1">${a.classe}</span>
      <span style="color:var(--gold);font-family:var(--font-mono)">${a.percentual}%</span>
    </div>
  `).join('');

  document.getElementById('cons-tabela').innerHTML = alocacao.map((a, i) => {
    const pct     = Number(a.percentual) / 100;
    const vlrIni  = inicial    ? fmtR(inicial    * pct) : '—';
    const vlrMes  = recorrente ? fmtR(recorrente * pct) : '—';
    return `
      <tr>
        <td>
          <span style="display:inline-flex;align-items:center;gap:7px">
            <span style="width:8px;height:8px;border-radius:2px;background:${colors[i]};flex-shrink:0"></span>
            ${a.classe}
          </span>
        </td>
        <td style="color:var(--text-secondary)">${a.produto}</td>
        <td style="text-align:center">
          <span style="color:var(--gold);font-family:var(--font-mono);font-weight:600">${a.percentual}%</span>
        </td>
        <td style="font-family:var(--font-mono);white-space:nowrap">${vlrIni}</td>
        <td style="font-family:var(--font-mono);white-space:nowrap">${vlrMes}</td>
        <td style="color:var(--text-tertiary);font-size:11px;line-height:1.6">${a.justificativa}</td>
      </tr>`;
  }).join('');

  if (data.projecao) {
    document.getElementById('cons-projecao').style.display = 'block';
    document.getElementById('cons-proj-vals').innerHTML = `
      <div style="text-align:center;padding:12px;background:var(--surface);border-radius:var(--radius-sm)">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:6px">Conservador</div>
        <div style="font-family:var(--font-mono);font-size:14px;color:var(--text-secondary)">${data.projecao.conservadora}</div>
      </div>
      <div style="text-align:center;padding:12px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border-gold)">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-bottom:6px">Realista</div>
        <div style="font-family:var(--font-mono);font-size:14px;color:var(--platinum)">${data.projecao.realista}</div>
      </div>
      <div style="text-align:center;padding:12px;background:var(--surface);border-radius:var(--radius-sm)">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-tertiary);margin-bottom:6px">Otimista</div>
        <div style="font-family:var(--font-mono);font-size:14px;color:var(--green)">${data.projecao.otimista}</div>
      </div>`;
  }

  if (data.proximos_passos) {
    document.getElementById('cons-proximos-box').style.display = 'block';
    document.getElementById('cons-proximos').innerHTML = fmt(data.proximos_passos);
  }
}

function fmtBRLint(val) {
  return Math.round(val).toLocaleString('pt-BR');
}
