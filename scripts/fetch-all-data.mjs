/**
 * fetch-all-data.mjs
 * 收集所有有色金屬原始數據，輸出完整 JSON 到 stdout
 * 目標：≤15 秒完成
 *
 * 輸出結構：
 * { date, dataDate, isMarketOpen, marketNote, changeNote, bismuthNote, prices, forwards, inventory, news, ibNews, forumSentiment }
 *
 * v4 新增：
 * - fetchSmmNews(): SMM上海有色網新聞（免費，HTTP可達）
 * - fetchRedditCommodities(): Reddit r/Commodities 最新帖子
 * - forumSentiment: { redditSummary, smmHighlights } 市場情緒字段
 */

// ────────────────────────────────────────────
// 工具函數
// ────────────────────────────────────────────

function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

// ────────────────────────────────────────────
// 1. CCMN 長江有色現貨（CNY）
// ────────────────────────────────────────────

async function fetchCcmnPrices() {
  const url = 'https://m.ccmn.cn/mhangqing/getCorpStmarketPriceList?marketVmid=40288092327140f601327141c0560001';
  try {
    const res = await fetch(url, {
      headers: {
        'Referer': 'https://m.ccmn.cn/mhangqing/mcjxh/',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.msg || 'API error');

    const list = data.body?.priceList;
    if (!Array.isArray(list)) throw new Error('No priceList');

    const nameMap = {
      '1#铜': 'copper',
      '0#锌': 'zinc',
      '1#镍': 'nickel',
      '1#钴': 'cobalt',
    };

    // 升級一：提取 dataDate 與 isMarketOpen
    const rawDate = list[0]?.publishDate ?? null;
    // publishDate 可能是 "2026-03-13" 或 "2026/03/13"，統一轉為 "YYYY-MM-DD"
    const dataDate = rawDate ? rawDate.replace(/\//g, '-').slice(0, 10) : null;
    const todaySH = today();
    const isMarketOpen = dataDate ? (dataDate === todaySH) : null;

    const result = { copper: null, zinc: null, nickel: null, cobalt: null, dataDate, isMarketOpen };
    for (const item of list) {
      const key = nameMap[item.productSortName];
      if (key) {
        const price = parseFloat(item.avgPrice);
        const updown = parseFloat(item.highsLowsAmount);
        result[key] = {
          price: isNaN(price) ? null : price,
          updown: isNaN(updown) ? null : updown,
        };
      }
    }
    return result;
  } catch (err) {
    process.stderr.write(`[fetch-all-data] CCMN 錯誤: ${err.message}\n`);
    return null;
  }
}

// ────────────────────────────────────────────
// 2. Yahoo Finance v8（USD 現貨 / 遠期合約）
// ────────────────────────────────────────────

async function fetchYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error('No result');

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? null;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    let changePct = null;
    if (price != null && prevClose != null) {
      changePct = +((price - prevClose) / prevClose * 100).toFixed(2);
    }

    // 驗證數據是否過期（超過 30 天視為無效）
    const tradingDate = new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10);
    const daysDiff = (Date.now() - meta.regularMarketTime * 1000) / 86400000;
    if (daysDiff > 30) {
      return { symbol, ok: false, price: null, changePct: null, expiry: null, error: `Stale data: last traded ${tradingDate} (${Math.floor(daysDiff)}d ago)` };
    }

    // 合約到期月份（從 symbol 推算）
    let expiry = null;
    if (symbol !== 'HG=F' && symbol !== 'ZNC=F' && symbol !== 'ALI=F') {
      const m = symbol.match(/HG([FGHJKMNQUVXZ])(\d{2})\.CMX/);
      if (m) {
        const monthCodeMap = { F:1,G:2,H:3,J:4,K:5,M:6,N:7,Q:8,U:9,V:10,X:11,Z:12 };
        const mNum = String(monthCodeMap[m[1]]).padStart(2, '0');
        const yr = 2000 + parseInt(m[2]);
        expiry = `${yr}-${mNum}`;
      }
    } else {
      // 現貨合約用當前月份
      const now = new Date();
      expiry = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    }

    return { symbol, ok: true, price, changePct, expiry };
  } catch (err) {
    process.stderr.write(`[fetch-all-data] Yahoo ${symbol} 錯誤: ${err.message}\n`);
    return { symbol, ok: false, price: null, changePct: null, expiry: null };
  }
}

