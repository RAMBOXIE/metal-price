/**
 * daily-report.mjs
 * 組合價格 + 新聞，格式化並發送 Telegram 有色金屬日報
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// ────────────────────────────────────────────
// 讀取 .env（不依賴 dotenv）
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
    console.log('[daily-report] ✅ 已讀取 .env');
  } catch {
    console.log('[daily-report] ℹ️  未找到 .env，僅輸出 console');
  }
  return env;
}

// ────────────────────────────────────────────
// 動態 import 子腳本（通過 child_process 執行獲取輸出）
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
// 漲跌 Emoji
// ────────────────────────────────────────────
function changeEmoji(pct) {
  if (pct == null) return '🔵';
  if (pct > 0.5) return '🟢';
  if (pct < -0.5) return '🔴';
  return '🔵';
}

function formatChange(item) {
  if (item.changePct == null) return '─';
  const sign = item.changePct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(item.changePct).toFixed(2)}%`;
}

function formatPrice(item) {
  if (item.price == null) return 'N/A';
  return item.price.toFixed(item.price < 10 ? 4 : 2);
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

  const metalNames = {
    '銅': 'Cu',
    '鋅': 'Zn',
    '鎳': 'Ni',
    '鈷': 'Co',
    '鉍': 'Bi',
  };

  for (const item of prices) {
    const emoji = changeEmoji(item.changePct);
    const sym = metalNames[item.name] || item.name;
    const priceStr = formatPrice(item);
    const changeStr = formatChange(item);
    const unit = item.unit || '';
    const unitSuffix = unit.split('/')[1] || unit;

    // 來源標籤：metalpriceapi/Stooq 顯示數據源，否則顯示交易所
    let sourceTag = '';
    if (item.source === 'metalpriceapi' || item.source === 'Stooq') {
      sourceTag = `[${item.source}]`;
    } else if (item.exchange && item.exchange !== 'N/A') {
      sourceTag = `[${item.exchange}]`;
    }

    if (item.price == null) {
      lines.push(`🔵 ${item.name}（${sym}）暫無數據`);
    } else {
      lines.push(`${emoji} ${item.name}（${sym}）\$${priceStr}/${unitSuffix}  ${changeStr}  ${sourceTag}`);
    }
  }

  lines.push('');
  lines.push('*📰 今日要聞*');

  if (newsData.items && newsData.items.length > 0) {
    newsData.items.forEach((item, idx) => {
      // Telegram Markdown: [title](url)
      const safeTitle = item.title.replace(/[[\]()]/g, ' ').trim();
      if (item.url) {
        lines.push(`${idx + 1}\\. [${safeTitle}](${item.url})`);
      } else {
        lines.push(`${idx + 1}. ${safeTitle}`);
      }
    });
  } else {
    lines.push('暫無相關新聞');
  }

  lines.push('');
  lines.push('_數據來源：Yahoo Finance / Stooq / metalpriceapi.com_');

  return lines.join('\n');
}

// ────────────────────────────────────────────
// 發送 Telegram
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
// 主函數
// ────────────────────────────────────────────
async function main() {
  console.log('[daily-report] 開始抓取數據...');

  // 並行抓取
  const [prices, newsData] = await Promise.all([
    runScript('fetch-prices.mjs'),
    runScript('fetch-news.mjs'),
  ]);

  console.log('[daily-report] 數據抓取完成，生成報告...');

  const message = formatReport(prices, newsData);
  console.log('\n─── 報告預覽 ───');
  console.log(message);
  console.log('────────────────\n');

  // 讀取 Telegram 配置
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID || '2074812988';

  if (!token) {
    console.log('[daily-report] ⚠️  未配置 TELEGRAM_BOT_TOKEN，跳過發送');
    return;
  }

  try {
    console.log(`[daily-report] 發送至 Telegram chat_id=${chatId}...`);
    await sendTelegram(token, chatId, message);
    console.log('[daily-report] ✅ 發送成功！');
  } catch (err) {
    console.error('[daily-report] ❌ 發送失敗:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
