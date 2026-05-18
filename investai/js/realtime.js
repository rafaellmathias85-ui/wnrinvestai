/**
 * realtime.js — Serviço de preços em tempo real
 * Fontes: CoinGecko (cripto, grátis) + Brapi.dev (ações BR, grátis)
 */
const RealTime = {
  _cache: {},        // { key: { data, ts } }
  CACHE_MS: 60000,   // 1 minuto de cache

  // ── Cripto via CoinGecko ────────────────────────────
  COIN_IDS: {
    BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
    BNB: 'binancecoin', ADA: 'cardano', XRP: 'ripple',
    DOT: 'polkadot', MATIC: 'matic-network',
  },

  async fetchCrypto(symbols) {
    const ids = symbols.map(s => this.COIN_IDS[s.toUpperCase()] || s.toLowerCase()).join(',');
    const ckey = 'crypto_' + ids;
    if (this._cached(ckey)) return this._cache[ckey].data;

    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl,usd&include_24hr_change=true&include_24hr_vol=true`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('CoinGecko indisponível.');
    const raw  = await res.json();

    // Normaliza: { BTC: { priceBRL, priceUSD, change24h, vol24hBRL } }
    const result = {};
    symbols.forEach(s => {
      const id   = this.COIN_IDS[s.toUpperCase()] || s.toLowerCase();
      const coin = raw[id];
      if (coin) result[s.toUpperCase()] = {
        symbol:    s.toUpperCase(),
        priceBRL:  coin.brl,
        priceUSD:  coin.usd,
        change24h: coin.brl_24h_change || 0,
        vol24h:    coin.brl_24h_vol    || 0,
      };
    });
    this._cache[ckey] = { data: result, ts: Date.now() };
    return result;
  },

  // ── Ações / FIIs BR — Brapi com fallback Yahoo Finance ──
  async fetchStocks(tickers) {
    const key = 'stocks_' + tickers.join('_');
    if (this._cached(key)) return this._cache[key].data;

    // Tentativa 1: Brapi
    try {
      const url = `https://brapi.dev/api/quote/${tickers.join(',')}?fundamental=false`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error('Brapi indisponível');
      const raw  = await res.json();
      if (!raw.results?.length) throw new Error('Brapi sem resultados');

      const result = {};
      raw.results.forEach(q => {
        result[q.symbol] = {
          symbol:    q.symbol,
          name:      q.shortName || q.symbol,
          price:     q.regularMarketPrice,
          change24h: q.regularMarketChangePercent || 0,
          change:    q.regularMarketChange || 0,
          high:      q.regularMarketDayHigh,
          low:       q.regularMarketDayLow,
          vol:       q.regularMarketVolume,
          updatedAt: q.regularMarketTime,
        };
      });
      this._cache[key] = { data: result, ts: Date.now() };
      return result;
    } catch (_) {}

    // Tentativa 2: Yahoo Finance (.SA)
    const settled = await Promise.allSettled(tickers.map(t => this._yahooB3Quote(t)));
    const result  = {};
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') result[tickers[i]] = r.value;
    });
    if (Object.keys(result).length) {
      this._cache[key] = { data: result, ts: Date.now() };
      return result;
    }

    throw new Error('Dados B3 temporariamente indisponíveis.');
  },

  async _yahooB3Quote(ticker) {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?interval=1d&range=1d`
    );
    if (!r.ok) throw new Error('Yahoo indisponível');
    const d    = await r.json();
    const meta = d.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) throw new Error('Sem dados');
    return {
      symbol:    ticker,
      name:      meta.shortName || ticker,
      price:     meta.regularMarketPrice,
      change24h: meta.regularMarketChangePercent || 0,
      change:    meta.regularMarketChange || 0,
      high:      meta.regularMarketDayHigh,
      low:       meta.regularMarketDayLow,
      vol:       meta.regularMarketVolume,
      updatedAt: meta.regularMarketTime,
    };
  },

  // ── Indicadores macro (atualizados via fetchMacro) ──
  macro: {
    selic:    14.50,
    ipca:     5.53,
    dolar:    5.70,
    vix:      22.1,
    ibov:     135800,
    btc:      103000,
    cdi:      14.40,
    updatedAt: null,
  },

  MACRO_CACHE_KEY: 'investai_macro_v3',
  MACRO_TTL: 60 * 60 * 1000,  // 1 hora

  async fetchMacro(forceRefresh = false) {
    // Tenta cache do localStorage
    if (!forceRefresh) {
      try {
        const cached = JSON.parse(localStorage.getItem(this.MACRO_CACHE_KEY));
        if (cached && (Date.now() - cached.ts) < this.MACRO_TTL) {
          Object.assign(this.macro, cached.data);
          return this.macro;
        }
      } catch (_) {}
    }

    const results = await Promise.allSettled([
      // [0] SELIC meta — BCB série 432 (% a.a., já anualizada, não precisa de cálculo)
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json').then(r => r.json()),
      // [1] CDI over — BCB série 12 (taxa diária → anualiza composto)
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/1?formato=json').then(r => r.json()),
      // [2] IPCA mensal — BCB série 433 (variação mensal %, acumula 12 meses)
      fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/12?formato=json').then(r => r.json()),
      // [3] USD/BRL — AwesomeAPI
      fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL').then(r => r.json()),
      // [4] Ibovespa — brapi.dev
      fetch('https://brapi.dev/api/quote/%5EBVSP').then(r => r.json()),
      // [5] Bitcoin USD — CoinGecko
      fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd').then(r => r.json()),
      // [6] VIX — Yahoo Finance (pode falhar por CORS em alguns ambientes)
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d').then(r => r.json()),
    ]);

    // SELIC meta (série 432 já retorna % a.a. — sem cálculo)
    if (results[0].status === 'fulfilled') {
      const v = parseFloat(results[0].value[0]?.valor);
      if (v > 0) this.macro.selic = parseFloat(v.toFixed(2));
    }
    // CDI (série 12 retorna taxa diária → anualiza com juros compostos)
    if (results[1].status === 'fulfilled') {
      const v = parseFloat(results[1].value[0]?.valor);
      if (v > 0) this.macro.cdi = parseFloat(((Math.pow(1 + v / 100, 252) - 1) * 100).toFixed(2));
    } else {
      this.macro.cdi = parseFloat((this.macro.selic - 0.10).toFixed(2));
    }
    // IPCA 12m acumulado
    if (results[2].status === 'fulfilled') {
      const months = (results[2].value || []).slice(-12);
      if (months.length >= 6) {
        const acc = months.reduce((a, m) => a * (1 + parseFloat(m.valor) / 100), 1) - 1;
        this.macro.ipca = parseFloat((acc * 100).toFixed(2));
      }
    }
    // USD/BRL
    if (results[3].status === 'fulfilled') {
      const bid = parseFloat(results[3].value?.USDBRL?.bid);
      if (bid > 0) this.macro.dolar = bid;
    }
    // Ibovespa
    if (results[4].status === 'fulfilled') {
      const price = results[4].value?.results?.[0]?.regularMarketPrice;
      if (price > 0) this.macro.ibov = price;
    }
    // Bitcoin
    if (results[5].status === 'fulfilled') {
      const price = results[5].value?.bitcoin?.usd;
      if (price > 0) this.macro.btc = price;
    }
    // VIX
    if (results[6].status === 'fulfilled') {
      const price = results[6].value?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price > 0) this.macro.vix = price;
    }

    this.macro.updatedAt = Date.now();
    try {
      localStorage.setItem(this.MACRO_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: this.macro }));
    } catch (_) {}

    return this.macro;
  },

  _cached(key) {
    const c = this._cache[key];
    return c && (Date.now() - c.ts) < this.CACHE_MS;
  },

  clearCache() { this._cache = {}; },
};
