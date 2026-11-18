# 郵戳慢慢集｜中華郵政臨時郵局搜尋網站

一個可分享的公開網站，展示中華郵政臨時郵局郵戳圖案、日期、寄信索戳收件單位與地址。

## 功能
- 用「活動名稱 / 地區 / 收件人 / 地址」搜尋、依日期篩選。
- 「尚可索戳」顯示活動未來場次與活動後十個日曆天內的資料（**僅推估，並非郵局承諾**）。
- 直接在頁面看郵戳縮圖、放大、上一張／下一張；複製索戳收件資訊。
- 地址不確定時會標「待確認」，不會自動假定寄至當地 901 支局。
- GitHub Actions 每天約台灣時間 08:17 嘗試抓取官方公告、備份原圖、更新網站；官方網站改版或拒絕請求時保留舊資料。

## 一次上線設定（GitHub Pages）

1. 登入 GitHub，在右上角 `+` → **New repository**，例如命名 `postmark-collection`，選擇 **Public**。
2. 下載 ZIP 並解壓縮，將最內層專案資料夾**內的所有檔案**上傳到儲存庫根目錄，包含隱藏的 `.github/workflows/publish.yml`、`data/`、`images/`、`scripts/`。建議使用 GitHub Desktop 以避免漏掉隱藏資料夾；如使用 GitHub 網頁「Add file → Upload files」，要確認 `.github` 也有上傳。**不可只把 ZIP 當成單一檔案上傳**。
3. 開啟儲存庫 **Settings → Pages**；在 **Build and deployment → Source** 選擇 **GitHub Actions**。
4. 到 **Actions**，選擇「每日更新臨時郵局並發布網站」，按 **Run workflow**。首次建立儲存庫的 `push` 通常也會啟動。
5. 執行成功後，在 Pages 設定可看到公開網址，通常是 `https://<你的帳號>.github.io/postmark-collection/`。
6. 如果「儲存最新資料及圖片」無法推送，請到 **Settings → Actions → General → Workflow permissions** 改為 **Read and write permissions**，並檢查組織安全政策（部分組織可能限制）。

### 請特別注意
- **這是可部署的專案，不是已公開上線的網址。** 必須將程式放到你的 GitHub 儲存庫並設定 Pages 才會有公開連結。
- 2026-11-06 已實際同步官方公告，累計收錄 21 場，21 筆郵戳圖片均已保存為本地圖檔。
- 中華郵政目前未在本專案中使用經驗證的公開 API，而是直接擷取官網網頁。官網改版、阻擋機器請求或調整查詢參數時，可能需要修正 `scripts/update_stamps.py`。
- 網站應用於個人集郵資訊整理，不代表中華郵政官方承諾；尤其補蓋期限遇假日或活動條件、原戳與癸戳差異等，應以郵局公告及現場回覆為準。
- `data/verified_addresses.json` 是人工核對的收件資訊。新增場次若官方只寫收件單位、不列地址，本站**不會自動猜測完整地址**。

## 在自己的 Windows 電腦測試

1. 安裝 Python 3（或開啟已安裝的 Python）。
2. 在此資料夾按住 `Shift` + 滑鼠右鍵 → **在終端機開啟**。
3. 執行 `python -m http.server 8000`，在瀏覽器開啟 `http://localhost:8000`。
4. 停止測試時在終端機按 `Ctrl+C`。

> 不建議直接雙擊 index.html，部分瀏覽器會因為 file:// 安全機制阻擋讀取 data/stamps.json。

## 手動更新資料

如果上線之後想立刻同步，不用等每天的排程：GitHub 專案 → **Actions → 每日更新臨時郵局並發布網站 → Run workflow**。

## 資料來源

[中華郵政 臨時郵局戳圖](https://www.post.gov.tw/post/internet/Philately/index.jsp?ID=507)。

## 排程注意

GitHub 的每日排程會有延遲，並不保證 08:17 準時執行。公開儲存庫長期沒有活動時，GitHub 也可能自動停用排程；若發現資料不再更新，請先到 **Actions** 查看最近一次執行紀錄與啟用狀態。

GitHub 上傳完並設定 Pages 才會產生公開網址；單純下載此 ZIP 或已連接 ChatGPT 的 GitHub 帳號，不會自動上線。

## 程式檢查紀錄（2026-11-06）

- 前端以瀏覽器注入本地 JSON 測試：預設顯示 19 筆、搜尋「寶可夢」得到 3 筆、篩選臺北得到 10 筆。
- `python -m unittest discover -s tests -v`：5 個解析器單元測試通過。
- 已完成中華郵政實站同步與圖片下載測試；部署狀態請見儲存庫 Actions。
- 郵局地址及 10 天補蓋期限仍需視各場官網原始公告；本專案不會自動猜測 901 支局。


## 寄郵地圖與索戳指南（2026-11-18）

- `map.html` 提供郵局、郵筒／信箱、i郵箱的縣市與文字篩選、清單、定位距離排序和導航。定位只在頁面記憶體計算；清除或關閉頁面即不再保留。
- `guide.html` 提供索戳步驟、準備清單、可複製小紙條與官方規則連結；編輯內容不傳送後端、不自動儲存。
- `scripts/update_map.py offices|mailboxes|lockers` 各自抓取官方 CSV。`update_site.py` 納入既有每日四次同步，驗證座標與異常筆數，失敗重試並還原前一份有效資料。資料源異常報告僅在管理者後台顯示。
- 無效座標的資料保留於清單，可依地址導航，不猜測位置。不提供即時營業狀態、即時空櫃量或路線距離；時間以來源及現場公告為準。
- Leaflet 1.9.4 在 `vendor/` 本地載入，BSD-2-Clause 授權附於 `leaflet-LICENSE.txt`。使用者主動載入地圖後才連線 OpenStreetMap 標準圖磚，保留署名，沿用瀏覽器快取，不預抓／離線下載圖磚。可見範圍最多顯示 500 個標記，清單每次增加 30 筆。
- 官方資料：[全國營業據點](https://data.gov.tw/dataset/5950)、[郵筒／信箱](https://data.gov.tw/dataset/7964)、[i郵箱](https://data.gov.tw/dataset/52779)，政府資料開放授權條款第 1 版。
- 部署沿用 GitHub Pages、Actions 與既有 Cloudflare 管理後端，網站執行不依賴 ChatGPT 訂閱；各供應商額度及圖磚政策仍適用。大量流量時應更換合適的圖磚供應商。
- 新頁面匿名流量仍僅登入管理者可讀；地圖與指南各自記錄頁別，沒有公開流量查詢 API。
