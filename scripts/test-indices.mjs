const symbols = ['^LMEX','JJM','PDBC','XME','COPX','PICK','000812.SS','512400','159163'];
const headers = {'User-Agent':'Mozilla/5.0','Accept':'application/json'};

async function test(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
  try {
    const r = await fetch(url, {headers, signal: AbortSignal.timeout(10000)});
    const status = r.status;
    if (!r.ok) return {sym, status, ok:false};
    const j = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return {sym, status, ok:false, err:'no meta'};
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const changePct = prevClose && price ? +((price - prevClose)/prevClose*100).toFixed(3) : null;
    const lastTradeMs = meta.regularMarketTime ? meta.regularMarketTime * 1000 : null;
    const daysDiff = lastTradeMs ? (Date.now()-lastTradeMs)/(1000*86400) : null;
    const fresh = daysDiff !== null && daysDiff <= 7;
    return {sym, status, ok:true, price, changePct, lastTrade: lastTradeMs ? new Date(lastTradeMs).toISOString().split('T')[0] : null, daysDiff: daysDiff ? +daysDiff.toFixed(1) : null, fresh};
  } catch(e) {
    return {sym, ok:false, err:e.message};
  }
}

const results = await Promise.all(symbols.map(test));
console.log(JSON.stringify(results, null, 2));
