/**
 * auth.js — Autenticação híbrida: credenciais no backend, cache em localStorage.
 *
 * Métodos síncronos (getSession, isLogged, can, getPlan, prefix) leem do cache.
 * Métodos de mutação (register, login, logout) chamam o backend.
 */
const Auth = {
  SESSION_KEY: 'investai_session_v1',
  USERS_KEY:   'investai_users_v1',

  // Limites por plano
  PLANS: {
    free:    { label: 'Gratuito', portfolioLimit: 3,        alertas: false, consultor: false, painel: false, oport: false, simulador: false, diario: false, metas: false },
    pro:     { label: 'Pro',      portfolioLimit: Infinity,  alertas: true,  consultor: false, painel: false, oport: true,  simulador: true,  diario: true,  metas: true  },
    premium: { label: 'Premium',  portfolioLimit: Infinity,  alertas: true,  consultor: true,  painel: true,  oport: true,  simulador: true,  diario: true,  metas: true  },
  },

  ADMINS: ['rafaellmathias85@gmail.com'],

  // ── Validações locais ─────────────────────────────────────
  _EMAIL_RE: /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/,
  _validateEmail(email)    { if (!email || !this._EMAIL_RE.test(email)) throw new Error('Formato de e-mail inválido.'); },
  _validatePassword(pass)  { if (!pass || pass.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres.'); if (pass.length > 128) throw new Error('Senha muito longa.'); },

  // ── Hash fraco (somente para migração de contas localStorage antigas) ──
  _hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  },

  // ── Lockout local (UX — brute force bloqueado também no backend) ───────
  _loginAttempts: {},
  _LOCKOUT_MAX: 5,
  _LOCKOUT_MS:  15 * 60 * 1000,

  _checkLockout(email) {
    const a = this._loginAttempts[email];
    if (!a || a.count < this._LOCKOUT_MAX) return;
    const remaining = this._LOCKOUT_MS - (Date.now() - a.ts);
    if (remaining > 0) throw new Error(`Muitas tentativas. Tente em ${Math.ceil(remaining / 60000)} minuto(s).`);
    delete this._loginAttempts[email];
  },
  _recordFail(email) {
    if (!this._loginAttempts[email]) this._loginAttempts[email] = { count: 0, ts: 0 };
    this._loginAttempts[email].count++;
    this._loginAttempts[email].ts = Date.now();
  },
  _clearFail(email) { delete this._loginAttempts[email]; },

  // ── Chamada ao backend ────────────────────────────────────
  async _api(method, path, body) {
    const session = this.getSession();
    const headers = { 'Content-Type': 'application/json' };
    if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

    const res = await fetch(`/api/auth${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  // ── Cache local após login/register ──────────────────────
  _cacheSession(data) {
    if (!data || !data.user) throw new Error('Resposta inválida do servidor. Tente novamente.');
    localStorage.setItem(this.SESSION_KEY, JSON.stringify({
      id:     data.user.email,
      name:   data.user.name,
      email:  data.user.email,
      avatar: data.user.avatar || null,
      token:  data.token,
      exp:    data.expiresAt,
    }));
    // Salva perfil do usuário para métodos síncronos (currentUser, can, etc.)
    const users = this._users();
    users[data.user.email] = {
      id:      data.user.email,
      name:    data.user.name,
      email:   data.user.email,
      avatar:  data.user.avatar || null,
      plan:    data.user.plan    || 'free',
      planExp: data.user.planExp || null,
      profile: data.user.profile || null,
      ph:      null,  // senha não volta ao client
    };
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  },

  // ── Registro ──────────────────────────────────────────────
  async register(name, email, password) {
    if (!name || name.trim().length < 2) throw new Error('Nome deve ter ao menos 2 caracteres.');
    this._validateEmail(email.toLowerCase().trim());
    this._validatePassword(password);

    const data = await this._api('POST', '/register', { name: name.trim(), email: email.toLowerCase().trim(), password });
    this._cacheSession(data);
    return data.user;
  },

  // ── Login ─────────────────────────────────────────────────
  async login(email, password) {
    const key = email.toLowerCase().trim();
    this._validateEmail(key);
    this._checkLockout(key);

    let data;
    try {
      data = await this._api('POST', '/login', { email: key, password });
    } catch (e) {
      // Migração automática: conta existe só no localStorage (criada antes do backend)
      if (e.message === 'E-mail não encontrado.') {
        const localUser = this._users()[key];
        if (localUser && localUser.ph && localUser.ph === this._hash(password)) {
          // Senha local bate — auto-registra no backend
          try {
            data = await this._api('POST', '/register', { name: localUser.name, email: key, password });
          } catch (migrErr) {
            console.warn('[auth] migração automática falhou:', migrErr.message);
            this._recordFail(key);
            throw e;
          }
        } else {
          this._recordFail(key);
          throw e;
        }
      } else {
        if (e.message === 'Senha incorreta.') this._recordFail(key);
        throw e;
      }
    }

    this._clearFail(key);
    this._cacheSession(data);
    return data.user;
  },

  // ── Logout ────────────────────────────────────────────────
  async logout() {
    // Fire-and-forget para o servidor
    this._api('POST', '/logout', {}).catch(() => {});
    localStorage.removeItem(this.SESSION_KEY);
  },

  // ── Validação de sessão no servidor (App.init) ────────────
  async validateSession() {
    const s = this.getSession();
    if (!s) return false;
    try {
      const data = await this._api('GET', '/me');
      // Atualiza cache com dados frescos do servidor
      const users = this._users();
      if (users[s.email]) {
        users[s.email].plan    = data.plan    || 'free';
        users[s.email].planExp = data.planExp || null;
        users[s.email].profile = data.profile || null;
      }
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
      return true;
    } catch (e) {
      console.warn('[auth] validateSession falhou:', e.message);
      localStorage.removeItem(this.SESSION_KEY);
      return false;
    }
  },

  // ── Reset de senha ────────────────────────────────────────
  async requestPasswordReset(email) {
    const key = email.toLowerCase().trim();
    this._validateEmail(key);
    return this._api('POST', '/reset-request', { email: key });
  },

  async resetPassword(token, password) {
    this._validatePassword(password);
    return this._api('POST', '/reset-password', { token, password });
  },

  // ── Métodos síncronos (leem do cache) ─────────────────────
  getSession() {
    try {
      const s = JSON.parse(localStorage.getItem(this.SESSION_KEY));
      if (!s || Date.now() > s.exp) { this.logout(); return null; }
      return s;
    } catch { return null; }
  },

  isLogged()  { return !!this.getSession(); },

  _users() {
    try { return JSON.parse(localStorage.getItem(this.USERS_KEY)) || {}; }
    catch { return {}; }
  },

  currentUser() {
    const s = this.getSession();
    if (!s) return null;
    return this._users()[s.email] || null;
  },

  updateSuitability(answers) {
    const s = this.getSession();
    if (!s) return;
    const users = this._users();
    if (users[s.email]) {
      users[s.email].profile = answers;
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    }
    // Sync para o servidor (fire-and-forget)
    this._api('POST', '/update-profile', { profile: answers }).catch(() => {});
  },

  // ── Planos ────────────────────────────────────────────────
  getPlan() {
    const u = this.currentUser();
    if (!u) return 'free';
    if (this.ADMINS.includes((u.email || '').toLowerCase())) return 'premium';
    if (u.planExp && Date.now() > u.planExp) return 'free';
    return u.plan || 'free';
  },
  getPlanConfig() { return this.PLANS[this.getPlan()] || this.PLANS.free; },
  can(feature)    { return !!this.getPlanConfig()[feature]; },

  setPlan(plan, days = 365) {
    const s = this.getSession();
    if (!s) return;
    const users = this._users();
    if (!users[s.email]) return;
    users[s.email].plan    = plan;
    users[s.email].planExp = plan === 'free' ? null : Date.now() + days * 86400000;
    localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
  },

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
          localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
        }
      }
    } catch (_) {}
  },

  prefix() {
    const s = this.getSession();
    return s ? s.id + '_' : 'guest_';
  },
};
