/**
 * 探測多個財經數據源，找 LME 金屬價格 + SHFE 庫存
 */

async function tryFetch(name, url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120',
        'Accept': 'text/html,application/json,*/*',
        'Referer': 'https://www.google.com/',
        ...opts.headers,
      },
      signal: AbortSignal.timeout(opts.timeout || 7000),
    });
    const text = await res.text();
    return { name, url, status: res.status, ct: res.headers.get('content-type'), text, ok: res.ok };
  } catch (e) {
    return { name, url, status: 0, text: '', error: e.message };
  }
}

function findPrices(text) {
  const patterns = [
    // USD prices: 9,500.00 or 5.75
    text.match(/(?:copper|nickel|zinc|cobalt|bismuth|lead|tin)[^\n]{0,80}[\d,]+\.?\d+/gi),
    // Raw numbers near metal keywords
    text.match(/(?:LME|SHFE|LCU|LCPT)[^\n]{0,60}[\d,]{3,}/gi),
  ];
  return patterns.flat().filter(Boolean).slice(0, 5);
}

async function main() {
  // 1. 東方財富頁面 HTML - 找 JS 資源和 API 端點
  console.log('\n=== 東方財富頁面源碼分析 ===');
  const em = await tryFetch('eastmoney-html', 'https://quote.eastmoney.com/globalfuture/LCPT.html', {
    headers: { 'Referer': 'https://quote.eastmoney.com/' }
  });
  if (em.ok) {
    const apiPatterns = em.text.match(/(?:push2|nq\.quote|emquote|websocket)[a-z0-9\.\-\/]+/gi) || [];
    const secidPatterns = em.text.match(/secid['":\s]+['"]\d+\.[A-Z]+['"]/gi) || [];
    const scriptSrcs = em.text.match(/src="(https?:\/\/[^"]+\.js[^"]*?)"/g) || [];
    console.log('API patterns:', [...new Set(apiPatterns)].slice(0, 10));
    console.log('Secid patterns:', secidPatterns.slice(0, 5));
    console.log('Script srcs:', scriptSrcs.slice(0, 5));
  } else {
    console.log('Failed:', em.error || em.status);
  }

  // 2. 東方財富全球期貨專屬 API 嘗試
  console.log('\n=== 東方財富全球期貨 API ===');
  const emApis = [
    ['em-nq-lcpt', 'https://nq.quote.eastmoney.com/stock/get?secid=113.LCPT&fields=f43,f44,f45,f58'],
    ['em-push2-lme', 'https://push2.eastmoney.com/api/qt/stock/get?secid=113.LCPT&ut=b2884a393a59ad64002292a3e90d46a5&fields=f43,f44,f45,f46,f47,f48&invt=2&fltt=2'],
    // 嘗試正確的東方財富代碼格式 - 全球期貨用不同前綴
    ['em-118-lcpt', 'https://push2.eastmoney.com/api/qt/stock/get?secid=118.LCPT&fields=f43,f44,f45,f58&invt=2&fltt=2'],
    ['em-101-lcpt', 'https://push2.eastmoney.com/api/qt/stock/get?secid=101.LCPT&fields=f43,f44,f45,f58&invt=2&fltt=2'],
  ];
  for (const [name, url] of emApis) {
    const r = await tryFetch(name, url, { headers: { 'Referer': 'https://quote.eastmoney.com/' }, timeout: 4000 });
    console.log(name, 'status:', r.status, 'preview:', r.text.slice(0, 150));
  }

  // 3. 上海期貨交易所 - 找新 API
  console.log('\n=== SHFE 庫存數據 ===');
  const shfeApis = [
    ['shfe-stock', 'https://www.shfe.com.cn/data/dailydata/'],
    ['shfe-warrant', 'https://www.shfe.com.cn/data/warrantdata/'],
    ['shfe-api', 'https://www.shfe.com.cn/bourseService/web/priceDetail/3/'],
    ['shfe-new', 'https://shfe.com.cn/data/dailydata/kx/'],
    // SHFE 倉單統計 API
    ['shfe-warrant2', 'http://www.shfe.com.cn/data/statsticsdata/WeeklyStocks/weeklyStocks.dat'],
  ];
  for (const [name, url] of shfeApis) {
    const r = await tryFetch(name, url, { headers: { 'Referer': 'http://www.shfe.com.cn/' }, timeout: 5000 });
    console.log(name, 'status:', r.status, 'len:', r.text.length, 'preview:', r.text.slice(0, 100));
  }

  // 4. Macrotrends 銅價 (有歷史數據)
  console.log('\n=== Macrotrends 銅價 ===');
  const mt = await tryFetch('macrotrends', 'https://www.macrotrends.net/assets/php/fund_flow.php?t=copper-prices-historical-chart-data', { timeout: 7000 });
  console.log('macrotrends status:', mt.status, 'preview:', mt.text.slice(0, 300));

  // 5. TradingEconomics 免費端點
  console.log('\n=== TradingEconomics ===');
  const te = await tryFetch('te-copper', 'https://tradingeconomics.com/commodity/copper', { timeout: 7000 });
  const tePrice = te.text.match(/[\d,]+\.?\d*(?:\s*USD)?(?:\/t|per tonne)?/g);
  console.log('TE status:', te.status, 'price matches:', tePrice ? tePrice.slice(0, 3) : 'none');

  // 6. Metals Daily (英文，有 LME)
  console.log('\n=== MetalsDaily ===');
  const md = await tryFetch('metalsdaily', 'https://www.metalsdaily.com/live-prices/lme/', { timeout: 7000 });
  const mdPrices = findPrices(md.text);
  console.log('MetalsDaily status:', md.status, 'prices:', mdPrices);
  if (md.ok && md.text.length > 1000) {
    // 找 LME 銅
    const copperMatch = md.text.match(/copper[^<]{0,100}/gi);
    console.log('Copper mentions:', copperMatch ? copperMatch.slice(0, 3) : 'none');
  }
}

main().catch(e => console.error('Fatal:', e.message));
