/**
 * config.example.js — Template de configuração
 * ---------------------------------------------
 * Copie este arquivo para config.js e preencha com suas chaves reais.
 *
 *   cp config.example.js config.js
 *
 * NUNCA commite config.js com chaves reais — ele está no .gitignore.
 */

const CONFIG = {
  // Obtenha sua chave em https://console.anthropic.com
  ANTHROPIC_API_KEY: 'SUA_CHAVE_ANTHROPIC_AQUI',

  // Google OAuth — não utilizado (removido)
  GOOGLE_CLIENT_ID: '',

  MODEL:      'claude-sonnet-4-6',
  MAX_TOKENS: 900,

  STORAGE_PORTFOLIO: 'investai_prem_v2',
  STORAGE_DIARY:     'investai_diary_v2',

  VERSION: '2.0.0',
};
