/**
 * 有色金屬數據源擴展測試 v2
 * 測試備用方案：World Bank / IMF / USGS / 其他 Yahoo symbol
 */

const TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
  ]);
}

async function fetchUrl(url, options = {}) {
  const res = await withTimeout(fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json,text/html,*/*',
      ...options.headers,
    },
    ...options,
  }), TIMEOUT_MS);
  return res;
}

// ─────────────────────────────────────────────
// 測試A：World Bank Commodity Price API
// ─────────────────────────────────────────────
async function testWorldBank() {
  console.log('\n═══════════════════════════════════');
  console.log('測試A：World Bank Commodity Prices');
  console.log('═══════════════════════════════════');
  // PINK sheet: Nickel = PNICK, Cobalt = PCOBAL
  const urls = [
    { url: 'https://api.worldbank.org/v2/en/indicator/PNICK?downloadformat=json&mrv=5', name: 'Nickel PNICK' },
    { url: 'https://api.worldbank.org/v2/en/indicator/PCOBAL?downloadformat=json&mrv=5', name: 'Cobalt PCOBAL' },
    // 嘗試 commodity prices endpoint
    { url: 'https://api.worldbank.org/v2/country/all/indicator/PNICK?format=json&mrv=3', name: 'Nickel via country/all' },
  ];
  const results = [];
  for (const s of urls) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url);
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前300字: ${text.slice(0, 300)}`);
      results.push({ name: s.name, status: res.status, preview: text.slice(0, 300) });
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
      results.push({ name: s.name, error: e.message });
    }
  }
  return results;
}

// ─────────────────────────────────────────────
// 測試B：IMF Primary Commodity Prices
// ─────────────────────────────────────────────
async function testIMF() {
  console.log('\n═══════════════════════════════════');
  console.log('測試B：IMF Primary Commodity Prices');
  console.log('═══════════════════════════════════');
  // IMF PCPS dataset - Nickel & Cobalt
  const urls = [
    { url: 'https://www.imf.org/external/datamapper/api/v1/PNICK', name: 'IMF Nickel PNICK' },
    { url: 'https://www.imf.org/external/datamapper/api/v1/PCOBAL', name: 'IMF Cobalt PCOBAL' },
  ];
  const results = [];
  for (const s of urls) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url, { headers: { Accept: 'application/json' } });
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前500字: ${text.slice(0, 500)}`);
      try {
        const data = JSON.parse(text);
        // 找最新值
        const values = data?.values?.PNICK?.['W00'] || data?.values?.PCOBAL?.['W00'] || {};
        const years = Object.keys(values).sort();
        if (years.length > 0) {
          const latest = years[years.length - 1];
          console.log(`    ✅ 最新年份: ${latest}, 值: ${values[latest]}`);
          results.push({ name: s.name, ok: true, year: latest, value: values[latest] });
        } else {
          // 嘗試其他路徑
          const allKeys = JSON.stringify(data).slice(0, 200);
          console.log(`    ⚠️  結構: ${allKeys}`);
          results.push({ name: s.name, ok: false, preview: allKeys });
        }
      } catch {
        results.push({ name: s.name, status: res.status, preview: text.slice(0, 200) });
      }
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
      results.push({ name: s.name, error: e.message });
    }
  }
  return results;
}

// ─────────────────────────────────────────────
// 測試C：Yahoo Finance - 正確的鎳期貨 symbol
// ─────────────────────────────────────────────
async function testYahooCorrect() {
  console.log('\n═══════════════════════════════════');
  console.log('測試C：Yahoo Finance 正確 Symbol 探索');
  console.log('═══════════════════════════════════');
  // 嘗試多種可能存在的 symbol
  const symbols = [
    'NIU25.CMX', 'NIK25.CMX',  // COMEX Nickel
    '%5ELME', 
    'LMCADS03', 'LMCADY00',     // LME copper-style
    'GC=F', 'SI=F', 'HG=F',    // 黃金/白銀/銅（用來確認 Yahoo API 本身工作）
    'NYMEX:NG', 'COMEX:NI',
  ];
  const results = [];
  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
      const res = await fetchUrl(url, { headers: { Accept: 'application/json' } });
      const text = await res.text();
      const data = JSON.parse(text);
      const result = data?.chart?.result?.[0];
      const error = data?.chart?.error;
      if (error) {
        console.log(`  ❌ ${sym}: ${error.description}`);
        results.push({ sym, ok: false });
      } else if (result) {
        const closes = result.indicators?.quote?.[0]?.close?.filter(c => c != null);
        const lastClose = closes?.[closes.length - 1];
        console.log(`  ✅ ${sym}: 最新收盤 ${lastClose} ${result.meta?.currency}`);
        results.push({ sym, ok: true, price: lastClose, currency: result.meta?.currency });
      }
    } catch(e) {
      console.log(`  ❌ ${sym}: ${e.message}`);
    }
  }
  return results;
}

// ─────────────────────────────────────────────
// 測試D：Open Exchange Rates / Metalpriceapi
// ─────────────────────────────────────────────
async function testMetalPriceApi() {
  console.log('\n═══════════════════════════════════');
  console.log('測試D：metalpriceapi.com (free tier)');
  console.log('═══════════════════════════════════');
  // 無 API key 時看會返回什麼
  const url = 'https://metalpriceapi.com/v1/latest?api_key=demo&base=USD&currencies=XNI,XCO';
  try {
    const res = await fetchUrl(url);
    console.log(`  HTTP: ${res.status}`);
    const text = await res.text();
    console.log(`  前300字: ${text.slice(0, 300)}`);
    return { status: res.status, preview: text.slice(0, 300) };
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────
// 測試E：LME 官方數據 / kitco
// ─────────────────────────────────────────────
async function testLMEKitco() {
  console.log('\n═══════════════════════════════════');
  console.log('測試E：LME / Kitco 公開端點');
  console.log('═══════════════════════════════════');
  const urls = [
    { url: 'https://www.lme.com/api/pricedatasnapcycle?key=nickel', name: 'LME API nickel' },
    { url: 'https://www.kitco.com/market/', name: 'Kitco market page' },
    // macrotrends 有歷史數據
    { url: 'https://www.macrotrends.net/assets/php/commodity.php?t=nickel-price-history', name: 'Macrotrends nickel' },
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
// 測試F：Alpha Vantage (free tier, no key needed for demo)
// ─────────────────────────────────────────────
async function testAlphaVantage() {
  console.log('\n═══════════════════════════════════');
  console.log('測試F：Alpha Vantage demo');
  console.log('═══════════════════════════════════');
  // Alpha Vantage 有 METALS 功能，但需要 key
  // 用 demo key 試
  const url = 'https://www.alphavantage.co/query?function=METALS&symbol=NICKEL&apikey=demo';
  try {
    const res = await fetchUrl(url);
    console.log(`  HTTP: ${res.status}`);
    const text = await res.text();
    console.log(`  前400字: ${text.slice(0, 400)}`);
    return { status: res.status, preview: text.slice(0, 400) };
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
    return { error: e.message };
  }
}

// ─────────────────────────────────────────────
// 測試G：Stooq 其他 symbol 格式
// ─────────────────────────────────────────────
async function testStooqVariants() {
  console.log('\n═══════════════════════════════════');
  console.log('測試G：Stooq 其他 Symbol 格式');
  console.log('═══════════════════════════════════');
  const symbols = [
    'ni.com', 'nix', 'nickel',
    'lme.ni', 'lmeni.uk', 
    'nik', 'nin',
  ];
  for (const sym of symbols) {
    try {
      const url = `https://stooq.com/q/d/l/?s=${sym}&i=d`;
      const res = await fetchUrl(url);
      const text = await res.text();
      if (text && text.trim() && text.trim() !== 'No data') {
        console.log(`  ✅ ${sym}: ${text.slice(0, 150)}`);
      } else {
        console.log(`  ❌ ${sym}: ${text.trim() || '空'}`);
      }
    } catch(e) {
      console.log(`  ❌ ${sym}: ${e.message}`);
    }
  }
}

async function main() {
  console.log('╔═══════════════════════════════════╗');
  console.log('║  擴展數據源測試 v2                 ║');
  console.log('╚═══════════════════════════════════╝');

  await testWorldBank();
  await testIMF();
  await testYahooCorrect();
  await testMetalPriceApi();
  await testLMEKitco();
  await testAlphaVantage();
  await testStooqVariants();

  console.log('\n\n✅ v2 測試完成');
}

main().catch(console.error);
