/**
 * fetch-prices.mjs
 * 抓取有色金屬現貨/期貨價格
 * 數據源：Yahoo Finance v8 API + TradingEconomics 網頁解析
 */

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
// TradingEconomics 網頁解析
// ────────────────────────────────────────────
async function fetchTradingEconomicsPrice(commodity, name, unit, exchange) {
  const url = `https://tradingeconomics.com/commodity/${commodity}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 嘗試多種 pattern 解析價格
    let price = null;
    let changePct = null;

    // Pattern 1: JSON-LD / 結構化數據
    const jsonLdMatch = html.match(/"price"\s*:\s*"?([\d,\.]+)"?/i);
    if (jsonLdMatch) {
      const num = parseFloat(jsonLdMatch[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 10) price = num; // 避免匹配到 0.xx 這類無意義數字
    }

    // Pattern 2: TE 頁面特有的 #p span（SSR 渲染時存在）
    if (!price) {
      const spanP = html.match(/<span[^>]*\bid="p"[^>]*>([\d,\.]+)<\/span>/i);
      if (spanP) {
        const num = parseFloat(spanP[1].replace(/,/g, ''));
        if (!isNaN(num) && num > 10) price = num;
      }
    }

    // Pattern 3: TE commodity 頁面大價格數字（通常在 h2/h3 或 strong tag）
    if (!price) {
      const patterns = [
        /<h2[^>]*>([\d,\.]+)<\/h2>/i,
        /<strong[^>]*>([\d,\.]+)<\/strong>/i,
        /data-value="([\d,\.]+)"/i,
        /"last(?:Price|Value)"\s*:\s*([\d\.]+)/i,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) {
          const num = parseFloat(m[1].replace(/,/g, ''));
          if (!isNaN(num) && num > 100) { // 金屬價格通常 > 100 USD/t
            price = num;
            break;
          }
        }
      }
    }

    // Pattern 4: 漲跌幅（取第一個帶 % 的數字，排除版權年份等）
    const changePctMatches = [...html.matchAll(/([+-]?\d{1,3}\.?\d*)\s*%/g)];
    for (const m of changePctMatches) {
      const num = parseFloat(m[1]);
      if (!isNaN(num) && Math.abs(num) < 30) { // 合理的日漲跌幅
        changePct = num;
        break;
      }
    }

    if (price === null) {
      throw new Error('Price not found in page (TradingEconomics may require JS rendering)');
    }

    return {
      name,
      symbol: commodity,
      price,
      prevClose: null,
      change: null,
      changePct,
      unit,
      exchange,
      source: 'TradingEconomics',
      error: null,
    };
  } catch (err) {
    return {
      name,
      symbol: commodity,
      price: null,
      prevClose: null,
      change: null,
      changePct: null,
      unit,
      exchange,
      source: 'TradingEconomics',
      error: err.message,
    };
  }
}

// ────────────────────────────────────────────
// 主函數
// ────────────────────────────────────────────
async function main() {
  const results = await Promise.all([
    // Yahoo Finance
    fetchYahooPrice('HG=F',  '銅', 'USD/lb',  'COMEX'),
    fetchYahooPrice('ZNC=F', '鋅', 'USD/t',   'LME'),

    // TradingEconomics
    fetchTradingEconomicsPrice('nickel', '鎳', 'USD/t', 'LME'),
    fetchTradingEconomicsPrice('cobalt', '鈷', 'USD/t', 'LME'),

    // 鉍：暫無免費數據源
    Promise.resolve({
      name: '鉍',
      symbol: 'Bi',
      price: null,
      prevClose: null,
      change: null,
      changePct: null,
      unit: 'USD/t',
      exchange: 'N/A',
      source: '暫無免費數據源',
      error: null,
    }),
  ]);

  console.log(JSON.stringify(results, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
