/**
 * app.js — Controlador central. Gerencia auth, estado global e roteamento.
 */

const App = {
  portfolio:   [],
  diary:       [],
  currentMode: 'cons',

  async init() {
    // ── Auth check ─────────────────────────────────────
    if (!Auth.isLogged()) {
      window.location.href = 'login.html';
      return;
    }

    // ── Carregar dados do usuário ──────────────────────
    this.portfolio = Storage.get(CONFIG.STORAGE_PORTFOLIO) || [];
    this.diary     = Storage.get(CONFIG.STORAGE_DIARY)     || [];

    // ── Topbar: nome e avatar ──────────────────────────
    const session = Auth.getSession();
    if (session) {
      const nameEl   = document.getElementById('user-name');
      const avatarEl = document.getElementById('user-avatar');
      if (nameEl)   nameEl.textContent = session.name.split(' ')[0];
      if (avatarEl) {
        if (session.avatar) {
          avatarEl.innerHTML = `<img src="${session.avatar}" style="width:26px;height:26px;border-radius:50%;object-fit:cover" onerror="this.parentElement.textContent='${session.name[0].toUpperCase()}'">`;
        } else {
          avatarEl.textContent = session.name[0].toUpperCase();
        }
      }
    }

    // ── Badge de plano ─────────────────────────────────
    const planCfg  = Auth.getPlanConfig();
    const planKey  = Auth.getPlan();
    const planEl   = document.getElementById('plan-badge');
    if (planEl) {
      const styles = {
        free:    'background:rgba(255,255,255,0.06);color:var(--text-tertiary);border:1px solid var(--border)',
        pro:     'background:rgba(74,142,196,0.15);color:#4A8EC4;border:1px solid rgba(74,142,196,0.3)',
        premium: 'background:rgba(184,150,90,0.15);color:var(--gold);border:1px solid var(--gold-dim)',
      };
      planEl.style.cssText = styles[planKey] || styles.free;
      planEl.textContent = planCfg.label;
      planEl.style.display = 'block';
    }

    // ── Aplicar perfil ao modo ─────────────────────────
    const user = Auth.currentUser();
    if (user?.profile?.perfil) {
      const p = user.profile.perfil;
      if (p === 'Conservador') setMode('cons', true);
      else if (['Moderado','Arrojado','Agressivo'].includes(p)) setMode('av', true);
    }

    // ── Ocultar painéis inativos ───────────────────────
    document.querySelectorAll('.ia-panel').forEach(p => {
      if (!p.classList.contains('active')) p.style.display = 'none';
    });

    renderPortfolio();
  },

  savePortfolio() { Storage.set(CONFIG.STORAGE_PORTFOLIO, this.portfolio); },
  saveDiary()     { Storage.set(CONFIG.STORAGE_DIARY,     this.diary);     },

  filtered() {
    return this.portfolio.filter(i => i.mode === this.currentMode);
  },
};

// ── Plan gate helper ────────────────────────────────────
function planGate(feature, panelId, planRequired) {
  if (Auth.can(feature)) return false; // has access
  const labels = { pro: 'Pro', premium: 'Premium' };
  const colors = { pro: '#4A8EC4', premium: 'var(--gold)' };
  document.getElementById(panelId).innerHTML = `
    <div style="text-align:center;padding:64px 20px">
      <div style="font-size:40px;margin-bottom:16px">🔒</div>
      <div style="font-family:var(--font-serif);font-size:22px;color:var(--platinum);margin-bottom:10px">Funcionalidade ${labels[planRequired]}</div>
      <div style="font-size:13px;color:var(--text-secondary);max-width:380px;margin:0 auto 28px;line-height:1.8">
        Esta funcionalidade está disponível no plano <strong style="color:${colors[planRequired]}">${labels[planRequired]}</strong>.
        Faça upgrade para desbloquear.
      </div>
      <button style="padding:12px 32px;background:${colors[planRequired]};color:var(--obsidian);border:none;border-radius:var(--radius-pill);font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;font-family:var(--font-sans)"
        onclick="window.open('landing.html#planos','_blank')">
        Ver planos
      </button>
    </div>`;
  return true; // blocked
}

// ── Mode switch ─────────────────────────────────────────
function setMode(mode, silent = false) {
  App.currentMode = mode;
  ['cons','av'].forEach(x => document.getElementById('mbtn-' + x)?.classList.toggle('active', x === mode));
  if (!silent) {
    const active = document.querySelector('.ia-ntab.active');
    if (active) {
      const m = active.getAttribute('onclick').match(/'(\w+)'/);
      if (m) renderTab(m[1]);
    }
  }
}

// ── Tab routing ─────────────────────────────────────────
function goTab(name, el) {
  document.querySelectorAll('.ia-ntab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');

  document.querySelectorAll('.ia-panel').forEach(p => {
    p.classList.remove('active');
    p.style.display = 'none';
  });

  const panel = document.getElementById('panel-' + name);
  if (panel) { panel.classList.add('active'); panel.style.display = 'block'; }

  renderTab(name);

  // Fechar dropdown se aberto
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = 'none';
}

function renderTab(name) {
  const map = {
    portfolio:  renderPortfolio,
    radar:      renderRadar,
    score:      renderScore,
    oport:      renderOport,
    alertas:    renderAlertas,
    calendario: renderCalendario,
    simulador:  renderSimulador,
    diario:     renderDiario,
    metas:      renderMetas,
    painel:     renderPainel,
    consultor:  renderConsultor,
    onboarding: renderOnboarding,
  };
  if (map[name]) map[name]();
  // Aplica glossário aos badges após render
  setTimeout(() => { if (typeof patchBadges === 'function') patchBadges(); }, 80);
}

// ── User menu ────────────────────────────────────────────
function toggleUserMenu() {
  const dd = document.getElementById('user-dropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const dd   = document.getElementById('user-dropdown');
  const menu = document.getElementById('user-menu');
  if (dd && menu && !menu.contains(e.target)) dd.style.display = 'none';
});

// ── Logout ───────────────────────────────────────────────
function doLogout() {
  // Parar polling de alertas se ativo
  if (typeof AlertasState !== 'undefined' && AlertasState.pollId) {
    clearInterval(AlertasState.pollId);
  }
  Auth.logout();
  window.location.href = 'login.html';
}

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