// ────────────────────────────────────────────
// v7 新增：有色金屬行業指數（Yahoo Finance）
// 測試結果（2026-03-15）：
//   ^LMEX ⚠️ 過舊（2019）| JJM ⚠️ 過舊（2023）
//   XME ✅ | COPX ✅ | PICK ✅ | 000812.SS ✅
//   512400 ❌404 | 159163 ❌404
// 選定：XME（廣泛礦業） + COPX（銅礦股） + 000812.SS（申萬A股）
// ────────────────────────────────────────────

async function fetchMetalIndices() {
  const symbols = [
    { symbol: 'XME',       name: 'SPDR S&P Metals & Mining ETF',   market: 'US', currency: 'USD' },
    { symbol: 'COPX',      name: 'Global X Copper Miners ETF',      market: 'US', currency: 'USD' },
    { symbol: '000812.SS', name: '申萬有色金屬指數',                 market: 'CN', currency: 'CNY' },
  ];

  const results = await Promise.all(symbols.map(async ({ symbol, name, market, currency }) => {
    const data = await fetchYahoo(symbol);
    if (!data.ok || data.price === null) return null;
    const changeAbs = (data.price != null && data.changePct != null)
      ? +(data.price * data.changePct / (100 + data.changePct)).toFixed(3)
      : null;
    return {
      symbol,
      name,
      market,
      currency,
      price: data.price,
      changePct: data.changePct,
      changeAbs,
    };
  }));

  return results.filter(Boolean);
}

// ────────────────────────────────────────────
// 3. 鉍（Bi）— SMM 上海有色網 h5 頁面（免費，__NEXT_DATA__ 嵌入）
// ────────────────────────────────────────────
// URL: https://hq.smm.cn/h5/bismuth-price
// 數據：精鉍價格(CNY/t) + 精鉍CIF(USD/kg) + 4N/5N三氧化二鉍(CNY/t)
// 欄位：high / low / average / vchange(日變動絕對值) / vchange_rate(%) / renew_date
// 無需登錄，__NEXT_DATA__ 直接嵌入完整 JSON
// ────────────────────────────────────────────

async function fetchSmmBismuth() {
  try {
    const res = await fetch('https://hq.smm.cn/h5/bismuth-price', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.smm.cn/',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 解析 __NEXT_DATA__
    const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nd) throw new Error('__NEXT_DATA__ not found');
    const json = JSON.parse(nd[1]);

    const sections = json?.props?.pageProps?.datas?.BIP01?.data;
    if (!Array.isArray(sections)) throw new Error('BIP01 data not found');

    const result = { cny: null, usd: null, source: 'SMM/hq.smm.cn' };

    for (const section of sections) {
      for (const item of (section.data || [])) {
        const name = item.product_name || '';
        // 铋 = U+94CB
        // 精铋价格 (CNY/t)：name 含「铋」且不含 CIF，unit 含「元」
        if (name.includes('\u94cb') && !name.includes('CIF') && item.unit && item.unit.includes('\u5143') && !name.includes('N\u4e09')) {
          result.cny = {
            average: item.average,
            high: item.high,
            low: item.low,
            change: item.vchange,
            changePct: item.vchange_rate,
            unit: item.unit,
            dataDate: item.renew_date,
          };
        } else if (name.includes('\u94cb') && name.includes('CIF')) {
          // 精铋CIF价格 (USD/kg → 換算 USD/t)
          const avgUsdPerKg = item.average;
          result.usd = {
            averagePerKg: avgUsdPerKg,
            average: avgUsdPerKg != null ? +(avgUsdPerKg * 1000).toFixed(0) : null, // USD/t
            high: item.high != null ? item.high * 1000 : null,
            low: item.low != null ? item.low * 1000 : null,
            change: item.vchange != null ? +(item.vchange * 1000).toFixed(0) : null,
            changePct: item.vchange_rate,
            unit: 'USD/t',
            dataDate: item.renew_date,
          };
        }
      }
    }

    if (!result.cny && !result.usd) throw new Error('No bismuth prices found in page');

    const cnyAvg = result.cny?.average;
    const usdAvg = result.usd?.average;
    process.stderr.write(`[fetch-all-data] SMM 鉍價格：¥${cnyAvg}/t（日變動 ${result.cny?.change}）/ $${usdAvg}/t CIF\n`);
    return result;
  } catch (err) {
    process.stderr.write(`[fetch-all-data] SMM 鉍抓取失敗: ${err.message}\n`);
    return null;
  }
}

