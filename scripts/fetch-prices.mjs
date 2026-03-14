/**
 * fetch-prices.mjs
 * 抓取有色金屬現貨/期貨價格
 * 數據源：Yahoo Finance v8 API + MetalPriceAPI.com + Stooq
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ────────────────────────────────────────────
// 讀取 .env
// ────────────────────────────────────────────
function loadEnv() {
  const envPath = join(PROJECT_ROOT, '.env');
  const env = {};
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      env[key] = value;
    }
  } catch { /* ignore */ }
  return env;
}

// ────────────────────────────────────────────
// Yahoo Finance v8 API
// ────────────────────────────────────────────
async function fetchYahooPrice(symbol, name, unit, exchange) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No result in response');

    const meta = result.meta;
    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose;

    let changePercent = null;
    let changePct = null;
    if (prevClose && currentPrice) {
      changePercent = currentPrice - prevClose;
      changePct = ((currentPrice - prevClose) / prevClose) * 100;
    }

    return {
      name,
      symbol,
      price: currentPrice,
      prevClose,
      change: changePercent ? +changePercent.toFixed(4) : null,
      changePct: changePct ? +changePct.toFixed(2) : null,
      unit,
      exchange,
      source: 'Yahoo Finance',
      error: null,
    };
  } catch (err) {
    return {
      name,
      symbol,
      price: null,
      prevClose: null,
      change: null,
      changePct: null,
      unit,
      exchange,
      source: 'Yahoo Finance',
      error: err.message,
    };
  }
}

// ────────────────────────────────────────────
// Stooq CSV API（鎳 NI.F 等）
// 價格單位：美分/磅（cents/lb），需轉換為 USD/t
// 1 USD/t = 1 cts/lb / 100 * 2204.62
// ────────────────────────────────────────────
async function fetchStooqPrice(symbol, name, unit, exchange) {
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('Empty CSV');
    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());

    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i]; });

    if (obj['Close'] === 'N/D' || !obj['Close']) {
      throw new Error('No data (N/D)');
    }

    const rawPrice = parseFloat(obj['Close']);
    if (isNaN(rawPrice)) throw new Error('Invalid price');

    // Stooq 金屬期貨價格單位：美分/磅（cents/lb）
    // 轉換為 USD/t：rawPrice / 100 * 2204.62
    let price = rawPrice;
    if (unit === 'USD/t') {
      price = +(rawPrice / 100 * 2204.62).toFixed(2);
    }

    return {
      name,
      symbol,
      price,
      prevClose: null,
      change: null,
      changePct: null,
      unit,
      exchange,
      source: 'Stooq',
      error: null,
    };
  } catch (err) {
    return {
      name,
      symbol,
      price: null,
      prevClose: null,
      change: null,
      changePct: null,
      unit,
      exchange,
      source: 'Stooq',
      error: err.message,
    };
  }
}

// ────────────────────────────────────────────
// MetalPriceAPI.com
// 免費版僅支持貴金屬（XAU/XAG/XPT/XPD）及外匯
// 工業金屬（鎳 NI、鈷 XCO 等）需要付費計劃
// ────────────────────────────────────────────
async function fetchMetalPriceApi() {
  const env = loadEnv();
  const apiKey = env.METAL_PRICE_API_KEY;
  if (!apiKey) {
    return { nickel: null, cobalt: null, bismuth: null };
  }

  const makeResult = (name, symbol, unit, exchange, price, error) => ({
    name,
    symbol,
    price: price ?? null,
    prevClose: null,
    change: null,       // 免費版無昨日數據，不提供漲跌
    changePct: null,
    unit,
    exchange,
    source: 'metalpriceapi',
    error: error ?? null,
  });

  // 嘗試請求工業金屬：鎳(NI)、鈷(XCO)、鉍(XBI 不存在)
  // 免費版這些 symbol 都需要付費計劃，記錄錯誤供升級後使用
  const symbolMap = [
    { key: 'nickel',  symbol: 'NI',  name: '鎳', unit: 'USD/t', exchange: 'LME' },
    { key: 'cobalt',  symbol: 'XCO', name: '鈷', unit: 'USD/t', exchange: 'LME' },
    { key: 'bismuth', symbol: 'XBI', name: '鉍', unit: 'USD/t', exchange: 'N/A' },
  ];

  const results = {};

  for (const item of symbolMap) {
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=USD&currencies=${item.symbol}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if (!data.success) {
        const errCode = data.error?.statusCode;
        let errMsg = data.error?.message || 'API error';
        // 416 = requires paid plan, 300 = symbol not found
        results[item.key] = makeResult(item.name, item.symbol, item.unit, item.exchange, null, errMsg);
      } else {
        const rate = data.rates?.[item.symbol];
        if (rate == null) {
          results[item.key] = makeResult(item.name, item.symbol, item.unit, item.exchange, null, 'Symbol not in response');
        } else {
          // rates 是「1 USD 能買多少單位」，取倒數得每單位 USD 價格
          // 注意：metalpriceapi 金屬單位為 troy oz，工業金屬如有則需另行換算
          let price = 1 / rate;
          results[item.key] = makeResult(item.name, item.symbol, item.unit, item.exchange, +price.toFixed(2), null);
        }
      }
    } catch (err) {
      results[item.key] = makeResult(item.name, item.symbol, item.unit, item.exchange, null, err.message);
    }
  }

  return results;
}

// ────────────────────────────────────────────
// 主函數
// ────────────────────────────────────────────
async function main() {
  // 1. Yahoo Finance：銅/鋅（保持不變）
  const [copper, zinc] = await Promise.all([
    fetchYahooPrice('HG=F', '銅', 'USD/lb', 'COMEX'),
    fetchYahooPrice('ZNC=F', '鋅', 'USD/t',  'LME'),
  ]);

  // 2. MetalPriceAPI：嘗試鎳/鈷/鉍（免費版受限，記錄結果）
  const metalApiResults = await fetchMetalPriceApi();

  // 3. 鎳：若 metalpriceapi 失敗（受限於免費計劃），回退到 Stooq NI.F
  let nickel = metalApiResults.nickel;
  if (!nickel || nickel.price === null) {
    const stooqNickel = await fetchStooqPrice('NI.F', '鎳', 'USD/t', 'LME');
    if (stooqNickel.price !== null) {
      nickel = stooqNickel;
      if (metalApiResults.nickel?.error) {
        process.stderr.write(`[fetch-prices] metalpriceapi 鎳受限(${metalApiResults.nickel.error})，已回退到 Stooq\n`);
      }
    } else {
      nickel = metalApiResults.nickel || stooqNickel;
    }
  }

  // 4. 鈷：metalpriceapi 結果（免費版暫無，升級後可用）
  let cobalt = metalApiResults.cobalt;
  if (!cobalt || cobalt.price === null) {
    // 暫無免費數據源
    cobalt = {
      name: '鈷',
      symbol: 'XCO',
      price: null,
      prevClose: null,
      change: null,
      changePct: null,
      unit: 'USD/t',
      exchange: 'LME',
      source: 'metalpriceapi',
      error: cobalt?.error || '免費版不支援，需升級付費計劃',
    };
  }

  // 5. 鉍：暫無免費數據源（XBI symbol 不存在）
  const bismuth = {
    name: '鉍',
    symbol: 'XBI',
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    unit: 'USD/t',
    exchange: 'N/A',
    source: 'metalpriceapi',
    error: metalApiResults.bismuth?.error || 'Symbol not found',
  };

  const results = [copper, zinc, nickel, cobalt, bismuth];
  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
