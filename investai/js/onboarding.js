/**
 * onboarding.js — Questionário de Perfil do Investidor (Suitability)
 */

const SUITABILITY_QUESTIONS = [
  {
    id: 'idade',
    q: 'Qual é a sua faixa etária?',
    opts: [
      { label: 'Até 25 anos',   val: 'até 25',  pts: 4 },
      { label: '26 a 35 anos',  val: '26-35',   pts: 3 },
      { label: '36 a 50 anos',  val: '36-50',   pts: 2 },
      { label: 'Acima de 50',   val: '50+',     pts: 1 },
    ],
  },
  {
    id: 'renda',
    q: 'Qual é a sua renda mensal líquida?',
    opts: [
      { label: 'Até R$ 3.000',         val: 'até 3k',  pts: 1 },
      { label: 'R$ 3.001 a R$ 8.000',  val: '3-8k',    pts: 2 },
      { label: 'R$ 8.001 a R$ 20.000', val: '8-20k',   pts: 3 },
      { label: 'Acima de R$ 20.000',   val: '20k+',    pts: 4 },
    ],
  },
  {
    id: 'prazo',
    q: 'Por quanto tempo pretende manter os investimentos?',
    opts: [
      { label: 'Menos de 1 ano',    val: '<1a',   pts: 1 },
      { label: '1 a 3 anos',        val: '1-3a',  pts: 2 },
      { label: '3 a 10 anos',       val: '3-10a', pts: 3 },
      { label: 'Mais de 10 anos',   val: '>10a',  pts: 4 },
    ],
  },
  {
    id: 'emergencia',
    q: 'Você possui reserva de emergência (6 meses de gastos)?',
    opts: [
      { label: 'Não tenho reserva',         val: 'nao',      pts: 0 },
      { label: 'Tenho parte (1-3 meses)',   val: 'parcial',  pts: 1 },
      { label: 'Tenho (4-6 meses)',         val: 'sim',      pts: 2 },
      { label: 'Tenho mais de 6 meses',     val: 'confort',  pts: 3 },
    ],
  },
  {
    id: 'conhecimento',
    q: 'Como você avalia seu conhecimento sobre investimentos?',
    opts: [
      { label: 'Iniciante — só conheço poupança',              val: 'iniciante',    pts: 1 },
      { label: 'Básico — conheço CDB, Tesouro',                val: 'basico',       pts: 2 },
      { label: 'Intermediário — entendo FIIs, ações',          val: 'intermediario',pts: 3 },
      { label: 'Avançado — opero derivativos, cripto',         val: 'avancado',     pts: 4 },
    ],
  },
  {
    id: 'perda',
    q: 'Se seu investimento cair 20% em 1 mês, o que você faria?',
    opts: [
      { label: 'Sacaria tudo imediatamente',             val: 'saca',      pts: 1 },
      { label: 'Ficaria preocupado mas aguardaria',      val: 'aguarda',   pts: 2 },
      { label: 'Manteria a posição tranquilamente',      val: 'manteria',  pts: 3 },
      { label: 'Aproveitaria para comprar mais (buy dip)',val: 'compra',  pts: 4 },
    ],
  },
  {
    id: 'objetivo',
    q: 'Qual é o seu principal objetivo financeiro?',
    opts: [
      { label: 'Preservar o capital — não quero perder nada',   val: 'preservar',    pts: 1 },
      { label: 'Renda regular — quero receber todo mês',        val: 'renda',        pts: 2 },
      { label: 'Crescimento equilibrado de longo prazo',        val: 'crescimento',  pts: 3 },
      { label: 'Máximo retorno, aceito alta volatilidade',      val: 'maximo',       pts: 4 },
    ],
  },
];

let _onbAnswers = {};
let _onbStep    = 0;

function renderOnboarding() {
  const user    = Auth.currentUser();
  const panel   = document.getElementById('panel-onboarding');

  if (user?.profile?.perfil) {
    _renderOnbResult(user.profile, panel);
    return;
  }

  _onbAnswers = {};
  _onbStep    = 0;
  _renderOnbQuestion(panel);
}

