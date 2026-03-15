/**
 * daily-report.mjs
 * 组合价格 + 新闻，格式化并发送 Telegram 有色金属日报
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ────────────────────────────────────────────
// 读取 .env（不依赖 dotenv）
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
    console.log('[daily-report] ✅ 已读取 .env');
  } catch {
    console.log('[daily-report] ℹ️  未找到 .env，仅输出 console');
  }
  return env;
}

// ────────────────────────────────────────────
// 动态执行子脚本
// ────────────────────────────────────────────
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

async function runScript(scriptName) {
  const scriptPath = join(__dirname, scriptName);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [scriptPath],
    { timeout: 30000, maxBuffer: 1024 * 1024 }
  );
  if (stderr) process.stderr.write(stderr);
  return JSON.parse(stdout);
}

// ────────────────────────────────────────────
// 金属显示名称映射（简体 -> 繁体 + 符号）
// ────────────────────────────────────────────
const METAL_DISPLAY = {
  '铜': { zh: '銅', sym: 'Cu' },
  '锌': { zh: '鋅', sym: 'Zn' },
  '镍': { zh: '鎳', sym: 'Ni' },
  '钴': { zh: '鈷', sym: 'Co' },
  '铋': { zh: '鉍', sym: 'Bi' },
};

// ────────────────────────────────────────────
// 格式化工具函数
// ────────────────────────────────────────────

// 千位分隔符（手动实现，避免 locale 依赖）
function fmtNum(n, decimals = 0) {
  if (n == null) return null;
  const parts = Number(n).toFixed(decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimals > 0 ? parts.join('.') : parts[0];
}

// USD 涨跌百分比字符串
function fmtChangePct(pct) {
  if (pct == null) return null;
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

// CNY 涨跌额字符串
function fmtCcmnUpdown(updown) {
  if (updown == null) return '─';
  if (updown === 0) return '─';
  const sign = updown > 0 ? '▲' : '▼';
  return `${sign}${fmtNum(Math.abs(updown))}`;
}

// 根据涨跌方向确定行首 emoji
// direction: 1 = 涨, -1 = 跌, 0 = 平, null = 无数据
function leadingEmoji(direction) {
  if (direction === null) return '⚪';
  if (direction > 0)  return '🟢';
  if (direction < 0)  return '🔴';
  return '🔵';
}

// 获取方向值（正负零）
function getDirection(changePct, ccmnUpdown) {
  if (changePct != null) {
    if (changePct > 0.1) return 1;
    if (changePct < -0.1) return -1;
    return 0;
  }
  if (ccmnUpdown != null) {
    if (ccmnUpdown > 0) return 1;
    if (ccmnUpdown < 0) return -1;
    return 0;
  }
  return null;
}

// ────────────────────────────────────────────
// 格式化 Telegram 消息
// ────────────────────────────────────────────
function formatReport(prices, newsData) {
  const date = new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const lines = [];
  lines.push(`📊 *有色金屬日報* · ${date}`);
  lines.push('');
  lines.push('*💰 今日行情*');

  for (const item of prices) {
    const display = METAL_DISPLAY[item.name] || { zh: item.name, sym: item.name };
    const { zh, sym } = display;

    const hasCcmn = item.ccmnPrice != null;
    const hasUsd = item.price != null;

    // 无任何数据
    if (!hasCcmn && !hasUsd) {
      lines.push(`⚪ ${zh}（${sym}）暫無數據`);
      continue;
    }

    // 确定行首 emoji（基于主要数据的涨跌方向）
    const direction = getDirection(item.changePct, item.ccmnUpdown);
    const emoji = leadingEmoji(direction);

    // Cu / Zn：USD 主价 + 长江人民币辅助
    if (sym === 'Cu' || sym === 'Zn') {
      if (hasUsd) {
        // USD 价格
        const decimals = item.unit === 'USD/lb' ? 3 : 0;
        const priceStr = fmtNum(item.price, decimals);
        const unitSuffix = item.unit === 'USD/lb' ? 'lb' : 't';
        const changeStr = fmtChangePct(item.changePct) || '─';
        const exchange = item.exchange || '';

        let line = `${emoji} ${zh}（${sym}）$${priceStr}/${unitSuffix}  ${changeStr}  [${exchange}]`;

        // 追加长江 CNY 数据
        if (hasCcmn) {
          const ccmnPriceStr = fmtNum(item.ccmnPrice);
          const ccmnStr = fmtCcmnUpdown(item.ccmnUpdown);
          line += `  |  ¥${ccmnPriceStr}/t  ${ccmnStr}  [長江]`;
        }
        lines.push(line);
      } else if (hasCcmn) {
        // Yahoo 失败，仅显示 CNY
        const ccmnPriceStr = fmtNum(item.ccmnPrice);
        const ccmnStr = fmtCcmnUpdown(item.ccmnUpdown);
        lines.push(`${emoji} ${zh}（${sym}）¥${ccmnPriceStr}/t  ${ccmnStr}  [長江]`);
      }
      continue;
    }

    // Ni / Co：仅显示 CNY（CCMN）
    if (sym === 'Ni' || sym === 'Co') {
      if (hasCcmn) {
        const ccmnPriceStr = fmtNum(item.ccmnPrice);
        const ccmnStr = fmtCcmnUpdown(item.ccmnUpdown);
        lines.push(`${emoji} ${zh}（${sym}）¥${ccmnPriceStr}/t  ${ccmnStr}  [長江現貨]`);
      } else if (hasUsd) {
        // CCMN 失败，Stooq 备用
        const priceStr = fmtNum(item.price, 0);
        const changeStr = fmtChangePct(item.changePct) || '─';
        lines.push(`${emoji} ${zh}（${sym}）$${priceStr}/t  ${changeStr}  [${item.exchange || 'LME'}]`);
      } else {
        lines.push(`⚪ ${zh}（${sym}）暫無數據`);
      }
      continue;
    }

    // 其他金属（Bi 等）
    if (hasUsd) {
      const priceStr = fmtNum(item.price, 0);
      const changeStr = fmtChangePct(item.changePct) || '─';
      lines.push(`${emoji} ${zh}（${sym}）$${priceStr}/t  ${changeStr}  [${item.exchange || 'N/A'}]`);
    } else {
      lines.push(`⚪ ${zh}（${sym}）暫無數據`);
    }
  }

  lines.push('');
  lines.push('*📰 今日要聞*');

  if (newsData.items && newsData.items.length > 0) {
    newsData.items.forEach((item, idx) => {
      const safeTitle = item.title.replace(/[[\]()]/g, ' ').trim();
      if (item.url) {
        lines.push(`${idx + 1}. [${safeTitle}](${item.url})`);
      } else {
        lines.push(`${idx + 1}. ${safeTitle}`);
      }
    });
  } else {
    lines.push('暫無相關新聞');
  }

  lines.push('');
  lines.push('_數據來源：Yahoo Finance / 長江有色(ccmn.cn) / Stooq_');

  return lines.join('\n');
}

// ────────────────────────────────────────────
// 发送 Telegram
// ────────────────────────────────────────────
async function sendTelegram(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data;
}

// ────────────────────────────────────────────
// 主函数
// ────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log('[daily-report] 开始抓取数据...');

  // 并行抓取价格 + 新闻
  const [prices, newsData] = await Promise.all([
    runScript('fetch-prices.mjs'),
    runScript('fetch-news.mjs'),
  ]);

  console.log('[daily-report] 数据抓取完成，生成报告...');

  const message = formatReport(prices, newsData);
  console.log('\n─── 报告预览 ───');
  console.log(message);
  console.log('────────────────\n');

  // 读取 Telegram 配置
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID || '2074812988';

  if (!token) {
    console.log('[daily-report] ⚠️  未配置 TELEGRAM_BOT_TOKEN，跳过发送');
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[daily-report] 总耗时: ${elapsed}s`);
    return;
  }

  try {
    console.log(`[daily-report] 发送至 Telegram chat_id=${chatId}...`);
    await sendTelegram(token, chatId, message);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[daily-report] ✅ 发送成功！总耗时: ${elapsed}s`);
  } catch (err) {
    console.error('[daily-report] ❌ 发送失败:', err.message);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[daily-report] 总耗时: ${elapsed}s`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
