/**
 * daily-report.mjs
 * 调用 fetch-all-data.mjs，生成六板块有色日报，发送至 Telegram
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const execFileAsync = promisify(execFile);

// ────────────────────────────────────────────
// 读取 .env
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
    process.stderr.write('[daily-report] ✅ 已读取 .env\n');
  } catch {
    process.stderr.write('[daily-report] ℹ️  未找到 .env\n');
  }
  return env;
}

// ────────────────────────────────────────────
// 执行子脚本，返回解析后的 JSON
// ────────────────────────────────────────────
async function runScript(scriptName) {
  const scriptPath = join(__dirname, scriptName);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [scriptPath],
    { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
  );
  if (stderr) process.stderr.write(stderr);
  return JSON.parse(stdout);
}

// ────────────────────────────────────────────
// 格式化工具
// ────────────────────────────────────────────
function fmtNum(n, decimals = 0) {
  if (n == null) return null;
  const parts = Number(n).toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals > 0 ? parts.join('.') : parts[0];
}

function fmtPct(pct) {
  if (pct == null) return '—';
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function fmtChange(v) {
  if (v == null || v === 0) return '—';
  const sign = v > 0 ? '▲' : '▼';
  return `${sign}${fmtNum(Math.abs(v))}`;
}

function emoji(v) {
  if (v == null) return '⚪';
  if (v > 0.1) return '🟢';
  if (v < -0.1) return '🔴';
  return '🔵';
}

// ────────────────────────────────────────────
// 日期校验：只保留 48h 内的新闻
// ────────────────────────────────────────────
function freshNews(items) {
  if (!items || items.length === 0) return [];
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return items.filter(item => {
    if (!item.publishedAt) return true;
    const ts = Date.parse(item.publishedAt);
    return isNaN(ts) || ts >= cutoff;
  });
}

// ────────────────────────────────────────────
// 组装报告
// ────────────────────────────────────────────
function buildReport(d) {
  const p = d.prices;
  const inv = d.inventory || {};
  const fwd = d.forwards?.copper;
  const idx = d.indices || [];
  // 目標品種：Cu / Zn / Ni / Co / Mg / Bi（不含 Al）

  const lines = [];

  // 标题
  const dateStr = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  lines.push(`📊 *有色金屬日報* · ${dateStr}`);
  lines.push('');

  // ── 一、行情快照 ──
  lines.push('━━━ 一、行情快照 ━━━');

  // 铜
  const cu = p.copper;
  if (cu) {
    const usdDir = cu.usdChangePct;
    const cuEmoji = emoji(usdDir ?? cu.cnyChange);
    let line = `${cuEmoji} 銅（Cu）`;
    if (cu.usd != null) line += `USD ${fmtNum(cu.usd, 3)}/lb ${fmtPct(cu.usdChangePct)} [COMEX]`;
    if (cu.cny != null) line += `  |  CNY ${fmtNum(cu.cny)}/t ${fmtChange(cu.cnyChange)} [長江]`;
    lines.push(line);
  }

  // 锌
  const zn = p.zinc;
  if (zn) {
    const znEmoji = emoji(zn.usdChangePct ?? zn.cnyChange);
    let line = `${znEmoji} 鋅（Zn）`;
    if (zn.usd != null) line += `USD ${fmtNum(zn.usd)}/t ${fmtPct(zn.usdChangePct)} [LME Cash]`;
    if (zn.cny != null) line += `  |  CNY ${fmtNum(zn.cny)}/t ${fmtChange(zn.cnyChange)} [長江]`;
    lines.push(line);
  }

  // 镍
  const ni = p.nickel;
  if (ni) {
    const niEmoji = emoji(ni.usdChangePct ?? ni.cnyChange);
    let line = `${niEmoji} 鎳（Ni）`;
    if (ni.usd != null) line += `USD ${fmtNum(ni.usd)}/t ${fmtPct(ni.usdChangePct)} [LME Cash]`;
    if (ni.cny != null) line += `  |  CNY ${fmtNum(ni.cny)}/t ${fmtChange(ni.cnyChange)} [長江]`;
    lines.push(line);
  }

  // 钴
  const co = p.cobalt;
  if (co) {
    const coEmoji = emoji(co.cnyChange);
    let line = `${coEmoji} 鈷（Co）`;
    if (co.usd != null) {
      line += `USD ${fmtNum(co.usd)}/t`;
      if (co.usdDataDate && co.usdDataDate !== d.date) line += ` (${co.usdDataDate})`;
    }
    if (co.cny != null) line += `  |  CNY ${fmtNum(co.cny)}/t ${fmtChange(co.cnyChange)} [長江]`;
    lines.push(line);
  }

  // 铋
  const bi = p.bismuth;
  if (bi) {
    const biEmoji = emoji(bi.cnyChangePct ?? 0);
    let line = `${biEmoji} 鉍（Bi）`;
    if (bi.usd != null) line += `USD ${fmtNum(bi.usd)}/t`;
    if (bi.cny != null) line += `  |  CNY ${fmtNum(bi.cny)}/t ${fmtChange(bi.cnyChange)} [SMM]`;
    lines.push(line);
  }

  // 镁
  const mg = p.magnesium;
  if (mg?.cny != null) {
    lines.push(`${emoji(mg.cnyChange)} 鎂（Mg）CNY ${fmtNum(mg.cny)}/t ${fmtChange(mg.cnyChange)} [CCMN]`);
  } else {
    lines.push('⚪ 鎂（Mg）暫無數據');
  }

  // 铜期货结构
  if (fwd) {
    lines.push('');
    const spot = fwd.spot ? `${fwd.spot.expiry} USD ${fmtNum(fwd.spot.price, 3)}/lb` : '—';
    const near = fwd.near ? `${fwd.near.expiry} USD ${fmtNum(fwd.near.price, 3)}/lb` : '—';
    const far  = fwd.far  ? `${fwd.far.expiry}  USD ${fmtNum(fwd.far.price, 3)}/lb` : '—';
    lines.push(`📐 銅期貨結構：${spot} → ${near} → ${far}`);
    // 判断近端结构
    if (fwd.spot && fwd.near) {
      const spread = fwd.near.price - fwd.spot.price;
      const struct = spread < 0 ? '近端 Backwardation（現貨偏緊）' : '近端 Contango（現貨寬鬆）';
      lines.push(`   ${struct}`);
    }
  }

  lines.push('');

  // ── 二、行业指数 ──
  lines.push('━━━ 二、行業指數 ━━━');
  for (const ix of idx) {
    const ixEmoji = emoji(ix.changePct);
    const priceStr = ix.currency === 'USD'
      ? `USD ${fmtNum(ix.price, 2)}`
      : `CNY ${fmtNum(ix.price, 2)}`;
    lines.push(`${ixEmoji} ${ix.symbol}（${ix.name}）${priceStr} ${fmtPct(ix.changePct)}`);
  }
  // A/H 分化判断
  const xme = idx.find(i => i.symbol === 'XME');
  const sw  = idx.find(i => i.symbol === '000812.SS');
  if (xme && sw) {
    if (xme.changePct > 0 && sw.changePct < 0) {
      lines.push('⚡ A/H 分化：美礦走強，A股有色承壓');
    } else if (xme.changePct < 0 && sw.changePct > 0) {
      lines.push('⚡ A/H 分化：A股有色走強，美礦回調');
    }
  }
  lines.push('');

  // ── 三、技术面 ──
  lines.push('━━━ 三、技術面 ━━━');
  if (cu?.usd != null) {
    const cuPrice = cu.usd;
    const support = (cuPrice * 0.97).toFixed(3);
    const resist  = fwd?.far ? fmtNum(fwd.far.price, 3) : (cuPrice * 1.02).toFixed(3);
    lines.push(`• 銅 COMEX：現報 USD ${fmtNum(cuPrice, 3)}/lb，支撐 ~USD ${support}，阻力參考遠月 USD ${resist}`);
  }
  if (zn?.usd != null) {
    const znTrend = (zn.usdChangePct ?? 0) < -1 ? '短線偏弱，關注支撐' : '橫盤整理，方向待確認';
    lines.push(`• 鋅 LME：USD ${fmtNum(zn.usd)}/t，${znTrend}`);
  }
  if (ni?.usd != null) {
    const niTrend = (ni.usdChangePct ?? 0) < -1 ? '下跌通道，暫勿追多' : '區間震盪，等待突破';
    lines.push(`• 鎳 LME：USD ${fmtNum(ni.usd)}/t，${niTrend}`);
  }
  if (co?.cny != null) {
    lines.push(`• 鈷 CNY：¥${fmtNum(co.cny)}/t，${(co.cnyChange ?? 0) === 0 ? '橫盤，缺乏主導驅動' : ((co.cnyChange ?? 0) > 0 ? '小幅反彈，底部待確認' : '繼續尋底，謹慎')}`);
  }
  if (bi?.cny != null) {
    lines.push(`• 鉍 CNY：¥${fmtNum(bi.cny)}/t，波動偏小，流動性受限`);
  }
  if (mg?.cny != null) {
    lines.push(`• 鎂 CNY：¥${fmtNum(mg.cny)}/t，${(mg.cnyChange ?? 0) === 0 ? '價格平穩，供需均衡' : ((mg.cnyChange ?? 0) > 0 ? '小幅走高，能源成本驅動' : '回落，關注需求端跟進')}`);
  }
  lines.push('');

  // ── 四、基本面（库存） ──
  lines.push('━━━ 四、基本面（LME 庫存） ━━━');
  if (inv.copper?.tonnes != null) {
    lines.push(`• 銅：${fmtNum(inv.copper.tonnes)} t ${fmtChange(inv.copper.change)}（${inv.copper.change > 0 ? '累庫，壓制升水' : '去庫，支撐現貨'}）`);
  }
  if (inv.zinc?.tonnes != null) {
    lines.push(`• 鋅：${fmtNum(inv.zinc.tonnes)} t ${fmtChange(inv.zinc.change)}（${inv.zinc.change < 0 ? '去庫，供應偏緊' : '累庫，壓力存在'}）`);
  }
  if (inv.nickel?.tonnes != null) {
    lines.push(`• 鎳：${fmtNum(inv.nickel.tonnes)} t ${fmtChange(inv.nickel.change)}`);
  }
  if (inv.copper?.dataDate) {
    lines.push(`_庫存截至 ${inv.copper.dataDate}_`);
  }
  lines.push('');

  // ── 五、市场情绪与机构观点 ──
  lines.push('━━━ 五、市場情緒與機構觀點 ━━━');

  const ibItems = freshNews(d.ibNews);
  const forum = d.forumSentiment;
  const cnNews = freshNews(d.news);

  // 机构观点（文字提炼）
  const ibSummaries = [];
  for (const item of ibItems.slice(0, 3)) {
    const t = item.title || '';
    // Goldman Sachs / copper target
    if (/goldman/i.test(t) && /copper/i.test(t)) {
      ibSummaries.push('高盛維持銅 2026/27 目標區間 10,000–11,000 美元/噸，當前 COMEX 銅折噸價已顯著高於其上限，機構隱含回調警示。');
    } else if (/jpmorgan|jp morgan/i.test(t) && /nickel/i.test(t)) {
      ibSummaries.push('摩根大通從中國鎳市場逼倉中獲益，顯示鎳市場多空博弈仍在持續，機構頭寸偏向做多短期波動。');
    } else if (/citigroup|citi/i.test(t)) {
      ibSummaries.push(`花旗：${t.split('-')[0].trim()}`);
    } else if (t) {
      // 通用提炼：取标题主干
      const cleaned = t.replace(/\s*-\s*(Reuters|Bloomberg|Mining\.com|FT|WSJ).*$/i, '').trim();
      ibSummaries.push(cleaned);
    }
  }

  if (ibSummaries.length > 0) {
    lines.push('*🏦 機構觀點*');
    ibSummaries.forEach(s => lines.push(`• ${s}`));
    lines.push('');
  }

  // 国内市场情绪（从新闻标题提炼）
  const domesticSignals = [];
  for (const item of cnNews.slice(0, 5)) {
    const t = item.title || '';
    if (/ETF.*上漲|ETF.*反彈|ETF.*漲/.test(t)) {
      domesticSignals.push('國內有色 ETF 資金今日淨流入，場內情緒邊際修復。');
    }
    if (/現貨.*成交|成交.*清淡|清淡/.test(t)) {
      domesticSignals.push('上海現貨市場成交偏淡，臨近假期前下遊備貨意願不強。');
    }
    if (/風險管理|套保|套期保值/.test(t)) {
      domesticSignals.push('上游企業積極套保，反映對中短期價格下行的防禦需求上升。');
    }
    if (/漲幅.*剩|普漲.*告一段落|避險.*失敗/.test(t)) {
      domesticSignals.push('市場普漲動能衰減，前期資金驅動行情面臨分化壓力。');
    }
  }

  // SMM 提炼
  if (forum?.smmHighlights) {
    const smm = forum.smmHighlights;
    if (/美元下跌/.test(smm)) domesticSignals.push('美元走弱對 LME 基本金屬形成短線支撐，但內盤跟漲偏弱。');
    if (/多晶硅|碳酸鋰|碳酸锂/.test(smm)) domesticSignals.push('新能源板塊（多晶硅、碳酸鋰）同步回調，對鎳鈷需求側情緒構成拖累。');
    if (/不銹鋼|不锈钢/.test(smm)) domesticSignals.push('不銹鋼期貨偏強，鎳基需求底部支撐可期。');
  }

  // Reddit 提炼
  if (forum?.redditSummary) {
    const r = forum.redditSummary;
    if (/gold.*safe.haven|safe.haven.*gold/i.test(r)) {
      domesticSignals.push('海外社群對黃金避險屬性出現分歧，能源/商品替代避險邏輯升溫，間接利好基本金屬資產配置。');
    }
    if (/silver/i.test(forum.redditSurging || '')) {
      domesticSignals.push('白銀社群討論熱度異常攀升，貴金屬向基本金屬情緒擴散值得關注。');
    }
  }

  if (domesticSignals.length > 0) {
    lines.push('*📡 市場情緒*');
    // 去重
    const unique = [...new Set(domesticSignals)];
    unique.forEach(s => lines.push(`• ${s}`));
  } else {
    lines.push('*📡 市場情緒*');
    lines.push('• 今日市場情緒中性，無顯著異動信號。');
  }
  lines.push('');

  // ── 六、四维交叉推理与操作参考 ──
  lines.push('━━━ 六、四維交叉推理 ━━━');

  // 宏观维度
  let macroText = '';
  if (xme && sw) {
    if (xme.changePct > 1 && sw.changePct < -1) {
      macroText = `美礦 ETF（XME ${fmtPct(xme.changePct)}）大漲而申萬有色（${fmtPct(sw.changePct)}）同步下挫，A/H 顯著分化。`
        + '核心驅動在於美元定價的 LME 金屬受益於關稅博弈下的供應鏈重構預期，而 A 股有色板塊同時承壓於人民幣匯率波動與下游需求疲弱的雙重壓力。';
    } else if (xme.changePct > 0 && sw.changePct > 0) {
      macroText = `美礦與 A 股有色今日同向上行（XME ${fmtPct(xme.changePct)}，申萬 ${fmtPct(sw.changePct)}），宏觀風險偏好整體改善，短線多頭情緒佔優。`;
    } else if (xme.changePct < 0 && sw.changePct < 0) {
      macroText = `美礦（${fmtPct(xme.changePct)}）與申萬有色（${fmtPct(sw.changePct)}）同步回落，全球風險偏好收縮，基本金屬承壓。`;
    } else {
      macroText = `美礦（${fmtPct(xme.changePct)}）與申萬有色（${fmtPct(sw.changePct)}）方向分化，宏觀訊號混雜，需結合匯率與資金流向研判。`;
    }
  }
  lines.push(`① 宏觀維度：${macroText || '宏觀數據待觀察。'}`);
  lines.push('');

  // 库存维度
  let invText = '';
  const cuInv = inv.copper, znInv = inv.zinc, niInv = inv.nickel;
  const invParts = [];
  if (cuInv?.tonnes != null) {
    invParts.push(cuInv.change > 0
      ? `LME 銅庫存連續累積至 ${fmtNum(cuInv.tonnes)} 噸（+${fmtNum(cuInv.change)}），現貨升水受壓，提示中期需求尚未明顯改善`
      : `LME 銅庫存降至 ${fmtNum(cuInv.tonnes)} 噸（${fmtNum(cuInv.change)}），去庫支撐現貨溢價`);
  }
  if (znInv?.tonnes != null) {
    invParts.push(znInv.change < 0
      ? `鋅庫存持續去化（${fmtNum(znInv.tonnes)} 噸，${fmtNum(znInv.change)}），現貨供應偏緊格局強化`
      : `鋅庫存小幅累積（${fmtNum(znInv.tonnes)} 噸），短期壓力存在`);
  }
  if (niInv?.tonnes != null) {
    invParts.push(`鎳庫存 ${fmtNum(niInv.tonnes)} 噸，變動微小（${fmtNum(niInv.change)}），供需基本均衡`);
  }
  invText = invParts.join('；') + '。';
  lines.push(`② 庫存維度：${invText}`);
  lines.push('');

  // 期货结构维度
  let fwdText = '';
  if (fwd?.spot && fwd?.near && fwd?.far) {
    const nearSpread = fwd.near.price - fwd.spot.price;
    const farSpread  = fwd.far.price - fwd.spot.price;
    if (nearSpread < 0 && farSpread > 0) {
      fwdText = `銅期貨曲線呈「近端 Backwardation、遠端 Contango」V 型結構`
        + `（現月 ${fmtNum(fwd.spot.price, 3)} → ${fwd.near.expiry} ${fmtNum(fwd.near.price, 3)} → ${fwd.far.expiry} ${fmtNum(fwd.far.price, 3)} 美元/磅）。`
        + '近端偏緊反映當前現貨需求仍具支撐，但遠端升水有限，市場對中長期需求擴張持謹慎態度。';
    } else if (nearSpread < 0) {
      fwdText = `銅期貨近端 Backwardation（${fmtNum(Math.abs(nearSpread), 3)}/lb），現貨緊缺預期主導，短線多頭佔優。`;
    } else {
      fwdText = `銅期貨呈 Contango 結構（近月升水 ${fmtNum(nearSpread, 3)}/lb），現貨壓力存在，需警惕近月合約換倉成本。`;
    }
    // 高盛目标对比
    if (cu?.usd != null) {
      const cuPerTonne = cu.usd * 2204.62;
      if (cuPerTonne > 11000) {
        fwdText += `\n   ⚠️ 當前銅價折噸約 ${fmtNum(cuPerTonne)} 美元，顯著高於高盛 2026/27 目標上限（11,000 美元/噸），估值偏貴風險需關注。`;
      }
    }
  } else {
    fwdText = '期貨結構數據缺失，無法判斷曲線形態。';
  }
  lines.push(`③ 結構維度：${fwdText}`);
  lines.push('');

  // 情绪维度
  const sentParts = [];
  if (ibItems.some(i => /goldman/i.test(i.title || ''))) sentParts.push('高盛報告引發市場估值修正討論');
  if (ibItems.some(i => /jpmorgan|jp morgan/i.test(i.title || ''))) sentParts.push('摩根大通鎳市持倉動向值得跟蹤');
  if (forum?.redditSurging?.toLowerCase().includes('silver')) sentParts.push('海外社群白銀討論異動，貴金屬情緒有向基本金屬傳導跡象');
  if (forum?.smmHighlights?.includes('多晶硅') || forum?.smmHighlights?.includes('碳酸')) sentParts.push('新能源鏈回調對鎳鈷需求敘事形成干擾');
  const sentText = sentParts.length > 0
    ? sentParts.join('；') + '。'
    : '市場情緒中性，無顯著異動，短線跟隨基本面邏輯為主。';
  lines.push(`④ 情緒維度：${sentText}`);

  lines.push('');
  lines.push('📌 *操作參考（非投資建議）*');

  // 铜（Cu）
  if (cu?.usd != null) {
    const cuP = cu.usd;
    const cuPerTonne = cuP * 2204.62;
    if (inv.copper?.change > 0 && cuPerTonne > 11000) {
      lines.push(`• 銅：累庫疊加高估值（折噸約 ${fmtNum(cuPerTonne)} 美元，高於高盛上限 11,000），建議觀望；回落至 USD ${fmtNum(cuP * 0.96, 3)}/lb 區域可重新評估。`);
    } else if (fwd?.spot && fwd?.near && fwd.near.price < fwd.spot.price) {
      lines.push(`• 銅：近端偏緊支撐短線，多頭思路不變，USD ${fmtNum(cuP * 0.97, 3)}/lb 為關鍵支撐，破位止損。`);
    } else {
      lines.push(`• 銅：趨勢偏多，USD ${fmtNum(cuP * 0.97, 3)}/lb 逢回可關注，上方阻力 USD ${fmtNum(cuP * 1.02, 3)}/lb。`);
    }
  } else {
    lines.push('• 銅：價格數據缺失，暫觀望。');
  }

  // 锌（Zn）
  if (zn?.cny != null) {
    const znC = inv.zinc?.change ?? 0;
    lines.push(znC < 0
      ? `• 鋅：去庫格局持續，供應偏緊支撐底部，CNY ${fmtNum(zn.cny - 500)} 附近逢低可關注，上方壓力 CNY ${fmtNum(zn.cny + 500)}。`
      : `• 鋅：庫存中性，CNY ${fmtNum(zn.cny)} 區間震盪，輕倉觀望，方向明確後跟進。`);
  } else {
    lines.push('• 鋅：價格數據缺失，暫觀望。');
  }

  // 镍（Ni）
  if (ni?.cny != null) {
    const niDir = ni.cnyChange ?? 0;
    if (niDir < -200) {
      lines.push(`• 鎳：CNY ${fmtNum(ni.cny)}/t 持續走弱，機構多空博弈激烈，建議暫觀望，不宜重倉追空。`);
    } else if (niDir > 200) {
      lines.push(`• 鎳：CNY ${fmtNum(ni.cny)}/t 反彈，需觀察能否持續，可輕倉試多，嚴格止損。`);
    } else {
      lines.push(`• 鎳：CNY ${fmtNum(ni.cny)}/t 橫盤整理，等待不銹鋼需求與新能源鏈回暖信號，暫觀望。`);
    }
  } else {
    lines.push('• 鎳：價格數據缺失，暫觀望。');
  }

  // 钴（Co）
  if (co?.cny != null) {
    const coDir = co.cnyChange ?? 0;
    if (coDir > 0) {
      lines.push(`• 鈷：CNY ${fmtNum(co.cny)}/t 小幅回升，新能源電池需求預期驅動，謹慎追多，等量能確認。`);
    } else if (coDir < 0) {
      lines.push(`• 鈷：CNY ${fmtNum(co.cny)}/t 繼續承壓，供應過剩格局未改，觀望為主。`);
    } else {
      lines.push(`• 鈷：CNY ${fmtNum(co.cny)}/t 橫盤，供需再平衡進程緩慢，暫觀望。`);
    }
  } else {
    lines.push('• 鈷：價格數據缺失，暫觀望。');
  }

  // 铋（Bi）
  if (bi?.cny != null) {
    const biDir = bi.cnyChange ?? 0;
    if (Math.abs(biDir) < 1000) {
      lines.push(`• 鉍：CNY ${fmtNum(bi.cny)}/t 窄幅震盪，市場流動性偏低，不建議短線操作。`);
    } else if (biDir > 0) {
      lines.push(`• 鉍：CNY ${fmtNum(bi.cny)}/t 上行，半導體/醫藥需求帶動，可輕倉跟多。`);
    } else {
      lines.push(`• 鉍：CNY ${fmtNum(bi.cny)}/t 回落，關注 CNY ${fmtNum(bi.cny * 0.95)} 支撐。`);
    }
  } else {
    lines.push('• 鉍：價格數據缺失，暫觀望。');
  }

  // 镁（Mg）
  if (mg?.cny != null) {
    const mgDir = mg.cnyChange ?? 0;
    if (mgDir > 0) {
      lines.push(`• 鎂：CNY ${fmtNum(mg.cny)}/t 上漲，汽車輕量化需求支撐，可關注趨勢多頭機會。`);
    } else if (mgDir < 0) {
      lines.push(`• 鎂：CNY ${fmtNum(mg.cny)}/t 回落，能源成本下降但需求端偏弱，暫觀望。`);
    } else {
      lines.push(`• 鎂：CNY ${fmtNum(mg.cny)}/t 平穩，供需均衡，暫觀望。`);
    }
  } else {
    lines.push('• 鎂：價格數據缺失，暫觀望。');
  }

  lines.push('');
  lines.push('_數據來源：Yahoo Finance / CCMN / SMM / Westmetall / TradingEconomics / Reuters_');

  return lines.join('\n');
}

// ────────────────────────────────────────────
// 发送 Telegram
// ────────────────────────────────────────────
async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

// ────────────────────────────────────────────
// 主流程
// ────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  process.stderr.write('[daily-report] 开始抓取完整数据...\n');

  const data = await runScript('fetch-all-data.mjs');

  process.stderr.write('[daily-report] 数据抓取完成，生成报告...\n');

  const message = buildReport(data);

  console.log('\n─── 报告预览 ───');
  console.log(message);
  console.log('────────────────\n');

  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token) {
    process.stderr.write('[daily-report] ⚠️  未配置 TELEGRAM_BOT_TOKEN，跳过发送\n');
    return;
  }

  process.stderr.write(`[daily-report] 发送至 Telegram chat_id=${chatId}...\n`);
  await sendTelegram(token, chatId, message);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(`[daily-report] ✅ 发送成功！总耗时: ${elapsed}s\n`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