// ────────────────────────────────────────────
// 4. LME 庫存（三個方案，盡力而為）
// ────────────────────────────────────────────

async function fetchLmeInventory() {
  const errors = [];

  // 方案A：LME 官方 API（5s 快速超時，失敗立即轉方案B）
  try {
    const res = await fetch(
      'https://www.lme.com/api/Reports/WarehouseStockByMetalReportDownload?fileName=&isInternal=false',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.lme.com/',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error(`Non-JSON response: ${ct}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Not array');

    const metalMap = { Copper: 'copper', Nickel: 'nickel', Zinc: 'zinc', Cobalt: 'cobalt' };
    const result = { copper: null, zinc: null, nickel: null, cobalt: null, note: null };
    for (const row of data) {
      const key = metalMap[row.Metal];
      if (key && row.Total != null) {
        result[key] = { tonnes: parseFloat(row.Total) || null, change: null, source: 'LME', unit: 'tonnes' };
      }
    }
    process.stderr.write('[fetch-all-data] LME 方案A 成功\n');
    return result;
  } catch (err) {
    errors.push(`方案A: ${err.message}`);
    process.stderr.write(`[fetch-all-data] LME 方案A 失敗: ${err.message}\n`);
  }

  // 方案B：LME 倉庫統計頁面 HTML
  try {
    const res = await fetch(
      'https://www.lme.com/Market-Data/Reports-and-data/Warehouse-Stock-Statistics',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (html.includes('Just a moment') || html.includes('Cloudflare')) throw new Error('Cloudflare 攔截');

    const result = { copper: null, zinc: null, nickel: null, cobalt: null, note: null };
    const metalPatterns = [
      { key: 'copper', regex: /[Cc]opper[^0-9]*?([\d,]+)\s*tonnes?/i },
      { key: 'nickel', regex: /[Nn]ickel[^0-9]*?([\d,]+)\s*tonnes?/i },
      { key: 'zinc',   regex: /[Zz]inc[^0-9]*?([\d,]+)\s*tonnes?/i },
    ];
    for (const { key, regex } of metalPatterns) {
      const m = html.match(regex);
      if (m) {
        const tonnes = parseInt(m[1].replace(/,/g, ''), 10);
        if (!isNaN(tonnes)) {
          result[key] = { tonnes, change: null, source: 'LME', unit: 'tonnes' };
        }
      }
    }
    const hasData = Object.values(result).some(v => v && v.tonnes != null);
    if (!hasData) throw new Error('頁面無可解析數據');
    process.stderr.write('[fetch-all-data] LME 方案B 成功\n');
    return result;
  } catch (err) {
    errors.push(`方案B: ${err.message}`);
    process.stderr.write(`[fetch-all-data] LME 方案B 失敗: ${err.message}\n`);
  }

  // 方案C：Investing.com metals data
  try {
    const res = await fetch(
      'https://api.investing.com/api/financialdata/assets/equitiesByType?country=&type=metals&page=0&pageSize=20',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'domain-id': 'www',
        },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data) throw new Error('Empty response');
    // Investing.com 不提供庫存數據，此方案會失敗
    throw new Error('Investing.com 不提供 LME 庫存數據');
  } catch (err) {
    errors.push(`方案C: ${err.message}`);
    process.stderr.write(`[fetch-all-data] LME 方案C 失敗: ${err.message}\n`);
  }

  // 所有方案失敗
  const note = `LME 庫存獲取失敗: ${errors.join(' | ')}`;
  process.stderr.write(`[fetch-all-data] 所有 LME 方案失敗，返回 null\n`);
  return {
    copper: null,
    zinc: null,
    nickel: null,
    cobalt: null,
    note,
  };
}

