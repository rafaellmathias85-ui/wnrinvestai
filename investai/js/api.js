/**
 * api.js
 * ------
 * Todas as chamadas à Anthropic passam por este módulo.
 *
 * Estratégia de chamada:
 *   1. Backend proxy  /api/ai  (chave protegida no servidor — produção)
 *   2. Fallback direto para api.anthropic.com (desenvolvimento local sem backend)
 *
 * Inclui rate-limiting client-side e disclaimer obrigatório em todos os prompts.
 */

const _DISCLAIMER_SYS =
  '\n\nIMPORTANTE — AVISO LEGAL: Você é uma ferramenta de análise financeira informativa. ' +
  'Não faça indicações de investimento nem recomende compra ou venda de ativos específicos de forma imperativa. ' +
  'Sempre que apresentar uma análise, lembre o usuário de consultar um assessor financeiro certificado (CFP/CPA-20) ' +
  'antes de tomar qualquer decisão de investimento.';

const API = {
  // ── Rate limiting: máx 12 chamadas por minuto por sessão ────
  _calls: [],
  _RATE_LIMIT:  12,
  _RATE_WINDOW: 60 * 1000,

  _checkRateLimit() {
    const now = Date.now();
    this._calls = this._calls.filter(t => now - t < this._RATE_WINDOW);
    if (this._calls.length >= this._RATE_LIMIT)
      throw new Error('Muitas análises solicitadas. Aguarde um momento antes de tentar novamente.');
    this._calls.push(now);
  },

  async ask(userMessage, systemPrompt = '', maxTokens = CONFIG.MAX_TOKENS) {
    this._checkRateLimit();
    const fullSystem = systemPrompt + _DISCLAIMER_SYS;

    // ── Tentativa 1: Backend proxy (chave protegida no servidor) ──
    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, system: fullSystem, maxTokens }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return d.text ?? '';
      // 503 = backend sem chave configurada → cai no fallback direto
      if (r.status !== 503) throw new Error(d.error || `HTTP ${r.status}`);
    } catch (e) {
      // Erro de rede ou 503 → tenta fallback direto; outros erros relança
      const isNetwork = e instanceof TypeError;
      const is503     = e.message?.includes('503') || e.message?.includes('não configurado');
      if (!isNetwork && !is503) throw e;
    }

    // ── Fallback: chamada direta (dev local sem backend) ──────────
    const key = (typeof CONFIG !== 'undefined' && CONFIG.ANTHROPIC_API_KEY) || '';
    if (!key || key === 'SUA_CHAVE_ANTHROPIC_AQUI')
      throw new Error('Adicione ANTHROPIC_API_KEY no .env do backend ou no js/config.js para desenvolvimento local.');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: maxTokens,
        system:     fullSystem,
        messages:   [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  },
};
