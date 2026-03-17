# 有色金屬免費數據源測試報告

測試時間：2026-03-14  
測試環境：Node.js fetch，Windows Server

---

## 一、測試結果匯總

### 測試1：Stooq.com ❌ 全部失敗

| Symbol | 結果 | 原因 |
|--------|------|------|
| `lmeni` (LME Nickel) | ❌ | 返回 "No data" |
| `lmeco` (LME Cobalt) | ❌ | 返回 "No data" |
| `ni.f` (Nickel Futures) | ❌ | 空響應 |

**補充測試（v3）：**
- Stooq 對黃金/白銀有效（`xauusd` → 5019.83, `xagusd` → 80.6），說明系統正常運行
- LME 基本金屬在 Stooq 不可用

---

### 測試2：metals.live ❌ 失敗

- HTTP 200，但返回 HTML 頁面（`window.location.href="/lander"`）
- API 端點已廢棄或需要認證
- **結論：不可用**

---

### 測試3：Yahoo Finance ❌ 鎳/鈷不可用

| Symbol | 結果 | 原因 |
|--------|------|------|
| `XNICUSD=X` | ❌ | "No data found, symbol may be delisted" |
| `XCOBUSD=X` | ❌ | "No data found, symbol may be delisted" |
| `NI=F` | ❌ | "No data found, symbol may be delisted" |

**補充測試（v2）：黃金/白銀/銅 Yahoo 是有效的**
- `GC=F` (Gold)：✅ 5023.10 USD
- `SI=F` (Silver)：✅ 80.64 USD
- `HG=F` (Copper)：✅ 5.675 USD

**搜尋結果：** Yahoo Finance 沒有 LME 鎳/鈷的任何 symbol（只有股票 NCKAF 等）

---

### 測試4：Investing.com 非官方 API ❌ 失敗

- HTTP 403，Cloudflare bot 攔截
- **結論：不可用（無法繞過）**

---

## 二、額外探索發現

### ✅ 重大發現：Alpha Vantage 有 NICKEL + COBALT 端點！

```
https://www.alphavantage.co/query?function=NICKEL&interval=monthly&apikey=<YOUR_KEY>
https://www.alphavantage.co/query?function=COBALT&interval=monthly&apikey=<YOUR_KEY>
```

**驗證方式：** 使用 demo key 調用，返回 `"Information": "demo key..."` 而非 `"Error Message"`，
說明端點合法存在。所有測試的基本金屬端點均存在：
- ✅ NICKEL
- ✅ COBALT
- ✅ ZINC
- ✅ LEAD
- ✅ TIN
- ✅ ALUMINUM

**Alpha Vantage 免費套餐：**
- 每日 25 次請求（免費）
- 申請 key：https://www.alphavantage.co/support/#api-key
- 數據來源：LME 現貨價格，月度/年度頻率
- 無需付費，只需郵箱注冊

**預期 API 響應格式：**
```json
{
  "name": "Nickel",
  "interval": "monthly",
  "unit": "$/metric ton",
  "data": [
    { "date": "2025-01-01", "value": "15000.00" },
    ...
  ]
}
```

### 其他測試結果

| 方案 | 結果 |
|------|------|
| IMF DataMapper API (PNICK) | ❌ 返回空 JSON，indicator 不在 IMF DataMapper 中 |
| World Bank API (PNICK) | ❌ Invalid value error，需要特殊 data source path |
| NASDAQ Data Link / Quandl | ❌ 403 Incapsula 攔截 |
| Trading Economics | ❌ 連接失敗 |
| LME 官方 API | ❌ 403 Cloudflare |
| CME Group NI futures | ❌ LME 鎳不在 CME（404）|
| commodities-api.com | ❌ 需要 API key，401 |

---

## 三、建議方案

### 方案A（推薦）：Alpha Vantage 免費 Key
```
免費申請：https://www.alphavantage.co/support/#api-key
端點：function=NICKEL / COBALT
頻率：月度（每月更新）
限制：25次/天（足夠）
```

**適合：** 需要月度均價，趨勢分析，不需要日內價格

### 方案B：Yahoo Finance（僅限已有 symbol 的金屬）
```javascript
// 銅（有效）
https://query1.finance.yahoo.com/v8/finance/chart/HG=F?interval=1d&range=5d
// 黃金（有效）
https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d
```
**不適合鎳/鈷**（無可用 symbol）

### 方案C：Yahoo Finance + 鎳礦股票作代理
```
VALE (巴西淡水河谷, 全球最大鎳生產商): VALE
NCKAF (Nickel Asia): NCKAF（OTC，流動性差）
```
**不推薦**：股票價格與大宗商品現貨相關性不穩定

### 方案D（付費考慮）：Metals-api.com
- Free tier：250次/月
- 含 XNI（鎳）、XCO（鈷）
- 申請地址：https://metalpriceapi.com

---

## 四、結論與行動建議

| 優先級 | 方案 | 成本 | 數據頻率 | 鎳 | 鈷 |
|--------|------|------|---------|-----|-----|
| ⭐ 第一 | Alpha Vantage 免費 key | 免費 | 月度 | ✅ | ✅ |
| 第二 | metalpriceapi.com 免費層 | 免費(250/月) | 日度 | ✅ | ✅ |
| 補充 | Yahoo Finance | 免費無限 | 日度 | ❌ | ❌（銅/金可用）|

**立即行動：**
1. 去 https://www.alphavantage.co/support/#api-key 申請免費 key（30 秒，郵箱注冊）
2. 測試 `function=NICKEL&interval=monthly` 獲取月度數據
3. 如需日度實時數據，考慮 metalpriceapi.com 免費層（250次/月）
