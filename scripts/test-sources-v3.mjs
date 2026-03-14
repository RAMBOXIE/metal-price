/**
 * 有色金屬數據源測試 v3
 * 深度探索 IMF API、World Bank 正確路徑、Yahoo COMEX symbol、USGS
 */

const TIMEOUT_MS = 20000;
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms))]);
}
async function fetchUrl(url, opts = {}) {
  return withTimeout(fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json,*/*', ...opts.headers },
    ...opts,
  }), TIMEOUT_MS);
}

// ─────────────────────────────────────────────
// 測試A：IMF DataMapper API 正確格式
// ─────────────────────────────────────────────
async function testIMFCorrect() {
  console.log('\n═══ IMF DataMapper API (正確格式) ═══');
  // 先查詢可用指標列表
  const indicatorsUrl = 'https://www.imf.org/external/datamapper/api/v1/indicators';
  try {
    const res = await fetchUrl(indicatorsUrl);
    const text = await res.text();
    const data = JSON.parse(text);
    const indicators = data?.indicators || {};
    const keys = Object.keys(indicators);
    // 過濾鎳/鈷相關
    const metalKeys = keys.filter(k => /NI|NICK|CO|COBA|METAL|COMMOD/i.test(k));
    console.log(`  共 ${keys.length} 個指標，金屬相關: ${metalKeys.join(', ')}`);

    // 嘗試直接請求 PNICK 數據
    const dataUrl = 'https://www.imf.org/external/datamapper/api/v1/PNICK/WORLD';
    const res2 = await fetchUrl(dataUrl);
    const text2 = await res2.text();
    console.log(`  PNICK/WORLD HTTP: ${res2.status}, 前300字: ${text2.slice(0, 300)}`);

    return { metalKeys, preview: text2.slice(0, 300) };
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────
// 測試B：World Bank 正確數據集
// ─────────────────────────────────────────────
async function testWorldBankCorrect() {
  console.log('\n═══ World Bank Pink Sheet 正確路徑 ═══');
  // Global Economic Monitor (GEM) Commodities dataset
  // indicator id for nickel: PNICK ($/mt), cobalt: PCOBAL
  const urls = [
    'https://api.worldbank.org/v2/sources/26/indicators?format=json&per_page=50',  // GEM source 26
    'https://api.worldbank.org/v2/commodity/PNICK?format=json&mrv=5',
    'https://api.worldbank.org/v2/indicator/PNICK?format=json',
    // Pink Sheet is source 51
    'https://api.worldbank.org/v2/sources/51/indicators?format=json',
  ];
  for (const url of urls) {
    try {
      const res = await fetchUrl(url, { headers: { Accept: 'application/json' }});
      const text = await res.text();
      console.log(`\n  URL: ${url.slice(0, 80)}`);
      console.log(`  HTTP: ${res.status}, 前300字: ${text.slice(0, 300)}`);
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試C：Yahoo Finance - 搜尋鎳相關 symbol
// ─────────────────────────────────────────────
async function testYahooSearch() {
  console.log('\n═══ Yahoo Finance Symbol 搜尋 ═══');
  // Yahoo 搜尋 API
  const queries = ['nickel', 'lme nickel', 'nickel futures'];
  for (const q of queries) {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`;
      const res = await fetchUrl(url);
      const text = await res.text();
      const data = JSON.parse(text);
      const quotes = data?.quotes || [];
      console.log(`\n  搜尋 "${q}" → ${quotes.length} 結果:`);
      for (const q2 of quotes.slice(0, 5)) {
        console.log(`    ${q2.symbol} | ${q2.shortname || q2.longname} | ${q2.quoteType} | ${q2.exchange}`);
      }
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試D：Alpha Vantage 免費 key 申請後的端點
// (用真實 free key 測試 - 這裡用已知的 demo 端點)
// ─────────────────────────────────────────────
async function testAlphaVantageMetals() {
  console.log('\n═══ Alpha Vantage 商品/金屬端點 ═══');
  // CORE_COMMODITY endpoint (needs key, but check what demo returns)
  const urls = [
    'https://www.alphavantage.co/query?function=COPPER&apikey=demo',
    'https://www.alphavantage.co/query?function=NATURAL_GAS&apikey=demo',
    // Nickel 如果存在
    'https://www.alphavantage.co/query?function=NICKEL&apikey=demo',
  ];
  for (const url of urls) {
    try {
      const res = await fetchUrl(url);
      const text = await res.text();
      console.log(`\n  ${url.split('function=')[1].split('&')[0]}:`);
      console.log(`  HTTP: ${res.status}, 前400字: ${text.slice(0, 400)}`);
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試E：Quandl/NASDAQ Data Link (free)
// ─────────────────────────────────────────────
async function testNasdaqDataLink() {
  console.log('\n═══ NASDAQ Data Link (Quandl) 公開數據集 ═══');
  // LME 數據集在 Quandl 上是 LME/NICK，但需要 API key
  // 試試公開的 ODA 數據（免費）
  const urls = [
    { url: 'https://data.nasdaq.com/api/v3/datasets/ODA/PNICK_USD.json?rows=3', name: 'ODA/PNICK_USD (鎳)' },
    { url: 'https://data.nasdaq.com/api/v3/datasets/ODA/PCOBAL_USD.json?rows=3', name: 'ODA/PCOBAL_USD (鈷)' },
  ];
  for (const s of urls) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url);
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前400字: ${text.slice(0, 400)}`);
      if (res.status === 200) {
        const data = JSON.parse(text);
        const dataset = data?.dataset;
        const colNames = dataset?.column_names;
        const dataRows = dataset?.data;
        if (dataRows && dataRows.length > 0) {
          console.log(`    ✅ 成功！列: ${colNames}, 最新: ${JSON.stringify(dataRows[0])}`);
        }
      }
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試F：Trading Economics 公開 JSON (非官方)
// ─────────────────────────────────────────────
async function testTradingEconomics() {
  console.log('\n═══ Trading Economics 非官方嘗試 ═══');
  const url = 'https://markets.tradingeconomics.com/chart?s=lmnidy&interval=1d&span=1m&securify=new&url=/commodity/nickel&AUTH=demo&ohlc=0';
  try {
    const res = await fetchUrl(url);
    console.log(`  HTTP: ${res.status}`);
    const text = await res.text();
    console.log(`  前400字: ${text.slice(0, 400)}`);
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// 測試G：Open Meteo / 其他公開商品 API
// ─────────────────────────────────────────────
async function testOpenAPIs() {
  console.log('\n═══ 其他公開商品 API ═══');
  const urls = [
    { url: 'https://commodities-api.com/api/latest?access_key=demo&symbols=XNI,XCO', name: 'commodities-api demo' },
    { url: 'https://api.comex.com/nickel', name: 'COMEX 非官方' },
    { url: 'https://www.lme.com/api/v1/prices/nickel', name: 'LME v1 nickel' },
  ];
  for (const s of urls) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url);
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前200字: ${text.slice(0, 200)}`);
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試H：Stooq 正確工作的 symbol 列表 (用黃金驗證機制)
// ─────────────────────────────────────────────
async function testStooqWorking() {
  console.log('\n═══ Stooq 工作驗證 + 鎳搜尋 ═══');
  // 先用已知有效 symbol 驗證
  const symbols = [
    { sym: 'xauusd', name: '黃金（基準驗證）' },
    { sym: 'xagusd', name: '白銀（基準驗證）' },
    { sym: 'hg.f', name: '銅期貨（基準驗證）' },
    { sym: 'ni.lme', name: '鎳LME嘗試' },
    { sym: 'nick', name: 'nick' },
    { sym: 'lmeni.uk', name: 'lmeni.uk' },
  ];
  for (const s of symbols) {
    try {
      const url = `https://stooq.com/q/d/l/?s=${s.sym}&i=d`;
      const res = await fetchUrl(url);
      const text = await res.text();
      const lines = text.trim().split('\n').filter(l => l.trim());
      if (lines.length >= 2 && !text.includes('No data')) {
        const header = lines[0].split(',');
        const last = lines[lines.length - 1].split(',');
        const closeIdx = header.findIndex(h => /close/i.test(h));
        const price = closeIdx >= 0 ? last[closeIdx] : '?';
        const date = last[0];
        console.log(`  ✅ ${s.name} (${s.sym}): ${date} 收盤 ${price}`);
      } else {
        console.log(`  ❌ ${s.name} (${s.sym}): ${text.trim().slice(0, 50) || '空'}`);
      }
    } catch(e) {
      console.log(`  ❌ ${s.name}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('╔═══════════════════════════════════╗');
  console.log('║  擴展測試 v3 - 深度探索            ║');
  console.log('╚═══════════════════════════════════╝');
  console.log(new Date().toISOString());

  await testIMFCorrect();
  await testWorldBankCorrect();
  await testYahooSearch();
  await testAlphaVantageMetals();
  await testNasdaqDataLink();
  await testTradingEconomics();
  await testOpenAPIs();
  await testStooqWorking();

  console.log('\n\n✅ v3 測試完成 - ' + new Date().toISOString());
}

main().catch(console.error);
