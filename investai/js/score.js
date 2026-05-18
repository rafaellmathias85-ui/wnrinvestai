/**
 * score.js — Score de saúde do portfólio com benchmark CDI/IPCA.
 */
function calcScore(inv, totalSaldo) {
  let s = 5;
  if (inv.rendimento > 12)      s += 2;
  else if (inv.rendimento > 9)  s += 1;
  else if (inv.rendimento < 6)  s -= 2;

  const safe  = ['CDB', 'Tesouro Direto', 'LCI/LCA'];
  const risky = ['Ações', 'Cripto'];
  if (App.currentMode === 'cons' && safe.includes(inv.tipo))  s += 1.5;
  if (App.currentMode === 'cons' && risky.includes(inv.tipo)) s -= 3;
  if (App.currentMode === 'av'  && risky.includes(inv.tipo))  s += 1;

  if (totalSaldo > 0) {
    const w = inv.saldo / totalSaldo;
    if (w > 0.65) s -= 2;
    else if (w > 0.5) s -= 1;
  }
  if (inv.recorrencia > 0) s += 0.5;
  return Math.max(0, Math.min(10, Math.round(s * 10) / 10));
}

function renderScore() {
  const list = App.filtered();
  const tot  = list.reduce((s, i) => s + i.saldo, 0);
  const sg   = list.length ? list.reduce((s, i) => s + calcScore(i, tot), 0) / list.length : 0;
  const sc   = sg >= 7 ? 'ia-pos' : sg >= 5 ? 'ia-warn' : 'ia-neg';
  const sl   = sg >= 7 ? 'Portfólio saudável' : sg >= 5 ? 'Atenção recomendada' : 'Revisão urgente';

  // Benchmark
  const rentBruta = list.length ? list.reduce((s, i) => s + i.rendimento, 0) / list.length : 0;
  const cdi  = (RealTime?.macro?.cdi  || 14.65);
  const ipca = (RealTime?.macro?.ipca || 5.53);
  const vsCDI  = rentBruta - cdi;
  const vsIPCA = rentBruta - ipca;

  let h = `
    <div class="ia-score-ring">
      <div class="ia-ring-num ${sc}">${sg.toFixed(1)}</div>
      <div>
        <div class="ia-ring-title">${sl}</div>
        <div class="ia-ring-sub">Rentabilidade · concentração · adequação ao perfil · disciplina de aportes</div>
      </div>
    </div>

    <div class="ia-metrics" style="margin-bottom:16px">
      <div class="ia-mc">
        <div class="ia-ml">Rentab. bruta média</div>
        <div class="ia-mv ia-pos">${rentBruta.toFixed(2)}% a.a.</div>
      </div>
      <div class="ia-mc">
        <div class="ia-ml">vs CDI (${cdi}%)</div>
        <div class="ia-mv ${vsCDI >= 0 ? 'ia-pos' : 'ia-neg'}">${vsCDI >= 0 ? '+' : ''}${vsCDI.toFixed(2)}%</div>
      </div>
      <div class="ia-mc">
        <div class="ia-ml">vs IPCA (${ipca}%)</div>
        <div class="ia-mv ${vsIPCA >= 0 ? 'ia-pos' : 'ia-neg'}">${vsIPCA >= 0 ? '+' : ''}${vsIPCA.toFixed(2)}%</div>
      </div>
      <div class="ia-mc">
        <div class="ia-ml">Rentab. real (acima IPCA)</div>
        <div class="ia-mv ${vsIPCA >= 0 ? 'ia-pos' : 'ia-neg'}">${vsIPCA >= 0 ? '+' : ''}${vsIPCA.toFixed(2)}%</div>
      </div>
    </div>
  `;

  if (!list.length) {
    h += `<div class="ia-empty"><span>—</span>Cadastre investimentos para ver os scores.</div>`;
  } else {
    h += `
      <div class="ia-sec-hd"><div class="ia-sec-title">Score por ativo</div></div>
      <table class="ia-table">
        <thead><tr><th>Produto</th><th>Instituição</th><th>Saldo</th><th>% Carteira</th><th>Score</th><th>Status</th></tr></thead>
        <tbody>
    `;
    list.forEach(inv => {
      const sc   = calcScore(inv, tot);
      const scC  = sc >= 7 ? '#3D9970' : sc >= 5 ? '#C07A2B' : '#C0392B';
      const scCl = sc >= 7 ? 'ia-pos'  : sc >= 5 ? 'ia-warn' : 'ia-neg';
      const pct  = tot > 0 ? (inv.saldo / tot * 100).toFixed(1) : '0.0';

      let alert;
      if (App.currentMode === 'cons' && ['Ações','Cripto'].includes(inv.tipo))
        alert = `<span class="ia-badge ia-b-red">Alto risco</span>`;
      else if (inv.rendimento < 8 && App.currentMode === 'cons')
        alert = `<span class="ia-badge ia-b-amber">Rent. baixa</span>`;
      else if (tot > 0 && inv.saldo / tot > 0.6)
        alert = `<span class="ia-badge ia-b-amber">Concentrado</span>`;
      else if (inv.rendimento < cdi - 2)
        alert = `<span class="ia-badge ia-b-amber">Abaixo CDI</span>`;
      else
        alert = `<span class="ia-badge ia-b-green">Normal</span>`;

      h += `
        <tr>
          <td>
            <span class="ia-badge ${badgeClass(inv.tipo)}" style="cursor:pointer" onclick="showGlossario('${inv.tipo}')">${inv.tipo}</span>
            <span style="color:#8A8F9A;margin-left:6px">${inv.nome}</span>
          </td>
          <td style="color:#6B7280">${inv.banco}</td>
          <td style="font-family:'DM Mono',monospace">${fmtR(inv.saldo)}</td>
          <td style="font-family:'DM Mono',monospace;color:var(--text-tertiary)">${pct}%</td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <div class="ia-sbar"><div class="ia-sbar-fill" style="width:${sc*10}%;background:${scC}"></div></div>
              <span class="${scCl}" style="font-family:'DM Mono',monospace;font-size:12px">${sc}</span>
            </div>
          </td>
          <td>${alert}</td>
        </tr>
      `;
    });
    h += `</tbody></table>`;
  }

  h += `
    <div class="ia-ai-box" style="margin-top:16px">
      <div class="ia-ai-hd"><span class="ia-pulse"></span><span class="ia-ai-label">IA — Alertas e recomendações</span></div>
      <div class="ia-ai-bd" id="score-bd">Selecione uma análise.</div>
    </div>
    <div class="ia-chips">
      <span class="ia-chip" onclick="scoreIA('alertas')">Alertas de saída</span>
      <span class="ia-chip" onclick="scoreIA('melhoria')">Melhorar score</span>
      <span class="ia-chip" onclick="scoreIA('concentracao')">Concentração</span>
      <span class="ia-chip" onclick="scoreIA('benchmark')">Análise vs CDI/IPCA</span>
    </div>
  `;

  document.getElementById('panel-score').innerHTML = h;
}

