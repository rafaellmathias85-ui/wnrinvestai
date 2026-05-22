/**
 * api.js
 * ------
 * Todas as chamadas à Anthropic passam por este módulo.
 * Inclui rate-limiting client-side e disclaimer obrigatório.
 *
 * Para produção: substituir o fetch target por um endpoint
 * próprio no backend, mantendo a chave fora do browser.
 */

const _DISCLAIMER_SYS = '\n\nIMPORTANTE — AVISO LEGAL: Você é uma ferramenta de análise financeira informativa. ' +
  'Não faça indicações de investimento nem recomende compra ou venda de ativos específicos de forma imperativa. ' +
  'Sempre que apresentar uma análise, lembre o usuário de consultar um assessor financeiro certificado (CFP/CPA-20) ' +
  'antes de tomar qualquer decisão de investimento.';

const API = {
  // ── Rate limiting: máx 12 chamadas por minuto por sessão ────
  _calls: [],
  _RATE_LIMIT: 12,
  _RATE_WINDOW: 60 * 1000,

  _checkRateLimit() {
    const now = Date.now();
    this._calls = this._calls.filter(t => now - t < this._RATE_WINDOW);
    if (this._calls.length >= this._RATE_LIMIT) {
      throw new Error('Muitas análises solicitadas. Aguarde um momento antes de tentar novamente.');
    }
    this._calls.push(now);
  },

  async ask(userMessage, systemPrompt = '', maxTokens = CONFIG.MAX_TOKENS) {
    this._checkRateLimit();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ⚠️ Mover esta chave para backend proxy antes de produção
        'x-api-key': CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: maxTokens,
        system:     systemPrompt + _DISCLAIMER_SYS,
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
