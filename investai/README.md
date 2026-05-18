# InvestAI — Consultoria Financeira Inteligente

Plataforma premium de consultoria financeira com IA integrada.  
Stack: HTML · CSS (vanilla, design tokens) · JavaScript (vanilla, modular) · Chart.js · Anthropic Claude API.

---

## Estrutura de arquivos

```
investai/
├── index.html              # Entry point
├── css/
│   ├── reset.css           # Box-model reset
│   ├── tokens.css          # Design tokens (CSS variables)
│   ├── layout.css          # App shell, topbar, nav, panels, metrics
│   ├── components.css      # Buttons, badges, AI box, table, form, chips…
│   └── charts.css          # Painel BI / Chart.js wrappers
└── js/
    ├── config.js           # API key, model, storage keys
    ├── storage.js          # localStorage abstraction
    ├── api.js              # Anthropic API wrapper
    ├── utils.js            # Shared helpers (fmtR, fmt, dots, etc.)
    ├── portfolio.js        # Portfólio panel
    ├── radar.js            # Radar Macro panel
    ├── score.js            # Score & Alertas panel
    ├── oportunidades.js    # Oportunidades + Calendário + Simulador + Diário
    ├── painel.js           # Painel BI (Chart.js)
    ├── calendario.js       # Stub — move here when splitting
    ├── simulador.js        # Stub — move here when splitting
    ├── diario.js           # Stub — move here when splitting
    └── app.js              # Controller: state, routing, boot
```

---

## Configuração rápida

### 1. Obter a API Key da Anthropic

Acesse [console.anthropic.com](https://console.anthropic.com) e gere uma chave.

### 2. Inserir a chave

Abra `js/config.js` e substitua:

```js
ANTHROPIC_API_KEY: 'YOUR_API_KEY_HERE',
```

> ⚠️ **Nunca** commite a chave no Git.  
> Para produção, use um backend proxy (Node/Express, FastAPI etc.) que
> encaminhe as chamadas à Anthropic mantendo a chave no servidor.

### 3. Rodar localmente

Qualquer servidor HTTP estático funciona:

```bash
# Opção A — VS Code Live Server (extensão recomendada)
# Clique com botão direito em index.html → "Open with Live Server"

# Opção B — Python
python -m http.server 3000

# Opção C — Node
npx serve .
```

Abra `http://localhost:3000` no navegador.

---

## Módulos / Funcionalidades

| Aba | Descrição |
|-----|-----------|
| **Portfólio** | Cadastro de ativos com saldo, rentabilidade, recorrência e aporte. Dados persistidos no localStorage. |
| **Radar Macro** | Painel de indicadores (Selic, IPCA, Dólar, VIX, Ibovespa, BTC) com análise da IA. |
| **Score & Alertas** | Score 0–10 por ativo com alertas de risco. IA identifica saídas preventivas. |
| **Oportunidades** | IA analisa o portfólio e aponta oportunidades, diversificação e hedges. |
| **Calendário** | Eventos de risco (Copom, IPCA, FOMC) com orientação de posicionamento. |
| **Simulador** | Sliders para simular variação de Selic, dólar, BTC e Ibovespa com impacto no patrimônio. |
| **Diário** | Registro de decisões (compra/venda) avaliadas pela IA. |
| **Painel BI** | 4 gráficos: evolução 6 meses, projeção 7 meses, distribuição por classe, score por ativo. |

---

## Próximos passos sugeridos

- [ ] Backend proxy para proteger a API key  
- [ ] Integração com API de cotações em tempo real (Brapi, Yahoo Finance)  
- [ ] Autenticação de usuário (múltiplos portfólios)  
- [ ] PWA / notificações de alerta  
- [ ] Exportar portfólio como PDF / CSV  
- [ ] Dark/light theme toggle  

---

## Tecnologias

- **Claude Sonnet 4** via Anthropic Messages API  
- **Chart.js 4.4** para gráficos  
- **Cormorant Garamond + DM Mono + DM Sans** (Google Fonts)  
- Sem frameworks — vanilla HTML/CSS/JS puro  
