/**
 * auth.js — Sistema de autenticação multi-usuário (localStorage)
 *
 * Planos: free | pro | premium
 * Para ativar um plano manualmente (demo/testes):
 *   Auth.setPlan('pro')  ou  Auth.setPlan('premium')
 */
const Auth = {
  USERS_KEY:   'investai_users_v1',
  SESSION_KEY: 'investai_session_v1',

  // Limites por plano
  PLANS: {
    free:    { label: 'Gratuito', portfolioLimit: 3, alertas: false, consultor: false, painel: false, oport: false, simulador: false, diario: false, metas: false },
    pro:     { label: 'Pro',      portfolioLimit: Infinity, alertas: true, consultor: false, painel: false, oport: true, simulador: true, diario: true, metas: true },
    premium: { label: 'Premium',  portfolioLimit: Infinity, alertas: true, consultor: true, painel: true, oport: true, simulador: true, diario: true, metas: true },
  },

  _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  },

  _users() {
    try { return JSON.parse(localStorage.getItem(this.USERS_KEY)) || {}; }
    catch { return {}; }
  },

  _saveUsers(u) { localStorage.setItem(this.USERS_KEY, JSON.stringify(u)); },

  register(name, email, password) {
    const users = this._users();
    const key   = email.toLowerCase().trim();
    if (users[key]) throw new Error('Este e-mail já está cadastrado.');
    const user = {
      id: 'u' + Date.now(), name, email: key,
      ph: this._hash(password), googleId: null,
      avatar: null, profile: null,
      plan: 'free', planExp: null,
      createdAt: new Date().toISOString(),
    };
    users[key] = user;
    this._saveUsers(users);
    this._session(user);
    return user;
  },

  login(email, password) {
    const users = this._users();
    const key   = email.toLowerCase().trim();
    const u     = users[key];
    if (!u)   throw new Error('E-mail não encontrado.');
    if (!u.ph) throw new Error('Conta Google — use o botão "Entrar com Google".');
    if (u.ph !== this._hash(password)) throw new Error('Senha incorreta.');
    this._session(u);
    return u;
  },

  loginGoogle(profile) {
    const users = this._users();
    const key   = profile.email.toLowerCase();
    if (!users[key]) {
      users[key] = {
        id: 'g' + Date.now(), name: profile.name,
        email: key, ph: null,
        googleId: profile.sub, avatar: profile.picture,
        profile: null, plan: 'free', planExp: null,
        createdAt: new Date().toISOString(),
      };
    } else {
      users[key].avatar   = profile.picture;
      users[key].googleId = profile.sub;
    }
    this._saveUsers(users);
    this._session(users[key]);
    return users[key];
  },

  _session(user) {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      id: user.id, name: user.name, email: user.email,
      avatar: user.avatar || null,
      exp: Date.now() + 7 * 86400000,
    }));
  },

  getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(this.SESSION_KEY));
      if (!s || Date.now() > s.exp) { this.logout(); return null; }
      return s;
    } catch { return null; }
  },

  isLogged()  { return !!this.getSession(); },

  currentUser() {
    const s = this.getSession();
    if (!s) return null;
    return this._users()[s.email] || null;
  },

  updateSuitability(answers) {
    const s = this.getSession();
    if (!s) return;
    const users = this._users();
    if (users[s.email]) { users[s.email].profile = answers; this._saveUsers(users); }
  },

  // Emails com acesso premium permanente (administradores)
  ADMINS: ['rafaellmathias85@gmail.com'],

  // ── Planos ──────────────────────────────────────────────
  getPlan() {
    const u = this.currentUser();
    if (!u) return 'free';
    if (this.ADMINS.includes(u.email.toLowerCase())) return 'premium';
    if (u.planExp && Date.now() > u.planExp) return 'free';
    return u.plan || 'free';
  },

  getPlanConfig() { return this.PLANS[this.getPlan()] || this.PLANS.free; },

  can(feature) { return !!this.getPlanConfig()[feature]; },

  setPlan(plan, days = 365) {
    const s = this.getSession();
    if (!s) return;
    const users = this._users();
    if (!users[s.email]) return;
    users[s.email].plan    = plan;
    users[s.email].planExp = plan === 'free' ? null : Date.now() + days * 86400000;
    this._saveUsers(users);
  },

  // Sincroniza plano do backend (chamado após login)
  async syncPlan() {
    const s = this.getSession();
    if (!s || this.ADMINS.includes(s.email)) return;
    try {
      const r = await fetch(`/api/plan?email=${encodeURIComponent(s.email)}`);
      if (!r.ok) return;
      const { plan, planExp } = await r.json();
      if (plan && plan !== 'free') {
        const users = this._users();
        if (users[s.email]) {
          users[s.email].plan    = plan;
          users[s.email].planExp = planExp || null;
          this._saveUsers(users);
        }
      }
    } catch (_) { /* fallback offline */ }
  },

  logout() { localStorage.removeItem(this.SESSION_KEY); },

  prefix() {
    const s = this.getSession();
    return s ? s.id + '_' : 'guest_';
  },
};