async function scoreIA(tipo) {
  const bd   = document.getElementById('score-bd');
  bd.innerHTML = dots();
  const list = App.filtered();
  const tot  = list.reduce((s, i) => s + i.saldo, 0);
  const r    = list.map(i => `${i.tipo} "${i.nome}" ${fmtR(i.saldo)} ${i.rendimento}% score ${calcScore(i, tot)}`).join('; ') || 'vazio';
  const cdi  = (RealTime?.macro?.cdi || 14.65);

  const prompts = {
    alertas:      `Portfólio: ${r}. Ativos com risco de desvalorização ou inadequação. Sair agora ou monitorar?`,
    melhoria:     `Portfólio: ${r}. CDI atual: ${cdi}%. Como melhorar a qualidade e superar o CDI? Produtos específicos com percentuais.`,
    concentracao: `Portfólio: ${r}. Como diversificar melhor por ativo, instituição e prazo?`,
    benchmark:    `Portfólio: ${r}. CDI: ${cdi}%, IPCA: ${RealTime?.macro?.ipca||5.53}%. Quais ativos não batem o CDI líquido? O que substituir para proteger o poder de compra real?`,
  };

  try {
    const res = await API.ask(prompts[tipo], 'Gestor de carteiras. Português, direto. Máximo 4 parágrafos.');
    bd.innerHTML = fmt(res);
  } catch { bd.innerHTML = 'Erro de conexão. Tente novamente.'; }
}
