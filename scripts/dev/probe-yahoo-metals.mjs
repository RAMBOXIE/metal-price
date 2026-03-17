/**
 * 系統掃描 Yahoo Finance 所有有色金屬期貨 symbol
 * 目標：找出哪些能取到有效 USD 價格 + 日環比
 */

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { symbol, ok: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return { symbol, ok: false, error: 'no result' };
    const meta = result.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;
    const changePct = price && prevClose ? +((price - prevClose) / prevClose * 100).toFixed(2) : null;
    const currency = meta.currency;
    const exchangeName = meta.exchangeName;
    const tradingDate = new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10);
    return { symbol, ok: true, price, changePct, currency, exchange: exchangeName, tradingDate, prevClose };
  } catch (e) {
    return { symbol, ok: false, error: e.message };
  }
}

async function fetchStooq(symbol, desc) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { symbol, ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { symbol, ok: false, error: 'empty' };
    const headers = lines[0].split(',').map(h => h.trim());
    const vals = lines[1].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]; });
    if (obj['Close'] === 'N/D' || !obj['Close']) return { symbol, ok: false, error: 'N/D' };
    return { symbol, desc, ok: true, price: parseFloat(obj['Close']), date: obj['Date'], open: obj['Open'] };
  } catch (e) {
    return { symbol, ok: false, error: e.message };
  }
}

async function main() {
  console.log('=== Yahoo Finance 金屬期貨掃描 ===');
  
  const yahooSymbols = [
    // LME metals (via CME Group / various)
    ['HG=F', '銅 COMEX'],
    ['NI=F', '鎳 LME (via Yahoo)'],
    ['ZNC=F', '鋅 LME'],
    ['PB=F', '鉛 LME'],
    ['ALI=F', '鋁 LME (via CME)'],
    ['SN=F', '錫 LME'],
    ['GC=F', '黃金'],
    ['SI=F', '白銀'],
    // COMEX / alternative
    ['MHG=F', '銅 COMEX mini'],
    ['XAL=F', '鋁 mini'],
    // Cobalt / Bismuth (likely no futures)
    ['CO=F', '鈷?'],
    ['BI=F', '鉍?'],
  ];

  const results = await Promise.all(yahooSymbols.map(([sym, desc]) => fetchYahoo(sym).then(r => ({...r, desc}))));
  
  console.log('\n成功的 symbols:');
  results.filter(r => r.ok).forEach(r => {
    console.log(`  ✅ ${r.symbol} (${r.desc}): ${r.price} ${r.currency} (${r.changePct > 0 ? '+' : ''}${r.changePct}%) [${r.exchange}] ${r.tradingDate}`);
  });
  
  console.log('\n失敗的 symbols:');
  results.filter(r => !r.ok).forEach(r => {
    console.log(`  ❌ ${r.symbol} (${r.desc}): ${r.error}`);
  });

  console.log('\n=== Stooq 金屬掃描 ===');
  const stooqSymbols = [
    ['CU.F', '銅'],
    ['NI.F', '鎳'],
    ['ZN.F', '鋅'],
    ['PB.F', '鉛'],
    ['AL.F', '鋁'],
    ['SN.F', '錫'],
    ['CO.F', '鈷'],
    ['BI.F', '鉍'],
  ];
  
  const stooqResults = await Promise.all(stooqSymbols.map(([sym, desc]) => fetchStooq(sym, desc)));
  stooqResults.forEach(r => {
    if (r.ok) {
      console.log(`  ✅ ${r.symbol} (${r.desc}): ${r.price} [${r.date}]`);
    } else {
      console.log(`  ❌ ${r.symbol} (${r.desc}): ${r.error}`);
    }
  });

  console.log('\n=== Financial Modeling Prep 免費 API ===');
  try {
    const symbols = 'COPPER,NICKEL,ZINC,COBALT,BISMUTH,ALUM';
    const url = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent('HG=F,NI=F,ZNC=F')}?apikey=demo`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    console.log('FMP status:', r.status, JSON.stringify(d).slice(0, 300));
  } catch (e) {
    console.log('FMP fail:', e.message);
  }

  console.log('\n=== SHFE 替代路徑 ===');
  const shfePaths = [
    'https://shfe.com.cn/data/dailydata/kx/kx20260313.dat',
    'https://www.shfe.com.cn/data/dailydata/kx/',
    'https://www.shfe.com.cn/data/currentstock/',
  ];
  for (const url of shfePaths) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.shfe.com.cn/' }, signal: AbortSignal.timeout(5000) });
      console.log(url.slice(-40), 'status:', r.status, 'len:', (await r.text()).length);
    } catch (e) {
      console.log(url.slice(-40), 'FAIL:', e.message);
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
