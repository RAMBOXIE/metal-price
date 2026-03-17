---
name: metal-price
description: Daily non-ferrous metals briefing for AI agents. Collects real-time base metals prices (Cu/Zn/Al/Ni/Co/Bi) from Yahoo Finance, CCMN 長江有色, and SMM, aggregates Reddit/news sentiment, then delivers a professional trading-style analyst report via Telegram at 14:00 CST. Zero paid APIs required. Use when you need automated metals market monitoring, LME/SHFE price tracking, or AI-generated trading briefings.
---

# 有色小鑽風 · Metal Price Daily 🦞📊

> AI-driven non-ferrous metals daily briefing — data collection + professional analyst report via Telegram.

每日 14:00 CST（上午盤收盤後）自動採集有色金屬行情，由 AI 生成專業交易員級分析簡報並推送到 Telegram。**零付費 API，開箱即用。**

## Features

- 📊 **多源價格聚合** — Yahoo Finance (USD)、CCMN 長江有色 (CNY)、SMM 上海有色
- 📰 **新聞 + 市場情緒** — Google News RSS（中英文）、SMM 快訊、Reddit r/Commodities
- 🏦 **投行信號過濾** — 自動過濾高盛/摩根大通/花旗的有色金屬研究報告
- 📈 **技術面分析** — 遠期曲線（spot/+2M/+6M）、基差、正/反向市場判斷
- 🔮 **四維交叉推理** — 技術面 × 基本面 × 市場情緒 × 宏觀，含置信度評分
- 🔥 **異動偵測** — Reddit hot vs top 榜分歧，捕捉突發熱點
- 🚫 **零付費 API** — 全部免費數據源，無需任何 API key

## Metals Covered

| Metal | USD | CNY |
|-------|-----|-----|
| Copper (Cu) | Yahoo HG=F ✅ | CCMN ✅ + SMM ✅ |
| Zinc (Zn) | — | CCMN ✅ + SMM ✅ |
| Aluminum (Al) | Yahoo ALI=F ✅ | — |
| Nickel (Ni) | — | CCMN ✅ + SMM ✅ |
| Cobalt (Co) | — | CCMN ✅ |
| Bismuth (Bi) | SMM $15,600/t ✅ | SMM ¥163,000/t ✅ |

## Quick Start

```bash
git clone https://github.com/RAMBOXIE/metal-price.git
cd metal-price
cp .env.example .env   # 填入 TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
node scripts/fetch-all-data.mjs   # 採集數據（~2s）
```

## Environment Variables

```env
TELEGRAM_BOT_TOKEN=    # 必填：Telegram Bot Token
TELEGRAM_CHAT_ID=      # 必填：目標群組/頻道 ID
```

## Key Scripts

| Script | Description |
|--------|-------------|
| `scripts/fetch-all-data.mjs` | 主數據採集腳本，~2s 完成，輸出 JSON |
| `scripts/daily-report.mjs` | 完整日報流程（採集 + AI 分析 + 發送） |
| `scripts/send-telegram.mjs` | Telegram 發送工具（支持管道輸入） |

## Agent Integration (OpenClaw Cron)

在 OpenClaw 中設置每日 14:00 定時任務：

```json
{
  "schedule": { "kind": "cron", "expr": "0 14 * * *", "tz": "Asia/Shanghai" },
  "payload": {
    "kind": "agentTurn",
    "message": "Run node D:\\Projects\\metal-price\\scripts\\fetch-all-data.mjs, analyze the JSON output, and send a professional metals trading brief to Telegram.",
    "timeoutSeconds": 90
  }
}
```

## Data Sources Status

| Source | Status |
|--------|--------|
| Yahoo Finance (HG=F / ALI=F) | ✅ Free |
| CCMN 長江有色 | ✅ Free |
| SMM 上海有色 (hq.smm.cn/h5) | ✅ Free, no login |
| Reddit r/Commodities | ✅ JSON API |
| Google News RSS | ✅ Free |
| LME official | ❌ Cloudflare 403 (returns null) |

## License

MIT · [GitHub](https://github.com/RAMBOXIE/metal-price)
