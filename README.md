# jpstay — 日本住宿比價工具

日本旅遊比價網站：輸入日期、地區、預算，即時查詢日本訂房網站的真實空房與價格，並提供 Booking.com 導流連結供交叉比較。

## 目前狀態（原型階段）

已完成一個**單檔 HTML 原型**：`japan-hotel-compare.html`（本次交付，需放入 repo）。
可直接用瀏覽器打開測試，尚未部署到 Cloudflare Pages。

## 資料來源決策（重要，勿更改方向前先確認）

調查了三個訂房資料來源後的結論：

| 來源 | 狀態 | 採用方式 |
|---|---|---|
| **樂天トラベル（楽天ウェブサービス）** | 官方開放 API，免費申請 `applicationId` 即可用 | ✅ 採用 — 即時查詢空房與價格，主要資料來源 |
| **じゃらん Web サービス** | 2020/2/25 起停止受理新帳號註冊 | ❌ 無法採用，新開發者拿不到 key |
| **Booking.com 官方 Demand API** | 需先成為 Managed Affiliate Partner，新站無流量通常審核不過；且對「比價」用途有條款限制 | ⏸ 暫不採用，等網站有流量後再申請 |
| **Booking.com（RapidAPI 上的第三方 API）** | 非官方授權，是包裝過的爬蟲，穩定性與條款風險都高，且沒有分潤機制 | ❌ 不採用 |

**目前策略**：Booking.com 只做「導流連結」（帶入相同地區/日期/人數的官方搜尋頁 URL），**不**抓取、不顯示其即時房價，避免違反其比價相關使用條款。等 jpstay 有流量後，可以申請 Booking 官方 Managed Affiliate Partner，再把它升級成真的即時比價。

## 原型技術細節（`japan-hotel-compare.html`）

- 純前端單檔（HTML + inline CSS + vanilla JS），無建置流程，可直接部署到 Cloudflare Pages 當靜態檔案
- 樂天 API 用 **JSONP** 直接從瀏覽器呼叫（`https://app.rakuten.co.jp/services/api/Travel/VacantHotelSearch/20170426`），因為樂天沒開 CORS
- `applicationId` / `affiliateId` / Booking `aid` 目前是使用者在頁面上手動輸入，存在 JS 變數（記憶體）中，**沒有用 localStorage**，重新整理就清空 — 這是刻意的安全選擇，避免 key 外洩，但也代表每次都要重填
- 地區用日本 47 都道府縣對應樂天 `middleClassCode`（英文羅馬拼音，寫死在 JS 陣列 `PREFS` 裡）
- Booking.com 連結組成：`https://www.booking.com/searchresults.html?ss={飯店名或地區}&checkin=...&checkout=...&group_adults=...&aid=...`

## 待辦事項（交給 Claude Code 接手）

1. **部署到 Cloudflare Pages**：repo 內容直接 push，Pages 專案名稱 `jpstay`，Build command 留空（純靜態檔），輸出目錄設為 repo 根目錄或 `/public`（依你怎麼組織檔案結構決定）
2. **金鑰改用 Cloudflare Worker 代理**：目前 applicationId 是使用者自己輸入且明碼呼叫，正式上線建議比照另一個專案（`flights-276.pages.dev` / GitHub repo `mywu-cloud/flights`）的架構 — API 金鑰放 Worker 環境變數，前端不直接持有 key，Worker 加簡單快取（同條件 10–30 分鐘）減少 API 呼叫量
3. **排程快照層**：仿照 flights 專案用 GitHub Actions 定時抓熱門地區 × 未來週末/連假日期組合，存成 JSON，之後可以做「價格趨勢」功能。**歷史快照要用 append，不要整份覆蓋**（flights 專案曾經因為整份覆蓋導致資料斷頭，這裡要避免重蹈覆轍）
4. **Booking.com 官方 API 申請**：等有流量後评估申請 Managed Affiliate Partner，屆時可以把「查看 Booking」單純導流升級為真的即時比價，但要重新檢視其比價相關條款
5. 視覺與互動細節可以再打磨（目前是走和風配色的原型：藍染 aizome 藍 + 鳥居朱紅 + washi 米色背景），非必要但可優化

## 相關專案

- `mywu-cloud/flights` — 機票價格追蹤器，架構可參考（GitHub Actions + Playwright → JSON on gh-pages → Cloudflare Pages + Worker），已驗證過的模式
