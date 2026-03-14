# metal-price

每日有色金屬價格 + 新聞 Telegram 推送系統

## 功能

- 抓取銅、鋅、鎳、鈷、鉍現貨/期貨價格
- 聚合有色金屬相關新聞（Google News / Reuters / Yahoo Finance RSS）
- 格式化並發送 Telegram 日報

## 技術棧

- Node.js ESM（.mjs）
- 純 Node.js 內建模塊，零外部依賴

## 數據源

| 品種 | 數據源 | Symbol |
|------|--------|--------|
| 銅 Cu | Yahoo Finance | HG=F (COMEX) |
| 鋅 Zn | Yahoo Finance | ZNC=F (LME) |
| 鎳 Ni | TradingEconomics | nickel |
| 鈷 Co | TradingEconomics | cobalt |
| 鉍 Bi | 暫無免費數據源 | — |

## 快速開始

### 1. 配置 Telegram Bot

```bash
cp .env.example .env
# 編輯 .env，填入你的 Bot Token
```

### 2. 運行

```bash
# 完整日報（價格 + 新聞 + 發送 Telegram）
npm start

# 僅查看價格
npm run prices

# 僅查看新聞
npm run news
```

## 項目結構

```
metal-price/
  package.json          # 項目配置
  README.md             # 說明文檔
  .env.example          # 環境變量模板
  .gitignore
  scripts/
    fetch-prices.mjs    # 價格抓取
    fetch-news.mjs      # 新聞抓取
    daily-report.mjs    # 組合報告 + Telegram 發送
```

## 環境變量

| 變量 | 說明 | 默認值 |
|------|------|--------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | 必填 |
| `TELEGRAM_CHAT_ID` | 接收消息的 Chat ID | 2074812988 |

## 定時任務（Cron）

```cron
# 每天早上 8:00 發送日報（UTC+8）
0 0 * * * cd /path/to/metal-price && node scripts/daily-report.mjs >> logs/daily.log 2>&1
```
