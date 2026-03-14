/**
 * 有色金屬數據源測試 v4
 * 深挖：World Bank GEM正確路徑、Alpha Vantage功能列表、CME鎳符號
 */

const TIMEOUT_MS = 20000;
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms))]);
}
async function fetchUrl(url, opts = {}) {
  return withTimeout(fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', 'Accept': '*/*', ...opts.headers },
    ...opts,
  }), TIMEOUT_MS);
}

// ─────────────────────────────────────────────
// 測試A：World Bank 正確 commodity indicator ID
// ─────────────────────────────────────────────
async function testWorldBankGEM() {
  console.log('\n═══ World Bank GEM Commodity 正確路徑 ═══');
  const urls = [
    // GEM Commodity dataset (source=26)
    'https://api.worldbank.org/v2/en/topic/21?format=json',  // commodities topic
    'https://api.worldbank.org/v2/sources?format=json',      // list all sources
    // 正確的商品 URL
    'https://api.worldbank.org/v2/country/WLD/indicator/PNICK?format=json&mrv=3&frequency=M',
    'https://api.worldbank.org/v2/en/indicator/CMO-NI-USD?format=json&mrv=3',
    // 用 bulk download API
    'https://api.worldbank.org/v2/country/WLD/indicator/PNICK?format=json',
  ];
  for (const url of urls) {
    try {
      const res = await fetchUrl(url, { headers: { Accept: 'application/json' }});
      const text = await res.text();
      console.log(`\n  URL: ${url.slice(0, 80)}`);
      console.log(`  HTTP: ${res.status}`);
      console.log(`  前200字: ${text.slice(0, 200)}`);
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試B：Alpha Vantage 商品函數列表
// ─────────────────────────────────────────────
async function testAVFunctions() {
  console.log('\n═══ Alpha Vantage 商品函數探索 ═══');
  // 用不同的商品 function 名看哪個存在
  // AV 官方文檔上的商品列表:
  // WTI, BRENT, NATURAL_GAS, COPPER, ALUMINUM, WHEAT, CORN, COTTON, SUGAR, COFFEE
  // NICKEL 不在官方列表，但試試
  const functions = ['NICKEL', 'COBALT', 'ZINC', 'LEAD', 'TIN', 'ALUMINUM'];
  // 用真實 free key（我們沒有，但記錄端點以供參考）
  // 用 demo key 只能看到 "demo" 提示，但 HTTP 200 說明端點存在
  for (const fn of functions) {
    try {
      const url = `https://www.alphavantage.co/query?function=${fn}&apikey=demo`;
      const res = await fetchUrl(url);
      const text = await res.text();
      const isDemo = text.includes('demo purposes');
      const isError = text.includes('"Error Message"') || text.includes('"Note"');
      const data = JSON.parse(text);
      if (data['Error Message']) {
        console.log(`  ❌ ${fn}: 不存在 (${data['Error Message'].slice(0, 60)})`);
      } else if (isDemo) {
        console.log(`  ✅ ${fn}: 端點存在（需要真實 free key）`);
      } else {
        console.log(`  ? ${fn}: ${text.slice(0, 100)}`);
      }
    } catch(e) {
      console.log(`  ❌ ${fn}: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試C：CME Group 公開數據
// ─────────────────────────────────────────────
async function testCME() {
  console.log('\n═══ CME Group 公開價格 ═══');
  // CME 有公開的延遲行情 JSON
  const urls = [
    // 鎳不是 COMEX 品種，但 CME 有一些基本金屬
    { url: 'https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/NI/G?quoteCodes=&_=', name: 'CME NI futures' },
    { url: 'https://www.cmegroup.com/CmeWS/mvc/ProductCalendar/future/NI?numberOfContracts=3', name: 'CME NI calendar' },
  ];
  for (const s of urls) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url, { headers: { 'Accept': 'application/json', 'Referer': 'https://www.cmegroup.com/' } });
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前300字: ${text.slice(0, 300)}`);
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試D：Open Commodity Data / 其他
// ─────────────────────────────────────────────
async function testOtherSources() {
  console.log('\n═══ 其他可能有效的源 ═══');
  const tests = [
    {
      name: 'IMF PCPS API (正確格式)',
      url: 'https://www.imf.org/external/datamapper/api/v1/PNICK/W00?periods=2025,2024',
    },
    {
      name: 'IMF data.imf.org REST',
      url: 'https://data.imf.org/api/v1/en/commodity/?offset=0&limit=10',
    },
    {
      name: 'World Bank Commodity Price (correct source)',
      url: 'https://api.worldbank.org/v2/sources/26/indicators?format=json&per_page=200',
    },
    {
      name: 'USGS Minerals Information',
      url: 'https://minerals.usgs.gov/minerals/pubs/commodity/nickel/mcs-2024-nicke.pdf',
    },
    {
      name: 'fixer.io commodity symbols',
      url: 'https://data.fixer.io/api/symbols?access_key=demo',
    },
    {
      name: 'Open Exchange Rates (metals)',
      url: 'https://openexchangerates.org/api/currencies.json',
    },
  ];
  for (const t of tests) {
    try {
      console.log(`\n  → ${t.name}`);
      const res = await fetchUrl(t.url);
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    前300字: ${text.slice(0, 300)}`);
      // 搜索鎳相關關鍵字
      if (/nickel|NICK|ni[^a-z]/i.test(text)) {
        console.log('    🔎 含鎳相關關鍵字！');
      }
    } catch(e) {
      console.log(`    ❌ ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────
// 測試E：直接測試 Alpha Vantage free key 端點
// (NICKEL 函數)
// ─────────────────────────────────────────────
async function testAVNickelEndpoint() {
  console.log('\n═══ Alpha Vantage NICKEL 端點詳細測試 ═══');
  // 已知 AV 商品端點格式
  // 即使用 demo key，如果端點不存在會返回 "Error Message"
  // 如果存在但需要 key 會返回 "Information"
  const url = 'https://www.alphavantage.co/query?function=NICKEL&interval=monthly&apikey=demo';
  try {
    const res = await fetchUrl(url);
    const text = await res.text();
    const data = JSON.parse(text);
    console.log(`  HTTP: ${res.status}`);
    console.log(`  完整響應: ${JSON.stringify(data, null, 2).slice(0, 500)}`);
    if (data['Error Message']) {
      console.log('\n  ❌ NICKEL 端點不存在');
    } else if (data['Information']) {
      console.log('\n  ✅ NICKEL 端點存在！免費申請 key 後可用');
      console.log('  申請地址: https://www.alphavantage.co/support/#api-key');
    } else if (data['data']) {
      console.log('\n  ✅✅ 有數據！(demo key 也能用?)');
      const latest = data['data'][0];
      console.log(`  最新: ${JSON.stringify(latest)}`);
    }
  } catch(e) {
    console.log(`  ❌ ${e.message}`);
  }

  // 同樣測試 COBALT
  const urlCo = 'https://www.alphavantage.co/query?function=COBALT&interval=monthly&apikey=demo';
  try {
    const res = await fetchUrl(urlCo);
    const text = await res.text();
    const data = JSON.parse(text);
    if (data['Error Message']) {
      console.log('  ❌ COBALT 端點不存在');
    } else if (data['Information']) {
      console.log('  ✅ COBALT 端點存在！');
    }
  } catch(e) {
    console.log(`  ❌ COBALT: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// 測試F：World Bank Pink Sheet 下載端點
// ─────────────────────────────────────────────
async function testWorldBankPinkSheet() {
  console.log('\n═══ World Bank Pink Sheet 直接下載 ═══');
  // World Bank 的 Pink Sheet 是 Excel 文件，但也有 JSON bulk download
  const urls = [
    'https://api.worldbank.org/v2/en/indicator/PNICK?downloadformat=json',
    'https://api.worldbank.org/v2/en/indicator/PCOBAL?downloadformat=json',
    'https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Pink-Sheet.xlsx',
  ];
  for (const url of urls) {
    try {
      const res = await fetchUrl(url);
      console.log(`\n  URL: ${url.slice(0, 60)}`);
      console.log(`  HTTP: ${res.status}, Content-Type: ${res.headers.get('content-type')}`);
      const text = await res.text();
      console.log(`  前200字: ${text.slice(0, 200)}`);
    } catch(e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

async function main() {
  console.log('╔═══════════════════════════════════╗');
  console.log('║  深度測試 v4                       ║');
  console.log('╚═══════════════════════════════════╝');
  console.log(new Date().toISOString());

  await testWorldBankGEM();
  await testAVFunctions();
  await testCME();
  await testOtherSources();
  await testAVNickelEndpoint();
  await testWorldBankPinkSheet();

  console.log('\n\n✅ v4 完成 - ' + new Date().toISOString());
}

main().catch(console.error);
