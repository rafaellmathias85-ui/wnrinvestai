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

  // ── Ações BR via Brapi.dev ──────────────────────────
  async fetchStocks(tickers) {
    const key  = 'stocks_' + tickers.join('_');
    if (this._cached(key)) return this._cache[key].data;

    const url = `https://brapi.dev/api/quote/${tickers.join(',')}?fundamental=false`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('Brapi indisponível.');
    const raw  = await res.json();

    const result = {};
    (raw.results || []).forEach(q => {
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
  },

  // ── Indicadores macro (hardcoded + atualizáveis) ───
  macro: {
    selic:    14.50,
    ipca:     5.53,
    dolar:    5.70,
    vix:      22.1,
    ibov:     135800,
    cdi:      14.15,
  },

  _cached(key) {
    const c = this._cache[key];
    return c && (Date.now() - c.ts) < this.CACHE_MS;
  },

  clearCache() { this._cache = {}; },
};
