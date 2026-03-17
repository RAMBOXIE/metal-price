# MEMORY.md - 有色小鑽風項目記憶

## 項目定位
每日 14:00 CST 自動發送有色金屬專業交易員分析簡報到 Telegram。
上午盤收盤後運行，含：LME 昨夜 + 國內上午盤 + 四維交叉推理。
- GitHub: `RAMBOXIE/metal-price`（開源）
- 本地路徑: `D:\Projects\metal-price`
- 最新已知 commit: `e784c5c`

## Cron
- Cron ID: `5d729b27`，每日 14:00 CST，timeout=90s
- 數據腳本：`node D:\Projects\metal-price\scripts\fetch-all-data.mjs`（~2s 完成）

## 數據源狀態（已全面自檢）

| 品種 | USD | CNY |
|------|-----|-----|
| Cu | Yahoo HG=F ✅ | CCMN ✅ + SMM 交叉驗證 ✅ |
| Zn | ❌ 無免費源 | CCMN ✅ + SMM ✅ |
| Al | Yahoo ALI=F ✅ | ❌ 無免費源 |
| Ni | ❌ 無免費源 | CCMN ✅ + SMM ✅ |
| Co | ❌ 無免費源 | CCMN ✅ |
| Bi | SMM CIF $15,600/t ✅ | SMM ¥163,000/t ✅ |

## SMM h5 頁面規律（重要！）
- 有效 URL：`https://hq.smm.cn/h5/{slug}`
- 有效 slug：`cu-price` / `zn-price` / `ni-price` / `pb-price` / `sn-price` / `bismuth-price`
- ❌ 無效（404）：`copper-price` / `zinc-price` / `aluminum-price` / `cobalt-price` / `al-price`
- 數據在 `__NEXT_DATA__` 嵌入，無需 API key
- ⚠️ `vchange_rate` 是小數（-0.0033 = -0.33%），使用時 ×100

## 關鍵 Unicode（SMM 簡體字）
- 铜=\u94DC / 锌=\u950C / 锭=\u952D / 镍=\u954D / 铋=\u94CB

## 數據缺口（無法填補）
- Zn/Ni/Co USD：LME Cloudflare 封鎖 + SMM 無 USD + Yahoo 合約廢棄
- Al CNY：SMM al-price 404，暫缺
- LME 庫存：Cloudflare 全封

## 分析框架（六板塊）
1. 行情快照
2. 行業指數（XME / COPX / 申萬有色 000812.SS）
3. 技術面
4. 基本面
5. 市場情緒（Reddit: r/Commodities 雙榜）
6. 四維交叉推理 + 操作建議