function _renderOnbQuestion(panel) {
  const q = SUITABILITY_QUESTIONS[_onbStep];
  const progress = Math.round((_onbStep / SUITABILITY_QUESTIONS.length) * 100);

  panel.innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Perfil do Investidor</div>
        <div class="ia-sec-sub">Questionário de suitability — ${_onbStep + 1} de ${SUITABILITY_QUESTIONS.length}</div>
      </div>
    </div>

    <div style="background:var(--surface-3);border-radius:100px;height:4px;margin-bottom:24px;overflow:hidden">
      <div style="background:var(--gold);height:100%;width:${progress}%;transition:width .4s ease;border-radius:100px"></div>
    </div>

    <div class="ia-form-box" style="max-width:600px;margin:0 auto">
      <div style="font-family:var(--font-serif);font-size:18px;color:var(--platinum);margin-bottom:20px;line-height:1.5">
        ${q.q}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${q.opts.map(o => `
          <button class="onb-opt" onclick="onbSelect('${q.id}', '${o.val}', ${o.pts})">
            ${o.label}
          </button>`).join('')}
      </div>
      ${_onbStep > 0 ? `<div style="margin-top:16px"><button class="ia-btn-ghost" onclick="onbBack()">← Voltar</button></div>` : ''}
    </div>
  `;
}

function onbSelect(questionId, val, pts) {
  _onbAnswers[questionId] = { val, pts };
  _onbStep++;
  const panel = document.getElementById('panel-onboarding');

  if (_onbStep >= SUITABILITY_QUESTIONS.length) {
    _calcOnbProfile(panel);
  } else {
    _renderOnbQuestion(panel);
  }
}

function onbBack() {
  if (_onbStep <= 0) return;
  const lastQ = SUITABILITY_QUESTIONS[_onbStep - 1];
  delete _onbAnswers[lastQ.id];
  _onbStep--;
  _renderOnbQuestion(document.getElementById('panel-onboarding'));
}

function _calcOnbProfile(panel) {
  const total = Object.values(_onbAnswers).reduce((s, a) => s + a.pts, 0);
  const max   = SUITABILITY_QUESTIONS.reduce((s, q) => s + Math.max(...q.opts.map(o => o.pts)), 0);
  const pct   = total / max;

  let perfil, cor, desc, alocacao;
  if (pct < 0.35) {
    perfil    = 'Conservador';
    cor       = 'var(--blue)';
    desc      = 'Você prioriza segurança e preservação do capital. Prefere investimentos previsíveis com menor volatilidade.';
    alocacao  = [['Renda Fixa (Tesouro/CDB/LCI)', 70], ['Fundo de Renda Fixa', 20], ['FIIs de Papel', 10]];
  } else if (pct < 0.60) {
    perfil    = 'Moderado';
    cor       = 'var(--amber)';
    desc      = 'Você busca equilíbrio entre segurança e crescimento, tolerando alguma volatilidade por retornos melhores.';
    alocacao  = [['Renda Fixa', 50], ['FIIs / ETFs', 30], ['Ações BR', 15], ['Cripto (BTC/ETH)', 5]];
  } else if (pct < 0.80) {
    perfil    = 'Arrojado';
    cor       = 'var(--amber)';
    desc      = 'Você aceita volatilidade significativa em busca de retornos acima da média. Tem horizonte de longo prazo.';
    alocacao  = [['Ações BR / BDRs', 40], ['ETFs internacionais', 20], ['Renda Fixa', 25], ['Cripto', 10], ['FIIs', 5]];
  } else {
    perfil    = 'Agressivo';
    cor       = 'var(--red)';
    desc      = 'Você aceita alta volatilidade e risco em busca de retornos máximos. Tem experiência com mercados.';
    alocacao  = [['Ações BR e internacionais', 40], ['Cripto', 25], ['ETFs alavancados', 15], ['Renda Fixa', 15], ['Derivativos / Opções', 5]];
  }

  const hasEmergencia = (_onbAnswers.emergencia?.val || 'nao') !== 'nao';
  const profile = { perfil, total, max, pct, alocacao, answers: _onbAnswers, hasEmergencia };
  Auth.updateSuitability(profile);
  _renderOnbResult(profile, panel);
}

function _renderOnbResult(profile, panel) {
  const emergAlert = !profile.hasEmergencia
    ? `<div style="background:var(--red-dim);border:1px solid rgba(192,57,43,.3);border-radius:var(--radius-md);padding:12px 16px;margin-bottom:16px;font-size:12px;color:#E07070;line-height:1.7">
        ⚠ <strong>Atenção:</strong> Você não possui reserva de emergência. Antes de qualquer investimento, recomendamos guardar de 3 a 6 meses de gastos em uma conta de liquidez diária (Tesouro Selic ou CDB com liquidez diária). Sem essa base, imprevistos podem forçar você a resgatar investimentos no pior momento.
       </div>`
    : '';

  panel.innerHTML = `
    <div class="ia-sec-hd">
      <div>
        <div class="ia-sec-title">Seu Perfil de Investidor</div>
        <div class="ia-sec-sub">Resultado do questionário de suitability</div>
      </div>
      <button class="ia-btn-ghost" onclick="refazerPerfil()">Refazer questionário</button>
    </div>

    ${emergAlert}

    <div class="ia-score-ring" style="margin-bottom:16px">
      <div class="ia-ring-num" style="color:${_perfilColor(profile.perfil)};font-size:38px;min-width:auto;padding:0 8px">${profile.perfil}</div>
      <div>
        <div class="ia-ring-title">Perfil identificado</div>
        <div class="ia-ring-sub">${profile.desc || _perfilDesc(profile.perfil)}</div>
        <div class="ia-ring-sub" style="margin-top:4px">Pontuação: ${profile.total} / ${profile.max} (${Math.round(profile.pct * 100)}%)</div>
      </div>
    </div>

    <div class="ia-sec-hd"><div class="ia-sec-title" style="font-size:14px">Alocação Sugerida para seu Perfil</div></div>
    <div class="ia-sim-block" style="margin-bottom:16px">
      ${(profile.alocacao || []).map(([classe, pct]) => `
        <div class="ia-sim-row" style="grid-template-columns:1fr 80px 50px">
          <span class="ia-sim-label" style="font-size:12px">${classe}</span>
          <div style="background:var(--surface-3);border-radius:100px;height:6px;overflow:hidden">
            <div style="background:var(--gold);height:100%;width:${pct}%;border-radius:100px"></div>
          </div>
          <span class="ia-sim-val" style="font-size:13px">${pct}%</span>
        </div>`).join('')}
    </div>

    <div class="ia-sec-hd"><div class="ia-sec-title" style="font-size:14px">Dicas para o seu Perfil</div></div>
    <div class="ia-ai-box" id="onb-dicas">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">Orientação personalizada</span></div>
      <div class="ia-ai-bd" id="onb-dicas-bd">${dots()}</div>
    </div>
  `;

  _loadOnbDicas(profile);
}

async function _loadOnbDicas(profile) {
  const bd = document.getElementById('onb-dicas-bd');
  if (!bd) return;

  try {
    const r = await API.ask(
      `Perfil: ${profile.perfil}. Respostas: ${JSON.stringify(profile.answers)}. Reserva de emergência: ${profile.hasEmergencia ? 'tem' : 'não tem'}. Cenário: Selic 14,5%, IPCA 5,53%. Dê orientações práticas e personalizadas: o que deve fazer nos próximos 30 dias, quais produtos evitar, quais buscar. Máximo 4 parágrafos.`,
      'Consultor financeiro pessoal. Português claro, didático, sem jargões. Foco no investidor iniciante.',
      900
    );
    bd.innerHTML = fmt(r);
  } catch(e) { bd.innerHTML = `Erro ao carregar orientações: ${e.message}`; }
}

function refazerPerfil() {
  const s = Auth.getSession();
  if (!s) return;
  const users = JSON.parse(localStorage.getItem(Auth.USERS_KEY) || '{}');
  if (users[s.email]) { users[s.email].profile = null; localStorage.setItem(Auth.USERS_KEY, JSON.stringify(users)); }
  renderOnboarding();
}

function _perfilColor(p) {
  const m = { Conservador:'var(--blue)', Moderado:'var(--amber)', Arrojado:'var(--amber)', Agressivo:'var(--red)' };
  return m[p] || 'var(--gold)';
}

function _perfilDesc(p) {
  const m = {
    Conservador: 'Prioriza segurança e preservação do capital com investimentos de baixa volatilidade.',
    Moderado:    'Busca equilíbrio entre segurança e crescimento, tolerando alguma volatilidade.',
    Arrojado:    'Aceita maior volatilidade em busca de retornos superiores no longo prazo.',
    Agressivo:   'Tolera alta volatilidade e risco em busca do máximo retorno.',
  };
  return m[p] || '';
}
