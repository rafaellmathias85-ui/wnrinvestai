/**
 * painel.js
 * ---------
 * Renders the Power BI-style dashboard with Chart.js.
 */

// Keep references to destroy before re-rendering
const chartInstances = {};

function renderPainel() {
  if (typeof planGate === 'function' && planGate('painel', 'panel-painel', 'premium')) return;
  // Destroy previous chart instances to avoid canvas conflicts
  Object.values(chartInstances).forEach(c => { try { c.destroy(); } catch {} });
  Object.keys(chartInstances).forEach(k => delete chartInstances[k]);

  const list = App.filtered();
  const tot  = list.reduce((s, i) => s + i.saldo, 0) || 0;
  const rec  = list.reduce((s, i) => s + i.recorrencia, 0) || 0;
  const taxa = (list.length ? list.reduce((s, i) => s + i.rendimento, 0) / list.length : 10) / 100 / 12;
  const base = tot || 80000;

  // Historical (simulated)
  const m6   = ['Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai'];
  const evol = m6.map((_, i) => Math.round(base * (0.83 + i * 0.035) + (Math.random() - 0.5) * base * 0.015));
  evol[5] = Math.round(base);

  // Projection
  const mp   = ['Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const proj = mp.map((_, i) => Math.round(base * Math.pow(1 + taxa, i + 1) + rec * i));

  // Distribution by asset type
  const typeMap = {};
  list.forEach(i => { typeMap[i.tipo] = (typeMap[i.tipo] || 0) + i.saldo; });
  const typeLabels = Object.keys(typeMap);
  const typeData   = Object.values(typeMap);

  // Score data
  const scoreData = list.map(i => ({
    label: (i.nome || i.tipo).substring(0, 11),
    score: calcScore(i, tot),
  }));

  const sg      = list.length ? list.reduce((s, i) => s + calcScore(i, tot), 0) / list.length : 0;
  const evoPct  = base > 0 ? ((evol[5] - evol[0]) / evol[0] * 100) : 0;

  document.getElementById('panel-painel').innerHTML = `
    <div class="ia-metrics">
      <div class="ia-mc"><div class="ia-ml">Patrimônio</div><div class="ia-mv ia-gold">${fmtR(tot)}</div></div>
      <div class="ia-mc"><div class="ia-ml">Evolução 6 meses</div><div class="ia-mv ia-pos">+${evoPct.toFixed(1)}%</div></div>
      <div class="ia-mc"><div class="ia-ml">Projeção dez/25</div><div class="ia-mv ia-pos">${fmtR(proj[proj.length - 1])}</div></div>
      <div class="ia-mc"><div class="ia-ml">Score carteira</div><div class="ia-mv ${sg >= 7 ? 'ia-pos' : sg >= 5 ? 'ia-warn' : 'ia-neg'}">${sg.toFixed(1)}/10</div></div>
    </div>

    <div class="ia-pbi-grid">
      <div class="ia-pbi-card ia-pbi-full">
        <div class="ia-pbi-title">Evolução patrimonial — 6 meses</div>
        <div class="ia-chart-wrap" style="height:170px"><canvas id="c-evol" role="img" aria-label="Evolução do patrimônio"></canvas></div>
      </div>
      <div class="ia-pbi-card ia-pbi-full">
        <div class="ia-pbi-title">Projeção — próximos 7 meses</div>
        <div class="ia-chart-wrap" style="height:150px"><canvas id="c-proj" role="img" aria-label="Projeção patrimonial"></canvas></div>
      </div>
      <div class="ia-pbi-card">
        <div class="ia-pbi-title">Distribuição por classe</div>
        <div class="ia-chart-wrap" style="height:180px"><canvas id="c-dist" role="img" aria-label="Distribuição por tipo de ativo"></canvas></div>
      </div>
      <div class="ia-pbi-card">
        <div class="ia-pbi-title">Score de saúde por ativo</div>
        <div class="ia-chart-wrap" style="height:180px"><canvas id="c-score" role="img" aria-label="Score de saúde por ativo"></canvas></div>
      </div>
    </div>
  `;

  // Draw charts after DOM is ready
  setTimeout(() => drawCharts(m6, evol, mp, proj, typeLabels, typeData, scoreData), 120);
}

function drawCharts(m6, evol, mp, proj, tL, tD, sData) {
  const tc  = '#4A5060';
  const grd = 'rgba(255,255,255,0.04)';

  const baseOpts = (yFmt) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: tc, font: { size: 10 } }, grid: { color: grd }, border: { color: 'transparent' } },
      y: { ticks: { color: tc, font: { size: 10 }, callback: yFmt }, grid: { color: grd }, border: { color: 'transparent' } },
    },
  });

  const kR = v => 'R$' + Math.round(v / 1000) + 'k';

  chartInstances.evol = new Chart(document.getElementById('c-evol'), {
    type: 'line',
    data: {
      labels: m6,
      datasets: [{ data: evol, borderColor: '#B8965A', borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#B8965A', fill: true, backgroundColor: 'rgba(184,150,90,0.07)', tension: 0.45 }],
    },
    options: baseOpts(kR),
  });

  chartInstances.proj = new Chart(document.getElementById('c-proj'), {
    type: 'line',
    data: {
      labels: mp,
      datasets: [{ data: proj, borderColor: '#3D9970', borderWidth: 2, borderDash: [6, 4], pointRadius: 3, pointBackgroundColor: '#3D9970', fill: true, backgroundColor: 'rgba(61,153,112,0.05)', tension: 0.45 }],
    },
    options: baseOpts(kR),
  });

  const COLORS = ['#B8965A', '#3D9970', '#C07A2B', '#C0392B', '#4A8EC4', '#7A6038'];

  if (tL.length) {
    chartInstances.dist = new Chart(document.getElementById('c-dist'), {
      type: 'doughnut',
      data: {
        labels: tL,
        datasets: [{ data: tD, backgroundColor: COLORS.slice(0, tL.length), borderWidth: 0, hoverOffset: 4 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { color: '#6B7280', font: { size: 10 }, boxWidth: 8, padding: 10 } } },
      },
    });
  } else {
    _emptyCanvas('c-dist');
  }

  if (sData.length) {
    chartInstances.score = new Chart(document.getElementById('c-score'), {
      type: 'bar',
      data: {
        labels: sData.map(d => d.label),
        datasets: [{
          data: sData.map(d => d.score),
          backgroundColor: sData.map(d => d.score >= 7 ? 'rgba(61,153,112,0.75)' : d.score >= 5 ? 'rgba(192,122,43,0.75)' : 'rgba(192,57,43,0.75)'),
          borderWidth: 0,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: tc, font: { size: 10 } }, grid: { display: false }, border: { color: 'transparent' } },
          y: { min: 0, max: 10, ticks: { color: tc, font: { size: 10 } }, grid: { color: grd }, border: { color: 'transparent' } },
        },
      },
    });
  } else {
    _emptyCanvas('c-score');
  }
}

function _emptyCanvas(id) {
  const cx = document.getElementById(id).getContext('2d');
  cx.fillStyle = '#4A5060';
  cx.font = '12px DM Sans, sans-serif';
  cx.textAlign = 'center';
  cx.fillText('Cadastre ativos para ver', 120, 90);
}