// ────────────────────────────────────────────
// 5. Google News RSS 新聞
// ────────────────────────────────────────────

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                       block.match(/<title>([\s\S]*?)<\/title>/);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/) ||
                      block.match(/<guid[^>]*>(https?:\/\/[^\s<]+)<\/guid>/);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const url = linkMatch ? linkMatch[1].trim() : '';
    if (title) items.push({ title, url });
  }
  return items;
}

async function fetchNews() {
  const rssUrl = 'https://news.google.com/rss/search?q=%E6%9C%89%E8%89%B2%E9%87%91%E5%B1%9E+%E4%BB%B7%E6%A0%BC&hl=zh-CN&gl=CN&ceid=CN:zh-Hans';
  try {
    const res = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MetalPriceBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml);
    return items.slice(0, 5);
  } catch (err) {
    process.stderr.write(`[fetch-all-data] 新聞抓取失敗: ${err.message}\n`);
    return [];
  }
}

// ────────────────────────────────────────────
// 6. 投行分析新聞（ibNews）
// v5: 改為基本金屬雙重過濾（投行名字 AND 基本金屬關鍵詞）
// ────────────────────────────────────────────

async function fetchIbNews() {
  const queries = [
    'Goldman+Sachs+JPMorgan+Citi+copper+nickel+zinc+outlook',
    'copper+nickel+zinc+cobalt+forecast+bank+2026',
    'base+metals+copper+nickel+Goldman+JPMorgan+forecast',
  ];

  const ibKeywords = ['Goldman', 'JPMorgan', 'Citi', 'Morgan Stanley', 'Bank of America', 'UBS', 'HSBC', 'Barclays', 'BNP', 'Deutsche'];
  const metalKeywords = ['copper', 'nickel', 'zinc', 'cobalt', 'alumin', 'base metal', 'industrial metal'];

  const allItems = [];

  for (const q of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MetalPriceBot/1.0)',
          'Accept': 'application/rss+xml, */*',
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRssItems(xml);

      // 雙重過濾：同時包含投行名字 AND 基本金屬關鍵詞
      const doubleFiltered = items.filter(i =>
        ibKeywords.some(k => i.title.toLowerCase().includes(k.toLowerCase())) &&
        metalKeywords.some(m => i.title.toLowerCase().includes(m.toLowerCase()))
      );

      if (doubleFiltered.length > 0) {
        process.stderr.write(`[fetch-all-data] ibNews 雙重過濾找到 ${doubleFiltered.length} 條基本金屬投行新聞 (query: ${q})\n`);
        // 合併去重
        for (const item of doubleFiltered) {
          if (!allItems.some(x => x.title === item.title)) allItems.push(item);
        }
      } else {
        process.stderr.write(`[fetch-all-data] ibNews 雙重過濾無結果 (query: ${q})，嘗試只過濾金屬關鍵詞\n`);
        // fallback：只過濾金屬關鍵詞
        const metalOnly = items.filter(i =>
          metalKeywords.some(m => i.title.toLowerCase().includes(m.toLowerCase()))
        );
        for (const item of metalOnly) {
          if (!allItems.some(x => x.title === item.title)) {
            allItems.push({ ...item, source: 'industry_news' });
          }
        }
      }
    } catch (err) {
      process.stderr.write(`[fetch-all-data] IB news fetch failed: ${err.message}\n`);
    }
  }

  if (allItems.length > 0) {
    process.stderr.write(`[fetch-all-data] ibNews 最終 ${allItems.length} 條\n`);
    return allItems.slice(0, 4);
  }
  process.stderr.write('[fetch-all-data] ibNews 未找到相關新聞\n');
  return [];
}

// ────────────────────────────────────────────
// v4 新增：7. SMM上海有色網新聞（免費公開）
// 狀態：✅ 200 OK，無需登錄即可抓取新聞標題
// ────────────────────────────────────────────

