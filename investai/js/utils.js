/**
 * utils.js
 * --------
 * Shared helper functions used across all modules.
 */

/** Format a number as Brazilian currency string */
function fmtR(value) {
  return 'R$ ' + Math.round(value).toLocaleString('pt-BR');
}

/** Format an input field value with thousand separators */
function fmtI(el) {
  const raw = el.value.replace(/\D/g, '');
  el.value = raw ? parseInt(raw, 10).toLocaleString('pt-BR') : '';
}

/** Parse a formatted Brazilian currency input to float */
function parseVal(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return parseFloat(el.value.replace(/\./g, '').replace(',', '.')) || 0;
}

/** Today's date formatted as pt-BR */
function today() {
  return new Date().toLocaleDateString('pt-BR');
}

/** Convert markdown-lite bold + newlines to HTML */
function fmt(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

/** Escape single quotes for use inside onclick attributes */
function esc(str) {
  return str.replace(/'/g, "\\'");
}

/** Return the HTML for the animated loading dots */
function dots() {
  return `<span class="ia-dots">
    <span class="ia-dot"></span>
    <span class="ia-dot"></span>
    <span class="ia-dot"></span>
  </span>`;
}

/** Map an asset type to its badge CSS class */
function badgeClass(type) {
  const map = {
    'CDB':            'ia-b-blue',
    'Tesouro Direto': 'ia-b-green',
    'LCI/LCA':        'ia-b-green',
    'Ouro':           'ia-b-amber',
    'Ações':          'ia-b-red',
    'Cripto':         'ia-b-red',
    'FII':            'ia-b-amber',
    'Fundo':          'ia-b-blue',
    'ETF':            'ia-b-blue',
    'Investimento Coletivo': 'ia-b-amber',
  };
  return map[type] || 'ia-b-neutral';
}
