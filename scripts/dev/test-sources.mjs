/**
 * 有色金屬免費數據源測試腳本
 * 測試 Stooq / metals.live / Yahoo Finance / Investing.com
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
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      ...options.headers,
    },
    ...options,
  }), TIMEOUT_MS);
  return res;
}

// ─────────────────────────────────────────────
// 測試1：Stooq.com
// ─────────────────────────────────────────────
async function testStooq() {
  console.log('\n═══════════════════════════════════');
  console.log('測試1：Stooq.com');
  console.log('═══════════════════════════════════');

  const symbols = [
    { url: 'https://stooq.com/q/d/l/?s=lmeni&i=d', name: 'LME Nickel (lmeni)' },
    { url: 'https://stooq.com/q/d/l/?s=lmeco&i=d', name: 'LME Cobalt (lmeco)' },
    { url: 'https://stooq.com/q/d/l/?s=ni.f&i=d',  name: 'Nickel Futures (ni.f)' },
  ];

  const results = [];

  for (const s of symbols) {
    try {
      console.log(`\n  → ${s.name}`);
      console.log(`    URL: ${s.url}`);
      const res = await fetchUrl(s.url);
      const text = await res.text();
      console.log(`    HTTP: ${res.status}`);

      if (!text || text.trim() === '') {
        console.log('    ❌ 空響應');
        results.push({ name: s.name, ok: false, reason: '空響應' });
        continue;
      }

      // 顯示前200字
      console.log(`    原始前200字: ${text.slice(0, 200).replace(/\n/g, '\\n')}`);

      // 嘗試解析 CSV
      const lines = text.trim().split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        console.log('    ❌ 非CSV / 行數不足');
        results.push({ name: s.name, ok: false, reason: '非CSV', preview: text.slice(0, 100) });
        continue;
      }

      const header = lines[0].split(',');
      const last = lines[lines.length - 1].split(',');
      console.log(`    行數: ${lines.length}`);
      console.log(`    Header: ${header.join(', ')}`);
      console.log(`    最後一行: ${last.join(', ')}`);

      // 找 Close 列
      const closeIdx = header.findIndex(h => /close/i.test(h));
      const dateIdx = header.findIndex(h => /date/i.test(h));
      if (closeIdx >= 0) {
        const price = parseFloat(last[closeIdx]);
        const date = dateIdx >= 0 ? last[dateIdx] : 'N/A';
        console.log(`    ✅ 成功！日期: ${date}, 收盤價: ${price}`);
        results.push({ name: s.name, ok: true, date, price });
      } else {
        console.log('    ⚠️  找不到 Close 列');
        results.push({ name: s.name, ok: false, reason: '無Close列', preview: lines[0] });
      }
    } catch (e) {
      console.log(`    ❌ 錯誤: ${e.message}`);
      results.push({ name: s.name, ok: false, reason: e.message });
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// 測試2：metals.live
// ─────────────────────────────────────────────
async function testMetalsLive() {
  console.log('\n═══════════════════════════════════');
  console.log('測試2：metals.live');
  console.log('═══════════════════════════════════');

  const url = 'https://metals.live/api/v1/latest';
  try {
    console.log(`  URL: ${url}`);
    const res = await fetchUrl(url, {
      headers: { 'Accept': 'application/json' }
    });
    console.log(`  HTTP: ${res.status}`);
    const text = await res.text();
    console.log(`  原始前500字: ${text.slice(0, 500)}`);

    let data;
    try { data = JSON.parse(text); } catch { 
      console.log('  ❌ 非JSON響應');
      return { ok: false, reason: '非JSON' };
    }

    // 搜尋 nickel/cobalt 字段
    const keys = Array.isArray(data) ? data.map(d => Object.keys(d)).flat() : Object.keys(data);
    const unique = [...new Set(keys)];
    console.log(`  所有字段: ${unique.join(', ')}`);

    const nickelEntry = Array.isArray(data) 
      ? data.find(d => /nickel/i.test(JSON.stringify(d)))
      : (data.nickel || data.Ni);
    const cobaltEntry = Array.isArray(data) 
      ? data.find(d => /cobalt/i.test(JSON.stringify(d)))
      : (data.cobalt || data.Co);

    console.log(`  Nickel: ${nickelEntry ? JSON.stringify(nickelEntry) : '未找到'}`);
    console.log(`  Cobalt: ${cobaltEntry ? JSON.stringify(cobaltEntry) : '未找到'}`);

    if (nickelEntry || cobaltEntry) {
      console.log('  ✅ 找到鎳/鈷數據！');
      return { ok: true, nickel: nickelEntry, cobalt: cobaltEntry };
    } else {
      console.log('  ⚠️  無鎳/鈷字段（可能只有貴金屬）');
      return { ok: false, reason: '無鎳/鈷字段', availableKeys: unique };
    }
  } catch (e) {
    console.log(`  ❌ 錯誤: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ─────────────────────────────────────────────
// 測試3：Yahoo Finance
// ─────────────────────────────────────────────
async function testYahooFinance() {
  console.log('\n═══════════════════════════════════');
  console.log('測試3：Yahoo Finance 替代 Symbol');
  console.log('═══════════════════════════════════');

  const symbols = [
    { url: 'https://query1.finance.yahoo.com/v8/finance/chart/XNICUSD=X?interval=1d&range=2d', name: 'XNICUSD=X (鎳)' },
    { url: 'https://query1.finance.yahoo.com/v8/finance/chart/XCOBUSD=X?interval=1d&range=2d', name: 'XCOBUSD=X (鈷)' },
    { url: 'https://query1.finance.yahoo.com/v8/finance/chart/NI=F?interval=1d&range=2d',       name: 'NI=F (鎳期貨)' },
  ];

  const results = [];

  for (const s of symbols) {
    try {
      console.log(`\n  → ${s.name}`);
      const res = await fetchUrl(s.url, {
        headers: { 'Accept': 'application/json' }
      });
      console.log(`    HTTP: ${res.status}`);
      const text = await res.text();
      console.log(`    原始前300字: ${text.slice(0, 300)}`);

      let data;
      try { data = JSON.parse(text); } catch {
        console.log('    ❌ 非JSON');
        results.push({ name: s.name, ok: false, reason: '非JSON' });
        continue;
      }

      const chart = data?.chart;
      const result = chart?.result?.[0];
      const error = chart?.error;

      if (error) {
        console.log(`    ❌ API錯誤: ${JSON.stringify(error)}`);
        results.push({ name: s.name, ok: false, reason: error.description || JSON.stringify(error) });
        continue;
      }

      if (!result) {
        console.log('    ❌ 無result數據');
        results.push({ name: s.name, ok: false, reason: '無result' });
        continue;
      }

      const meta = result.meta;
      const closes = result.indicators?.quote?.[0]?.close;
      const timestamps = result.timestamp;

      if (closes && closes.length > 0) {
        const validCloses = closes.filter(c => c != null);
        const lastClose = validCloses[validCloses.length - 1];
        const lastTs = timestamps?.[timestamps.length - 1];
        const lastDate = lastTs ? new Date(lastTs * 1000).toISOString().slice(0, 10) : 'N/A';
        console.log(`    ✅ 成功！Symbol: ${meta?.symbol}, 最新收盤: ${lastClose}, 日期: ${lastDate}, 貨幣: ${meta?.currency}`);
        results.push({ name: s.name, ok: true, symbol: meta?.symbol, price: lastClose, date: lastDate, currency: meta?.currency });
      } else {
        console.log(`    ⚠️  無收盤數據, meta: ${JSON.stringify(meta).slice(0, 200)}`);
        results.push({ name: s.name, ok: false, reason: '無有效收盤價', meta });
      }
    } catch (e) {
      console.log(`    ❌ 錯誤: ${e.message}`);
      results.push({ name: s.name, ok: false, reason: e.message });
    }
  }

  return results;
}

// ─────────────────────────────────────────────
// 測試4：Investing.com 非官方 API
// ─────────────────────────────────────────────
async function testInvesting() {
  console.log('\n═══════════════════════════════════');
  console.log('測試4：Investing.com 非官方 API');
  console.log('═══════════════════════════════════');

  const url = 'https://api.investing.com/api/financialdata/1622406/historical/chart/?period=P1W&interval=PT1H&pointscount=60';
  try {
    console.log(`  URL: ${url}`);
    const res = await fetchUrl(url, {
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://www.investing.com',
        'Referer': 'https://www.investing.com/',
        'domain-id': 'www',
      }
    });
    console.log(`  HTTP: ${res.status}`);
    const text = await res.text();
    console.log(`  原始前400字: ${text.slice(0, 400)}`);

    if (res.status !== 200) {
      console.log('  ❌ 非200響應');
      return { ok: false, reason: `HTTP ${res.status}`, preview: text.slice(0, 200) };
    }

    let data;
    try { data = JSON.parse(text); } catch {
      console.log('  ❌ 非JSON');
      return { ok: false, reason: '非JSON' };
    }

    const dataArr = data?.data || data;
    if (Array.isArray(dataArr) && dataArr.length > 0) {
      const last = dataArr[dataArr.length - 1];
      console.log(`  ✅ 成功！數據點數: ${dataArr.length}, 最後一條: ${JSON.stringify(last)}`);
      return { ok: true, count: dataArr.length, last };
    } else {
      console.log(`  ⚠️  結構不符: ${JSON.stringify(data).slice(0, 200)}`);
      return { ok: false, reason: '結構不符', preview: JSON.stringify(data).slice(0, 200) };
    }
  } catch (e) {
    console.log(`  ❌ 錯誤: ${e.message}`);
    return { ok: false, reason: e.message };
  }
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════╗');
  console.log('║  有色金屬免費數據源測試            ║');
  console.log('╚═══════════════════════════════════╝');
  console.log(`開始時間: ${new Date().toISOString()}`);

  const r1 = await testStooq();
  const r2 = await testMetalsLive();
  const r3 = await testYahooFinance();
  const r4 = await testInvesting();

  // ── 彙總報告 ──
  console.log('\n\n╔═══════════════════════════════════╗');
  console.log('║           測試彙總報告             ║');
  console.log('╚═══════════════════════════════════╝');

  console.log('\n【Stooq.com】');
  for (const r of r1) {
    if (r.ok) console.log(`  ✅ ${r.name}: ${r.date} 收盤 ${r.price}`);
    else console.log(`  ❌ ${r.name}: ${r.reason}`);
  }

  console.log('\n【metals.live】');
  if (r2.ok) {
    console.log(`  ✅ 鎳: ${JSON.stringify(r2.nickel)}`);
    console.log(`  ✅ 鈷: ${JSON.stringify(r2.cobalt)}`);
  } else {
    console.log(`  ❌ ${r2.reason}${r2.availableKeys ? ' | 可用字段: ' + r2.availableKeys.join(',') : ''}`);
  }

  console.log('\n【Yahoo Finance】');
  for (const r of r3) {
    if (r.ok) console.log(`  ✅ ${r.name}: ${r.date} ${r.price} ${r.currency}`);
    else console.log(`  ❌ ${r.name}: ${r.reason}`);
  }

  console.log('\n【Investing.com 非官方】');
  if (r4.ok) console.log(`  ✅ 獲取 ${r4.count} 條歷史數據, 最新: ${JSON.stringify(r4.last)}`);
  else console.log(`  ❌ ${r4.reason}`);

  console.log('\n結束時間: ' + new Date().toISOString());
}

main().catch(console.error);