async function fetchSmmNews() {
  try {
    const res = await fetch('https://www.smm.cn/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 提取新聞標題（SMM 主頁快訊格式：包含日期時間和標題）
    const items = [];

    // 方式1：匹配 SMM快讯 格式
    const flashRegex = /【SMM[^】]*】([^<\n]{10,100})/g;
    let m;
    while ((m = flashRegex.exec(html)) !== null && items.length < 8) {
      const title = m[0].replace(/<[^>]+>/g, '').trim();
      if (title.length > 10) items.push({ title, source: 'SMM' });
    }

    // 方式2：匹配帶有日期的新聞標題區塊
    if (items.length < 3) {
      const titleRegex = /<a[^>]+href="https:\/\/news\.smm\.cn\/news\/[^"]+">([^<]{10,120})<\/a>/g;
      while ((m = titleRegex.exec(html)) !== null && items.length < 8) {
        const title = m[1].trim();
        if (title.length > 8 && !items.some(i => i.title === title)) {
          items.push({ title, source: 'SMM' });
        }
      }
    }

    process.stderr.write(`[fetch-all-data] SMM新聞: 提取 ${items.length} 條\n`);
    return items.slice(0, 5);
  } catch (err) {
    process.stderr.write(`[fetch-all-data] SMM新聞抓取失敗: ${err.message}\n`);
    return [];
  }
}

// ────────────────────────────────────────────
// v5 更新：8. Reddit 有色金屬相關討論
// 改為 r/Economics 搜索 copper+metals（v5測試結果：3條有效帖）
// 測試結果：r/mining(1帖), r/metallurgy(2帖), r/investing(0帖),
//           r/Economics search(3帖✅), global search(3帖但多為遊戲/藝術)
// ────────────────────────────────────────────

