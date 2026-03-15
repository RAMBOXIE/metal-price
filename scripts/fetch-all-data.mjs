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
// 3. Stooq 鉍現貨（BI.F, USD/t）
// ────────────────────────────────────────────

async function fetchStooqBismuth() {
  // BI.F 單位與 AL.F 相同 = USD/t（metric ton）
  // 驗證：AL.F = 3383.25, Yahoo ALI=F = 3423.25，非常接近，確認 Stooq 金屬期貨用 USD/t
  const url = 'https://stooq.com/q/l/?s=BI.F&f=sd2t2ohlcv&h&e=csv';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('Empty CSV');
    const headers = lines[0].split(',').map(h => h.trim());
    const vals = lines[1].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i]; });
    if (obj['Close'] === 'N/D' || !obj['Close']) throw new Error('N/D');
    const price = parseFloat(obj['Close']);
    if (isNaN(price)) throw new Error('Invalid');
    // Stooq CSV 無前日收盤，無法計算 changePct
    return {
      price: +price.toFixed(2),
      unit: 'USD/t',
      exchange: 'Stooq',
      date: obj['Date'],
      changePct: null,
    };
  } catch (err) {
    process.stderr.write(`[fetch-all-data] Stooq BI.F 錯誤: ${err.message}\n`);
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
// ────────────────────────────────────────────

async function fetchIbNews() {
  const queries = [
    'Goldman+Sachs+JPMorgan+Citi+copper+nickel+metals+forecast',
    'bank+metals+copper+nickel+outlook+2026',
  ];

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
      const ibKeywords = ['Goldman', 'JPMorgan', 'Citi', 'Morgan Stanley', 'Bank of America', 'UBS', 'HSBC', 'Barclays', 'BNP', 'Deutsche'];
      const ibItems = items.filter(i => ibKeywords.some(k => i.title.includes(k)));
      if (ibItems.length > 0) {
        process.stderr.write(`[fetch-all-data] ibNews 找到 ${ibItems.length} 條投行新聞 (query: ${q})\n`);
        return ibItems.slice(0, 4);
      }
    } catch (err) {
      process.stderr.write(`[fetch-all-data] IB news fetch failed: ${err.message}\n`);
    }
  }
  process.stderr.write('[fetch-all-data] ibNews 未找到投行標題新聞\n');
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
// v4 新增：8. Reddit r/Commodities 市場情緒
// 狀態：✅ Reddit JSON API 免費可達
// ────────────────────────────────────────────

async function fetchRedditCommodities() {
  try {
    const url = 'https://www.reddit.com/r/Commodities/top.json?t=week&limit=10';
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'MetalPriceBot/4.0 (commodity market research)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const posts = data?.data?.children ?? [];
    const items = posts
      .filter(p => p?.data?.title)
      .map(p => ({
        title: p.data.title,
        score: p.data.score || 0,
        url: `https://reddit.com${p.data.permalink}`,
        selftext: (p.data.selftext || '').slice(0, 200),
      }))
      .slice(0, 5);

    process.stderr.write(`[fetch-all-data] Reddit/Commodities: 提取 ${items.length} 帖\n`);
    return items;
  } catch (err) {
    process.stderr.write(`[fetch-all-data] Reddit抓取失敗: ${err.message}\n`);
    return [];
  }
}

// ────────────────────────────────────────────
// v4 新增：9. 合成 forumSentiment 字段
// ────────────────────────────────────────────

function buildForumSentiment(smmItems, redditItems) {
  // SMM快訊摘要
  let smmHighlights = null;
  if (smmItems.length > 0) {
    smmHighlights = smmItems.map(i => i.title).join(' | ');
  }

  // Reddit 情緒摘要（提取標題作為英文市場共識）
  let redditSummary = null;
  if (redditItems.length > 0) {
    redditSummary = redditItems.map(i => `[${i.score}↑] ${i.title}`).join(' | ');
  }

  return {
    smmHighlights,   // SMM快訊中文標題（供AI提取金屬相關信息）
    redditSummary,   // Reddit r/Commodities 本週熱帖（供AI判斷英語社區情緒）
    xueqiuSummary: null,  // 雪球需登錄，暫不支持（留位）
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

  // 並行抓取所有數據（v4 新增 smmNews + redditCommodities）
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
  ] = await Promise.all([
    fetchCcmnPrices(),
    fetchYahoo('HG=F'),
    fetchYahoo('ZNC=F'),
    fetchYahoo('ALI=F'),          // 鋁現貨 $3,423/t USD
    fetchYahoo(sym2),
    fetchYahoo(sym6),
    fetchStooqBismuth(),           // 鉍現貨 USD/t
    fetchLmeInventory(),
    fetchNews(),
    fetchIbNews(),
    fetchSmmNews(),                // v4 新增：SMM快訊
    fetchRedditCommodities(),      // v4 新增：Reddit情緒
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
    // 鉍（Bi）— 來自 Stooq BI.F，USD/t
    bismuth: {
      usd: bismuth?.price ?? null,
      usdChangePct: bismuth?.changePct ?? null,  // Stooq CSV 無前日收盤，暫為 null
      usdUnit: 'USD/t',
      cny: null,
      cnyChange: null,
      source: bismuth ? 'Stooq/BI.F' : null,
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
    inventory: { copper: null, zinc: null, nickel: null, cobalt: null, note: err.message },
    news: [],
    ibNews: [],
    forumSentiment: { smmHighlights: null, redditSummary: null, xueqiuSummary: null, fetchedAt: new Date().toISOString() },
    error: err.message,
  }, null, 2));
  process.exit(1);
});