async function fetchRedditCommodities() {
  const metalKw = ['copper', 'nickel', 'zinc', 'cobalt', 'alumin', 'lead', 'tin',
                   'base metal', 'industrial metal', 'non-ferrous', 'lme', 'comex',
                   'mining', 'ore', 'smelter', 'refinery'];

  try {
    // 並行抓取 top（本週）和 hot（當前）
    const [topRes, hotRes] = await Promise.all([
      fetch('https://www.reddit.com/r/Commodities/top.json?t=week&limit=25', {
        headers: { 'User-Agent': 'MetalPriceBot/5.0 (non-ferrous metals research)' },
        signal: AbortSignal.timeout(8000),
      }),
      fetch('https://www.reddit.com/r/Commodities/hot.json?limit=25', {
        headers: { 'User-Agent': 'MetalPriceBot/5.0 (non-ferrous metals research)' },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const topData = topRes.ok ? await topRes.json() : { data: { children: [] } };
    const hotData = hotRes.ok ? await hotRes.json() : { data: { children: [] } };

    const parsePosts = (data) => (data?.data?.children ?? [])
      .filter(p => p?.data?.title)
      .map(p => ({
        id: p.data.id,
        title: p.data.title,
        score: p.data.score || 0,
        url: `https://reddit.com${p.data.permalink}`,
      }));

    const topPosts = parsePosts(topData);
    const hotPosts = parsePosts(hotData);

    // 金屬關鍵詞過濾
    const isMetalRelated = (title) =>
      metalKw.some(k => title.toLowerCase().includes(k));

    const metalTop = topPosts.filter(p => isMetalRelated(p.title));
    const metalHot = hotPosts.filter(p => isMetalRelated(p.title));

    // 找出異動帖（在 hot 榜但不在 top 榜的 id）
    const topIds = new Set(topPosts.map(p => p.id));
    const surgingPosts = metalHot.filter(p => !topIds.has(p.id));

    // 組合輸出：金屬相關 top + 異動帖
    const combined = [
      ...metalTop.slice(0, 4).map(p => ({ ...p, tag: 'top' })),
      ...surgingPosts.slice(0, 2).map(p => ({ ...p, tag: 'surging' })),
    ];

    // 如果完全沒有金屬相關帖子，返回前3條 top 帖（帶 tag: 'general'）供參考
    const result = combined.length > 0
      ? combined
      : topPosts.slice(0, 3).map(p => ({ ...p, tag: 'general_commodities' }));

    const metalCount = metalTop.length + surgingPosts.length;
    process.stderr.write(`[fetch-all-data] Reddit r/Commodities: top=${topPosts.length}帖, hot=${hotPosts.length}帖, 金屬相關=${metalCount}帖, 異動=${surgingPosts.length}帖\n`);
    return result;
  } catch (err) {
    process.stderr.write(`[fetch-all-data] Reddit抓取失敗: ${err.message}\n`);
    return [];
  }
}

// ────────────────────────────────────────────
// v4 新增：9. 合成 forumSentiment 字段
// ────────────────────────────────────────────

function buildForumSentiment(smmItems, redditItems) {
  let smmHighlights = null;
  if (smmItems.length > 0) {
    smmHighlights = smmItems.map(i => i.title).join(' | ');
  }

  let redditSummary = null;
  let redditSurging = null;
  if (redditItems.length > 0) {
    const topItems = redditItems.filter(p => p.tag === 'top' || p.tag === 'general_commodities');
    const surgingItems = redditItems.filter(p => p.tag === 'surging');

    if (topItems.length > 0) {
      redditSummary = topItems.map(i => `[${i.score}↑] ${i.title}`).join(' | ');
    }
    if (surgingItems.length > 0) {
      redditSurging = surgingItems.map(i => `[異動🔥] ${i.title}`).join(' | ');
    }
  }

  return {
    smmHighlights,
    redditSummary,    // 金屬相關 top 帖
    redditSurging,    // 異動帖（hot but not top）
    xueqiuSummary: null,
    fetchedAt: new Date().toISOString(),
  };
}

// ────────────────────────────────────────────
// 主函數
// ────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  // 計算遠期合約 symbol
  const now = new Date();
  const monthCodes = ['F','G','H','J','K','M','N','Q','U','V','X','Z'];
  const curr = now.getMonth(); // 0-11
  const m2 = monthCodes[(curr + 2) % 12];
  const m6 = monthCodes[(curr + 6) % 12];
  const y2 = (curr + 2 >= 12) ? (now.getFullYear() + 1) % 100 : now.getFullYear() % 100;
  const y6 = (curr + 6 >= 12) ? (now.getFullYear() + 1) % 100 : now.getFullYear() % 100;
  const sym2 = `HG${m2}${y2 < 10 ? '0'+y2 : y2}.CMX`;
  const sym6 = `HG${m6}${y6 < 10 ? '0'+y6 : y6}.CMX`;

  process.stderr.write(`[fetch-all-data] 遠期合約: 近月=${sym2}, 遠月=${sym6}\n`);

  // 並行抓取所有數據（v7 新增 metalIndices）
  const [
    ccmn,
    copperSpot,
    zincSpot,
    alumSpot,
    fwdNear,
    fwdFar,
    bismuth,
    inventory,
    news,
    ibNews,
    smmNews,
    redditPosts,
    metalIndices,
  ] = await Promise.all([
    fetchCcmnPrices(),
    fetchYahoo('HG=F'),
    fetchYahoo('ZNC=F'),
    fetchYahoo('ALI=F'),          // 鋁現貨 USD/t
    fetchYahoo(sym2),
    fetchYahoo(sym6),
    fetchSmmBismuth(),             // 鉍：SMM h5 頁面實時數據
    fetchLmeInventory(),
    fetchNews(),
    fetchIbNews(),
    fetchSmmNews(),
    fetchRedditCommodities(),
    fetchMetalIndices(),
  ]);

  // 升級一：dataDate / isMarketOpen / marketNote
  const dataDate = ccmn?.dataDate ?? null;
  const isMarketOpen = ccmn?.isMarketOpen ?? null;
  const todaySH = today();
  let marketNote = null;
  if (isMarketOpen === false && dataDate) {
    const displayDate = dataDate.replace(/-/g, '/');
    marketNote = `休市：數據截至 ${displayDate}（上個交易日）`;
  }

  // 組裝 prices（升級二：加入 bismuth；升級四：確保欄位語義清晰）
  const prices = {
    copper: {
      usd: copperSpot.price,
      usdChangePct: copperSpot.changePct,   // 日環比 %（vs 前一交易日收盤）
      usdUnit: 'USD/lb',
      cny: ccmn?.copper?.price ?? null,
      cnyChange: ccmn?.copper?.updown ?? null,  // 日環比 元/噸
    },
    zinc: {
      usd: zincSpot.ok ? zincSpot.price : null,  // 若 ZNC=F stale (>30天)，ok=false，price=null
      usdChangePct: null,   // 強制 null，ZNC=F prevClose 不可信（2019年舊數據）
      usdUnit: 'USD/t',
      cny: ccmn?.zinc?.price ?? null,
      cnyChange: ccmn?.zinc?.updown ?? null,
    },
    aluminum: {
      usd: alumSpot.ok ? alumSpot.price : null,
      usdChangePct: alumSpot.ok ? alumSpot.changePct : null,
      usdUnit: 'USD/t',
      cny: null,   // CCMN 有 A00鋁，但非當前重點
      cnyChange: null,
    },
    nickel: {
      usd: null,
      usdChangePct: null,
      usdUnit: 'USD/t',
      cny: ccmn?.nickel?.price ?? null,
      cnyChange: ccmn?.nickel?.updown ?? null,
    },
    cobalt: {
      usd: null,
      usdChangePct: null,
      usdUnit: 'USD/t',
      cny: ccmn?.cobalt?.price ?? null,
      cnyChange: ccmn?.cobalt?.updown ?? null,
    },
    // 鉍（Bi）— SMM 上海有色網實時數據
    bismuth: bismuth ? {
      cny: bismuth.cny?.average ?? null,
      cnyHigh: bismuth.cny?.high ?? null,
      cnyLow: bismuth.cny?.low ?? null,
      cnyChange: bismuth.cny?.change ?? null,       // 日環比絕對值 元/噸
      cnyChangePct: bismuth.cny?.changePct ?? null, // 日環比 %
      cnyUnit: '\u5143/\u5428',
      usd: bismuth.usd?.average ?? null,            // USD/t (CIF)
      usdHigh: bismuth.usd?.high ?? null,
      usdLow: bismuth.usd?.low ?? null,
      usdChange: bismuth.usd?.change ?? null,
      usdChangePct: bismuth.usd?.changePct ?? null,
      usdUnit: 'USD/t',
      dataDate: bismuth.cny?.dataDate ?? bismuth.usd?.dataDate ?? null,
      source: bismuth.source,
    } : {
      cny: null, usd: null,
      source: null,
      note: 'SMM\u9285\u53d6\u5931\u6557\uff0c\u66ab\u7121\u9209\u6578\u64da',
    },
  };

  // 組裝 forwards
  const spotExpiry = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const forwards = {
    copper: {
      spot: {
        price: copperSpot.price,
        symbol: 'HG=F',
        expiry: spotExpiry,
      },
      near: {
        price: fwdNear.price,
        symbol: sym2,
        expiry: fwdNear.expiry,
      },
      far: {
        price: fwdFar.price,
        symbol: sym6,
        expiry: fwdFar.expiry,
      },
    },
  };

  // v4 新增：組裝 forumSentiment
  const forumSentiment = buildForumSentiment(smmNews, redditPosts);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stderr.write(`[fetch-all-data] 完成，耗時 ${elapsed}s\n`);

  const output = {
    date: todaySH,
    dataDate,                                            // 升級一
    isMarketOpen,                                        // 升級一
    marketNote,                                          // 升級一
    changeNote: '所有漲跌均為日環比（vs 前一交易日收盤）',
    prices,
    forwards,
    indices: metalIndices,                               // v7 新增：有色行業指數
    inventory,
    news,
    ibNews,                                              // 升級三
    forumSentiment,                                      // v4 新增
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => {
  process.stderr.write(`[fetch-all-data] 致命錯誤: ${err.message}\n`);
  // 即使崩潰也輸出合法 JSON
  console.log(JSON.stringify({
    date: today(),
    dataDate: null,
    isMarketOpen: null,
    marketNote: null,
    changeNote: '所有漲跌均為日環比（vs 前一交易日收盤）',
    prices: { copper: null, zinc: null, aluminum: null, nickel: null, cobalt: null, bismuth: null },
    forwards: { copper: null },
    indices: [],
    inventory: { copper: null, zinc: null, nickel: null, cobalt: null, note: err.message },
    news: [],
    ibNews: [],
    forumSentiment: { smmHighlights: null, redditSummary: null, redditSurging: null, xueqiuSummary: null, fetchedAt: new Date().toISOString() },
    error: err.message,
  }, null, 2));
  process.exit(1);
});
